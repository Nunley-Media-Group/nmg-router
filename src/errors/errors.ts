// Typed errors for the guard, the provider registry and the credential store.
// Messages name a model, a provider or a platform. They never carry a secret,
// a response body or a child process's stderr.

export type CredentialErrorCode =
  | "anthropic_refused"
  | "invalid_id"
  | "keyring_locked"
  | "keyring_failed"
  | "vault_failed";

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
  readonly exitCode?: number;
};

function credentialMessage(code: CredentialErrorCode, detail: CredentialErrorDetail): string {
  const platform = detail.platform ?? "this platform";
  const provider = detail.provider ?? "the provider";
  switch (code) {
    case "anthropic_refused":
      return "Anthropic credentials are never stored.";
    case "invalid_id":
      return "Provider and account ids are lowercase letters, digits, dots, dashes or underscores, up to 64 characters.";
    case "keyring_locked":
      return `The ${platform} keyring is locked; the credential for ${provider} was not changed.`;
    case "keyring_failed":
      return `The ${platform} keyring failed for ${provider} (exit code ${detail.exitCode ?? "unknown"}).`;
    case "vault_failed":
      return `The encrypted vault failed on ${platform} for ${provider}.`;
  }
}

export class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  readonly platform: string | undefined;
  readonly provider: string | undefined;
  readonly exitCode: number | undefined;

  constructor(code: CredentialErrorCode, detail: CredentialErrorDetail = {}) {
    super(credentialMessage(code, detail));
    this.name = "CredentialError";
    this.code = code;
    this.platform = detail.platform;
    this.provider = detail.provider;
    this.exitCode = detail.exitCode;
  }
}

// Internal signal: this platform has no usable keyring. The credential store
// turns it into a vault write and never shows it to a caller.
export class NoKeyringError extends Error {
  readonly code = "no_keyring";
  readonly platform: string;

  constructor(platform: string) {
    super(`No keyring is available on ${platform}.`);
    this.name = "NoKeyringError";
    this.platform = platform;
  }
}
