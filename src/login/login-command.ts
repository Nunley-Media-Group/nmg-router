import type { CommandRunInput, CommandRunResult } from "claude-code";
import type { HostPort } from "../host.ts";
import { runApiKeyLogin } from "../auth/api-key-login.ts";
import { completeOAuth, beginOAuth, type OAuthBegin } from "../auth/oauth-code-login.ts";
import { CredentialError, LoginError } from "../errors/errors.ts";
import type { ProviderPlugin } from "../providers/types.ts";
import type { Services } from "../services.ts";
import type { SelectRow } from "./pane.ts";

// `/login`: a picker of Anthropic and the enabled routed providers. Anthropic is
// Claude Code's own login, so the picked row hands the command to next(e) and
// nothing else in this module runs for it.

const ANTHROPIC = "anthropic";
const TITLE = "Select provider to login";

type Host = Pick<HostPort, "ui" | "process">;

async function statusOf(services: Services, plugin: ProviderPlugin): Promise<string | undefined> {
  if (plugin.login.kind === "none") return undefined;
  const stored = await services.credentials.list(plugin.identity.id);
  if (stored.length === 0) return "not logged in";
  if (services.catalog.status(plugin.identity.id) === "unauthenticated") return "invalid";
  return "✓ logged in";
}

async function loginRows(services: Services): Promise<SelectRow[]> {
  const rows: SelectRow[] = [{ value: ANTHROPIC, label: "Anthropic (Claude Code login)" }];
  for (const plugin of services.catalog.enabledProviders()) {
    const status = await statusOf(services, plugin);
    rows.push({
      value: plugin.identity.id,
      label: plugin.identity.name,
      ...(status === undefined ? {} : { status }),
    });
  }
  return rows;
}

// Opens the sign-in page in the browser. The argument list is fixed and no
// shell runs; a failure is ignored, because the URL is also in the pane.
async function openBrowser(host: Host, platform: string, url: string): Promise<void> {
  const argv =
    platform === "macos"
      ? ["open", url]
      : platform === "linux"
        ? ["xdg-open", url]
        : platform === "windows"
          ? ["rundll32", "url.dll,FileProtocolHandler", url]
          : undefined;
  if (argv === undefined) return;
  try {
    await host.process.run(argv);
  } catch {
    // The URL is shown in the pane for the person to open by hand.
  }
}

async function apiKeyFlow(host: Host, plugin: ProviderPlugin, services: Services): Promise<CommandRunResult> {
  const { identity, login } = plugin;
  if (login.kind !== "api-key") return { text: `${identity.name} needs no login.` };

  const picked = await services.pane.open(host, {
    kind: "secret",
    title: `Log in to ${identity.name}`,
    label: `${identity.name} API key`,
    hint: ["The key is checked against the provider before it is saved."],
  });
  if (picked.kind !== "submitted") return { text: "Login cancelled." };

  try {
    const text = await runApiKeyLogin(
      services.deps,
      identity,
      login,
      picked.value,
      await services.platform(),
      (providerId) => services.catalog.refresh(providerId),
    );
    return { text };
  } catch (error) {
    if (error instanceof LoginError || error instanceof CredentialError) return { text: error.message };
    throw error;
  }
}

async function oauthFlow(host: Host, plugin: ProviderPlugin, services: Services): Promise<CommandRunResult> {
  const { identity, login } = plugin;
  if (login.kind !== "oauth-code") return { text: `${identity.name} needs no login.` };

  const begun: OAuthBegin = await beginOAuth(login.config);
  host.ui.log(`Sign in to ${identity.name}: ${begun.url}`);
  await openBrowser(host, await services.platform(), begun.url);

  const picked = await services.pane.open(host, {
    kind: "text",
    title: `Log in to ${identity.name}`,
    label: "Redirect URL or code",
    lines: ["Open this URL, sign in, then paste the redirect URL (or code):", begun.url],
  });
  if (picked.kind !== "submitted") return { text: "Login cancelled." };

  try {
    const text = await completeOAuth(
      services.deps,
      identity,
      login.config,
      begun,
      picked.value,
      (providerId) => services.catalog.refresh(providerId),
    );
    return { text: text ?? "Nothing was pasted; nothing was saved." };
  } catch (error) {
    if (error instanceof LoginError || error instanceof CredentialError) return { text: error.message };
    throw error;
  }
}

export async function handleLogin(
  host: Host,
  input: CommandRunInput,
  next: (input: CommandRunInput) => Promise<CommandRunResult>,
  services: Services,
): Promise<CommandRunResult> {
  await services.catalog.load();
  const picked = await services.pane.open(host, { kind: "select", title: TITLE, rows: await loginRows(services) });
  if (picked.kind !== "picked") return { text: "Login cancelled." };
  if (picked.value === ANTHROPIC) return next(input);

  const plugin = services.catalog.enabledProviders().find((entry) => entry.identity.id === picked.value);
  if (plugin === undefined) return { text: "Login cancelled." };
  if (plugin.login.kind === "api-key") return apiKeyFlow(host, plugin, services);
  if (plugin.login.kind === "oauth-code") return oauthFlow(host, plugin, services);
  return { text: `${plugin.identity.name} needs no login.` };
}
