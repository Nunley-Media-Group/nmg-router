import type { CredentialStore } from "../credentials/store.ts";
import { encodeSecret, decodeSecret } from "./accounts.ts";
import { refreshTokens } from "./oauth-code-login.ts";
import type { Auth, HttpDeps, ProviderPlugin } from "../providers/types.ts";

// An OAuth access token this close to expiry is refreshed before a request uses it.
export const REFRESH_MARGIN_MS = 60_000;

export type AccessDeps = HttpDeps & {
  readonly credentials: CredentialStore;
};

// Returns the credential a request should use, or undefined when the account has
// none stored. An OAuth credential with now + 60 s >= expires is refreshed and
// saved before it is returned. An absent new refresh token keeps the old one.
export async function resolveCredential(
  deps: AccessDeps,
  plugin: ProviderPlugin,
  account: string,
  now: number = Date.now(),
): Promise<Auth | undefined> {
  const stored = await deps.credentials.read(plugin.identity.id, account);
  if (stored === undefined) return undefined;
  const secret = decodeSecret(stored);
  if (secret === undefined) return undefined;
  if (secret.type === "api-key") return { token: secret.key };

  if (now + REFRESH_MARGIN_MS < secret.expires || plugin.login.kind !== "oauth-code") {
    return { token: secret.access, accountId: secret.accountId };
  }

  const tokens = await refreshTokens(deps, plugin.login.config, plugin.identity, secret.refresh);
  const refreshed = {
    type: "oauth" as const,
    access: tokens.access,
    refresh: tokens.refresh ?? secret.refresh,
    expires: now + tokens.expiresIn * 1000,
    accountId: secret.accountId,
  };
  await deps.credentials.save(plugin.identity.id, account, encodeSecret(refreshed));
  return { token: refreshed.access, accountId: refreshed.accountId };
}
