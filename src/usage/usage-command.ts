import type { CommandRunInput, CommandRunResult } from "claude-code";
import { resolveCredential } from "../auth/access-token.ts";
import type { Auth, HttpDeps, ProviderPlugin } from "../providers/types.ts";
import type { Catalog } from "../catalog/catalog.ts";
import type { CredentialStore } from "../credentials/store.ts";
import { LoginError } from "../errors/errors.ts";
import type { UsageMonitor } from "./monitor.ts";
import { renderUsageEntries, type UsageEntry } from "./render.ts";
import type { UsageFailureKind, UsageOutcome } from "./report.ts";

// The `/usage` hook's body. Claude Code's own view runs first, unchanged. Then each
// enabled provider the person is logged in to gets an entry, read through the shared
// monitor with the active account's credential. One provider's failure is its own entry.

export type UsageCommandDeps = {
  readonly catalog: Pick<Catalog, "load" | "enabledProviders" | "activeAccount">;
  readonly credentials: CredentialStore;
  readonly http: HttpDeps["http"];
  readonly platform: () => Promise<string>;
  readonly monitor: UsageMonitor;
  readonly now: () => number;
};

type CommandNext = (input: CommandRunInput) => Promise<CommandRunResult>;

// The providers that need a login and have a stored one, by name. A provider without a usage source still has an entry.
async function loggedInProviders(deps: UsageCommandDeps): Promise<ProviderPlugin[]> {
  await deps.catalog.load();
  const rows: ProviderPlugin[] = [];
  for (const plugin of deps.catalog.enabledProviders()) {
    if (plugin.login.kind === "none") continue;
    if ((await deps.credentials.list(plugin.identity.id)).length > 0) rows.push(plugin);
  }
  return rows.sort((a, b) => a.identity.name.localeCompare(b.identity.name));
}

// The active account's credential, or the failure kind that says why there is none. Only the kind leaves here.
async function credentialOf(deps: UsageCommandDeps, plugin: ProviderPlugin, account: string): Promise<Auth | UsageFailureKind> {
  try {
    const auth = await resolveCredential({ http: deps.http, credentials: deps.credentials }, plugin, account, deps.now());
    return auth ?? "unauthenticated";
  } catch (error) {
    return error instanceof LoginError && error.code === "offline" ? "offline" : "unauthenticated";
  }
}

// One provider's reading. A provider with no usage source has nothing to read. Any failure is that provider's alone.
async function readingOf(deps: UsageCommandDeps, plugin: ProviderPlugin): Promise<UsageOutcome | "none"> {
  const source = plugin.usage;
  if (source === undefined) return "none";
  const provider = plugin.identity.id;
  try {
    const account = await deps.catalog.activeAccount(provider);
    if (account === undefined) return { kind: "unauthenticated" };
    const auth = await credentialOf(deps, plugin, account);
    if (typeof auth === "string") return { kind: auth };
    const context = { platform: await deps.platform(), auth };
    return await deps.monitor.read(provider, account, () => source.read({ http: deps.http }, context));
  } catch {
    return { kind: "unavailable" };
  }
}

// Claude Code's `/usage` text first, then the entries. With no provider logged in, the result is Claude Code's own, unchanged.
export async function handleUsage(deps: UsageCommandDeps, input: CommandRunInput, next: CommandNext): Promise<CommandRunResult> {
  const result = await next(input);
  try {
    const rows = await loggedInProviders(deps);
    if (rows.length === 0) return result;
    const entries: UsageEntry[] = await Promise.all(
      rows.map(async (plugin) => ({ name: plugin.identity.name, reading: await readingOf(deps, plugin) })),
    );
    const usage = renderUsageEntries(entries, deps.now());
    const builtIn = result.text === undefined || result.text === "" ? [] : [result.text];
    return { ...result, text: [...builtIn, usage].join("\n\n") };
  } catch {
    // A failed listing adds nothing; Claude Code's own view still stands.
    return result;
  }
}
