import type { CredentialStore } from "../credentials/store.ts";
import { LoginError } from "../errors/errors.ts";
import { postForm, type HttpOutcome } from "../providers/http.ts";
import type {
  HttpDeps,
  LoginMethod,
  OAuthCodeConfig,
  OAuthIdentity,
  ProviderIdentity,
} from "../providers/types.ts";
import { decodeJwtClaims } from "./jwt.ts";
import { createPkce, randomState } from "./pkce.ts";
import { accountIdFor, encodeSecret, writeActiveAccount, writeLabel, type StoreDeps } from "./accounts.ts";

// The paste-based OAuth flow. The redirect is never listened on: the person
// signs in, then pastes the redirect URL (or the bare code) back into the pane.

export type OAuthBegin = {
  readonly url: string;
  readonly verifier: string;
  readonly state: string;
};

export type Tokens = {
  readonly access: string;
  readonly refresh: string | undefined;
  readonly expiresIn: number;
};

export function oauthCodeLogin(config: OAuthCodeConfig): LoginMethod {
  return { kind: "oauth-code", config };
}

export async function beginOAuth(config: OAuthCodeConfig): Promise<OAuthBegin> {
  const pkce = await createPkce();
  const state = randomState();
  const url = new URL(config.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state,
    ...config.extraParams,
  }).toString();
  return { url: url.toString(), verifier: pkce.verifier, state };
}

// Accepts a full redirect URL, a `code=…&state=…` string, `code#state` or a bare
// code. A state that is present and differs from the issued one is refused.
// Returns undefined when nothing usable was pasted.
export function parsePaste(
  input: string,
  expectedState: string,
  name: string,
): { readonly code: string } | undefined {
  const text = input.trim();
  if (text === "") return undefined;

  let code: string | null = null;
  let state: string | null = null;
  if (/^https?:\/\//i.test(text)) {
    let url: URL | undefined;
    try {
      url = new URL(text);
    } catch {
      url = undefined;
    }
    code = url?.searchParams.get("code") ?? null;
    state = url?.searchParams.get("state") ?? null;
  } else if (text.includes("code=")) {
    const params = new URLSearchParams(text.replace(/^\?/, ""));
    code = params.get("code");
    state = params.get("state");
  } else if (text.includes("#")) {
    const hash = text.indexOf("#");
    code = text.slice(0, hash);
    state = text.slice(hash + 1);
  } else {
    code = text;
  }

  if (state !== null && state !== "" && state !== expectedState) {
    throw new LoginError("oauth_state_mismatch", { name });
  }
  if (code === null || code.trim() === "") return undefined;
  return { code: code.trim() };
}

function readTokens(body: unknown, requireRefresh: boolean): Tokens | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.access_token !== "string" || record.access_token === "") return undefined;
  if (typeof record.expires_in !== "number" || !Number.isFinite(record.expires_in)) return undefined;
  const refresh = typeof record.refresh_token === "string" && record.refresh_token !== "" ? record.refresh_token : undefined;
  if (requireRefresh && refresh === undefined) return undefined;
  return { access: record.access_token, refresh, expiresIn: record.expires_in };
}

function tokenFailure(outcome: HttpOutcome, name: string): LoginError {
  if (outcome.kind === "offline") return new LoginError("offline", { name });
  if (outcome.kind === "status") return new LoginError("oauth_exchange_failed", { name, status: outcome.status });
  return new LoginError("oauth_exchange_failed", { name });
}

export async function exchangeCode(
  deps: HttpDeps,
  config: OAuthCodeConfig,
  identity: ProviderIdentity,
  code: string,
  verifier: string,
): Promise<Tokens> {
  const outcome = await postForm(deps, config.tokenUrl, {
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: config.redirectUri,
  });
  if (outcome.kind !== "ok") throw tokenFailure(outcome, identity.name);
  const tokens = readTokens(outcome.body, true);
  if (tokens === undefined) throw new LoginError("oauth_exchange_failed", { name: identity.name });
  return tokens;
}

// A refresh that returns no new refresh token keeps the old one (see access-token).
export async function refreshTokens(
  deps: HttpDeps,
  config: OAuthCodeConfig,
  identity: ProviderIdentity,
  refreshToken: string,
): Promise<Tokens> {
  const outcome = await postForm(deps, config.tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (outcome.kind === "offline") throw new LoginError("offline", { name: identity.name });
  if (outcome.kind !== "ok") {
    throw new LoginError("refresh_failed", {
      name: identity.name,
      status: outcome.kind === "status" ? outcome.status : undefined,
    });
  }
  const tokens = readTokens(outcome.body, false);
  if (tokens === undefined) throw new LoginError("refresh_failed", { name: identity.name });
  return tokens;
}

export type OAuthDeps = HttpDeps &
  StoreDeps & {
    readonly credentials: CredentialStore;
  };

function identityFrom(config: OAuthCodeConfig, access: string, name: string): OAuthIdentity & { accountId: string } {
  const claims = decodeJwtClaims(access) ?? {};
  const identity = config.identity(claims);
  if (identity.accountId === undefined || identity.accountId === "") {
    throw new LoginError("oauth_no_account", { name });
  }
  return { ...identity, accountId: identity.accountId };
}

// Exchanges the pasted code, saves the tokens and expiry under the account id,
// makes that account active, stores its label, and refreshes the provider.
export async function completeOAuth(
  deps: OAuthDeps,
  identity: ProviderIdentity,
  config: OAuthCodeConfig,
  begun: OAuthBegin,
  pasted: string,
  refresh: (providerId: string) => Promise<void>,
): Promise<string | undefined> {
  const parsed = parsePaste(pasted, begun.state, identity.name);
  if (parsed === undefined) return undefined;

  const tokens = await exchangeCode(deps, config, identity, parsed.code, begun.verifier);
  const claims = identityFrom(config, tokens.access, identity.name);
  const account = accountIdFor(claims.accountId);
  await deps.credentials.save(
    identity.id,
    account,
    encodeSecret({
      type: "oauth",
      access: tokens.access,
      refresh: tokens.refresh ?? "",
      expires: Date.now() + tokens.expiresIn * 1000,
      accountId: claims.accountId,
    }),
  );
  await writeActiveAccount(deps, identity.id, account);
  const label = claims.email === undefined ? undefined : `${claims.email}${claims.plan ? ` (${claims.plan})` : ""}`;
  await writeLabel(deps, identity.id, account, label);
  await refresh(identity.id);
  return label === undefined
    ? `Logged in to ${identity.name}`
    : `Logged in to ${identity.name} as ${claims.email}`;
}
