import type { HostPort } from "../host.ts";

// The shapes every provider plugin, catalog and login flow shares. This file
// holds types only, so nothing here reaches a host call or a store.

export type WireFormat = "openai-completions" | "openai-responses" | "anthropic-messages" | "openai-codex-responses";

export type Effort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

// USD per million tokens.
export type Price = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export type HttpDeps = Pick<HostPort, "http">;

// A stored credential as a request sees it. OAuth credentials carry an account id.
export type Auth = { token: string; accountId?: string };

// What a provider needs about the host and the active credential to build a request.
export type ProviderContext = { platform: string; auth?: Auth };

export type HeaderContext = { platform: string; accountId?: string };

export type ProviderIdentity = {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly headers?: (context: HeaderContext) => Record<string, string>;
};

export type ValidationOutcome = { kind: "ok" } | { kind: "status"; status: number } | { kind: "offline" };

export type OAuthIdentity = { accountId?: string; email?: string; plan?: string };

export type OAuthCodeConfig = {
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly extraParams: Readonly<Record<string, string>>;
  readonly identity: (claims: Readonly<Record<string, unknown>>) => OAuthIdentity;
};

export type LoginMethod =
  | {
      readonly kind: "api-key";
      validate(deps: HttpDeps, key: string, platform: string): Promise<ValidationOutcome>;
    }
  | { readonly kind: "oauth-code"; readonly config: OAuthCodeConfig }
  | { readonly kind: "none" };

// One model as a provider's list endpoint or a bundled table supplies it.
export type RawModel = {
  readonly id: string;
  readonly name?: string;
  readonly contextWindow?: number;
  readonly maxOutput?: number;
  readonly reasoningEfforts?: readonly Effort[];
  readonly vision?: boolean;
  readonly price?: Price;
  readonly wire?: WireFormat;
};

export type DiscoveryOutcome =
  | { kind: "ok"; models: readonly RawModel[] }
  | { kind: "unauthenticated" | "unavailable" | "empty" | "offline" };

export type ModelSource = {
  list(deps: HttpDeps, context: ProviderContext): Promise<DiscoveryOutcome>;
};

export type ResolvedWire = { readonly wire: WireFormat; readonly baseUrl: string };

// The bundled metadata's wire, when present, is passed in as the second argument.
export type WireResolver = (modelId: string, metadataWire?: WireFormat) => ResolvedWire;

export type ProviderPlugin = {
  readonly identity: ProviderIdentity;
  readonly login: LoginMethod;
  readonly models: ModelSource;
  readonly wire: WireResolver;
};

export type CatalogModel = {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly name: string;
  readonly wire: WireFormat;
  readonly baseUrl: string;
  readonly contextWindow?: number;
  readonly maxOutput?: number;
  readonly reasoningEfforts?: readonly Effort[];
  readonly vision?: boolean;
  readonly price?: Price;
  readonly cached?: boolean;
};
