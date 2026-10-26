import type { CredentialStore } from "../credentials/store.ts";
import { LoginError } from "../errors/errors.ts";
import { checkStatus, requestHeaders } from "../providers/http.ts";
import type { HttpDeps, LoginMethod, ProviderIdentity, ValidationOutcome } from "../providers/types.ts";
import { DEFAULT_ACCOUNT, encodeSecret, writeActiveAccount, type StoreDeps } from "./accounts.ts";

export type KeyValidator = (deps: HttpDeps, key: string, platform: string) => Promise<ValidationOutcome>;

// A key is accepted when the provider answers its list or identity endpoint with
// a 2xx to that key. The check runs before anything is saved.
export function apiKeyLogin(options: { readonly validate: KeyValidator }): LoginMethod {
  return { kind: "api-key", validate: options.validate };
}

export function keyCheck(url: string, headers: (platform: string) => Record<string, string>): KeyValidator {
  return (deps, key, platform) => checkStatus(deps, url, requestHeaders(headers(platform), key));
}

export type ApiKeyLoginDeps = HttpDeps &
  StoreDeps & {
    readonly credentials: CredentialStore;
  };

// Validates, then replaces the provider's credentials with one `default` account,
// makes it active, and refreshes the provider's models. A failed check saves nothing.
export async function runApiKeyLogin(
  deps: ApiKeyLoginDeps,
  identity: ProviderIdentity,
  method: Extract<LoginMethod, { kind: "api-key" }>,
  rawKey: string,
  platform: string,
  refresh: (providerId: string) => Promise<void>,
): Promise<string> {
  const key = rawKey.trim();
  if (key === "") throw new LoginError("invalid_key", { name: identity.name });

  const outcome = await method.validate(deps, key, platform);
  if (outcome.kind === "offline") throw new LoginError("offline", { name: identity.name });
  if (outcome.kind === "status") {
    const invalid = outcome.status === 401 || outcome.status === 403;
    throw new LoginError(invalid ? "invalid_key" : "validation_failed", {
      name: identity.name,
      status: outcome.status,
    });
  }

  for (const stored of await deps.credentials.list(identity.id)) {
    if (stored.account !== DEFAULT_ACCOUNT) await deps.credentials.delete(identity.id, stored.account);
  }
  await deps.credentials.save(identity.id, DEFAULT_ACCOUNT, encodeSecret({ type: "api-key", key }));
  await writeActiveAccount(deps, identity.id, DEFAULT_ACCOUNT);
  await refresh(identity.id);
  return `Logged in to ${identity.name}`;
}
