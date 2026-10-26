import type { CommandRunInput, CommandRunResult } from "claude-code";
import type { HostPort } from "../host.ts";
import { readActiveAccount, readLabel, writeActiveAccount, writeLabel } from "../auth/accounts.ts";
import { CredentialError } from "../errors/errors.ts";
import type { ProviderPlugin } from "../providers/types.ts";
import type { Services } from "../services.ts";
import type { SelectRow } from "./pane.ts";

// `/logout`: a picker of Anthropic and every provider with a stored credential,
// disabled ones included. Anthropic hands the command to next(e); anything else
// deletes only the chosen credential.

const ANTHROPIC = "anthropic";
const TITLE = "Select provider to logout";

type Host = Pick<HostPort, "ui">;

async function logoutRows(services: Services): Promise<SelectRow[]> {
  const rows: SelectRow[] = [{ value: ANTHROPIC, label: "Anthropic (Claude Code login)" }];
  for (const plugin of services.catalog.providers()) {
    if ((await services.credentials.list(plugin.identity.id)).length > 0) {
      rows.push({ value: plugin.identity.id, label: plugin.identity.name });
    }
  }
  return rows;
}

// Several accounts open an account picker, with the active one marked and
// preselected. A single account is chosen without asking.
async function chooseAccount(host: Host, plugin: ProviderPlugin, services: Services): Promise<string | undefined> {
  const { deps } = services;
  const providerId = plugin.identity.id;
  const stored = await services.credentials.list(providerId);
  if (stored.length === 1) return stored[0]?.account;

  const active = await services.catalog.activeAccount(providerId);
  const rows: SelectRow[] = [];
  for (const entry of stored) {
    const label = (await readLabel(deps, providerId, entry.account)) ?? entry.account;
    rows.push({
      value: entry.account,
      label: entry.account === active ? `${label} (active)` : label,
    });
  }
  const picked = await services.pane.open(host, {
    kind: "select",
    title: `Select ${plugin.identity.name} account to logout`,
    rows,
    ...(active === undefined ? {} : { selected: active }),
  });
  return picked.kind === "picked" ? picked.value : undefined;
}

export async function handleLogout(
  host: Host,
  input: CommandRunInput,
  next: (input: CommandRunInput) => Promise<CommandRunResult>,
  services: Services,
): Promise<CommandRunResult> {
  await services.catalog.load();
  const picked = await services.pane.open(host, { kind: "select", title: TITLE, rows: await logoutRows(services) });
  if (picked.kind !== "picked") return { text: "Logout cancelled." };
  if (picked.value === ANTHROPIC) return next(input);

  const plugin = services.catalog.providers().find((entry) => entry.identity.id === picked.value);
  if (plugin === undefined) return { text: "Logout cancelled." };
  const account = await chooseAccount(host, plugin, services);
  if (account === undefined) return { text: "Logout cancelled." };

  const { deps, credentials, catalog } = services;
  const providerId = plugin.identity.id;
  const label = await readLabel(deps, providerId, account);
  const wasActive = (await readActiveAccount(deps, providerId)) === account;

  try {
    await credentials.delete(providerId, account);
  } catch (error) {
    if (error instanceof CredentialError) return { text: error.message };
    throw error;
  }
  await writeLabel(deps, providerId, account, undefined);
  const remaining = await credentials.list(providerId);
  if (remaining.length === 0) {
    await writeActiveAccount(deps, providerId, undefined);
    await catalog.forget(providerId);
  } else if (wasActive) {
    await writeActiveAccount(deps, providerId, remaining[0]?.account);
  }

  const suffix = plugin.login.kind === "oauth-code" && label !== undefined ? ` (${label})` : "";
  return { text: `Logged out of ${plugin.identity.name}${suffix}` };
}
