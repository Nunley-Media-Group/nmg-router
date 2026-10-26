// Typed errors for the guard, the provider registry, the credential store and
// the login flows. Messages name a model, a provider, a platform or a config
// path. They never carry a secret, a response body or a child process's stderr.

export type CredentialErrorCode = "anthropic_refused" | "invalid_id" | "vault_failed";

const REQUEST_REASONS = {
  provider: "its provider is anthropic",
  host: "its base URL is an Anthropic host",
  model: "it names an Anthropic model",
} as const;

export class AnthropicRequestRefused extends Error {
  readonly code = "anthropic_request_refused";
  readonly model: string;
  readonly reason: keyof typeof REQUEST_REASONS;

  constructor(model: string, reason: keyof typeof REQUEST_REASONS) {
    super(`Refused a routed request for "${model}": ${REQUEST_REASONS[reason]}.`);
    this.name = "AnthropicRequestRefused";
    this.model = model;
    this.reason = reason;
  }
}

export class AnthropicResponseRejected extends Error {
  readonly code = "anthropic_response_rejected";
  readonly requested: string;
  readonly returned: string | undefined;

  constructor(requested: string, returned: string | undefined) {
    super(
      returned === undefined
        ? `Rejected the response to "${requested}": it names no model.`
        : `Rejected the response to "${requested}": it came from Anthropic model "${returned}".`,
    );
    this.name = "AnthropicResponseRejected";
    this.requested = requested;
    this.returned = returned;
  }
}

export class ProviderRejected extends Error {
  readonly code = "provider_rejected";
  readonly providerId: string;
  readonly reason: "id" | "host";

  constructor(providerId: string, reason: "id" | "host") {
    super(
      reason === "id"
        ? `Rejected provider "${providerId}": the mod has no Anthropic provider.`
        : `Rejected provider "${providerId}": its base URL is an Anthropic host.`,
    );
    this.name = "ProviderRejected";
    this.providerId = providerId;
    this.reason = reason;
  }
}

export type CredentialErrorDetail = {
  readonly platform?: string;
  readonly provider?: string;
};

function credentialMessage(code: CredentialErrorCode, detail: CredentialErrorDetail): string {
  const platform = detail.platform ?? "this platform";
  const provider = detail.provider ?? "the provider";
  switch (code) {
    case "anthropic_refused":
      return "Anthropic credentials are never stored.";
    case "invalid_id":
      return "Provider and account ids are lowercase letters, digits, dots, dashes or underscores, up to 64 characters.";
    case "vault_failed":
      return `The encrypted vault failed on ${platform} for ${provider}.`;
  }
}

export class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  readonly platform: string | undefined;
  readonly provider: string | undefined;

  constructor(code: CredentialErrorCode, detail: CredentialErrorDetail = {}) {
    super(credentialMessage(code, detail));
    this.name = "CredentialError";
    this.code = code;
    this.platform = detail.platform;
    this.provider = detail.provider;
  }
}

export type LoginErrorCode =
  | "invalid_key"
  | "validation_failed"
  | "offline"
  | "oauth_state_mismatch"
  | "oauth_exchange_failed"
  | "oauth_no_account"
  | "refresh_failed"
  | "cancelled";

export type LoginErrorDetail = {
  // The provider's display name, never its key, token or response body.
  readonly name: string;
  readonly status?: number;
};

function loginMessage(code: LoginErrorCode, detail: LoginErrorDetail): string {
  const { name, status } = detail;
  const statusNote = status === undefined ? "" : ` (HTTP ${status})`;
  switch (code) {
    case "invalid_key":
      return `Invalid ${name} API key; nothing was saved.`;
    case "validation_failed":
      return `Could not validate the ${name} key${statusNote}; nothing was saved.`;
    case "offline":
      return `Could not reach ${name} to validate the sign-in; nothing was saved.`;
    case "oauth_state_mismatch":
      return `The pasted ${name} redirect does not match this sign-in; nothing was saved.`;
    case "oauth_exchange_failed":
      return `${name} did not issue tokens${statusNote}; nothing was saved.`;
    case "oauth_no_account":
      return `${name} returned no account id; nothing was saved.`;
    case "refresh_failed":
      return `Could not refresh the ${name} sign-in${statusNote}; sign in again with /login.`;
    case "cancelled":
      return `${name} login cancelled.`;
  }
}

export class LoginError extends Error {
  readonly code: LoginErrorCode;
  readonly providerName: string;
  readonly status: number | undefined;

  constructor(code: LoginErrorCode, detail: LoginErrorDetail) {
    super(loginMessage(code, detail));
    this.name = "LoginError";
    this.code = code;
    this.providerName = detail.name;
    this.status = detail.status;
  }
}

export type ConfigProblemCode =
  | "malformed_file"
  | "invalid_id"
  | "invalid_entry"
  | "builtin_id"
  | "anthropic_entry"
  | "credential";

// A config problem names the file or entry path and never the value that caused it.
export class ConfigProblem extends Error {
  readonly code: ConfigProblemCode;
  readonly path: string;

  constructor(code: ConfigProblemCode, path: string, providerId?: string) {
    super(configMessage(code, path, providerId));
    this.name = "ConfigProblem";
    this.code = code;
    this.path = path;
  }
}

function configMessage(code: ConfigProblemCode, path: string, providerId: string | undefined): string {
  const id = providerId ?? "the provider";
  switch (code) {
    case "malformed_file":
      return `${path} is not valid JSON, so no providers were loaded from it.`;
    case "invalid_id":
      return `Config entry ${path} has an invalid provider id and was ignored.`;
    case "invalid_entry":
      return `Config entry ${path} needs a baseUrl and an api of openai-completions, openai-responses or anthropic-messages; it was ignored.`;
    case "builtin_id":
      return `Config entry ${path} names a built-in provider and was ignored. Use /login to sign in to ${id}.`;
    case "anthropic_entry":
      return `Config entry ${path} names Anthropic and was ignored. Use /login to sign in to Anthropic through Claude Code.`;
    case "credential":
      return `Config entry ${path} looks like a credential and was ignored. Use /login to sign in to ${id}.`;
  }
}
