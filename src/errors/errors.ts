export type CredentialErrorCode =
  | "anthropic_refused"
  | "invalid_id"
  | "keyring_locked"
  | "keyring_failed"
  | "vault_failed";

export class AnthropicRequestRefused extends Error {
  readonly code = "anthropic_request_refused";
  readonly model: string;

  constructor(model: string) {
    super(`Refused a routed request to "${model}": Anthropic models are answered only by Claude Code.`);
    this.name = "AnthropicRequestRefused";
    this.model = model;
  }
}

export class AnthropicResponseRejected extends Error {
  readonly code = "anthropic_response_rejected";
  readonly requested: string;
  readonly returned: string | undefined;

  constructor(requested: string, returned: string | undefined) {
    const reason = returned ? `it came from Anthropic model "${returned}"` : "it names no model";
    super(`Rejected the response to "${requested}" because ${reason}.`);
    this.name = "AnthropicResponseRejected";
    this.requested = requested;
    this.returned = returned;
  }
}

export class ProviderRejected extends Error {
  readonly code = "provider_rejected";
  readonly provider: string;

  constructor(provider: string, reason: string) {
    super(`Provider "${provider}" was rejected: ${reason}.`);
    this.name = "ProviderRejected";
    this.provider = provider;
  }
}

const CREDENTIAL_MESSAGES: Record<CredentialErrorCode, string> = {
  anthropic_refused: "Anthropic credentials are never stored",
  invalid_id: "The credential id is invalid",
  keyring_locked: "The keyring is locked",
  keyring_failed: "The keyring failed",
  vault_failed: "The encrypted vault failed",
};

export class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  readonly platform: string | undefined;
  readonly provider: string;
  readonly exitCode: number | undefined;

  constructor(code: CredentialErrorCode, provider: string, platform?: string, exitCode?: number) {
    const on = platform === undefined ? "" : ` on ${platform}`;
    const exit = exitCode === undefined ? "" : ` (exit ${exitCode})`;
    super(`${CREDENTIAL_MESSAGES[code]}${on} for provider "${provider}"${exit}.`);
    this.name = "CredentialError";
    this.code = code;
    this.platform = platform;
    this.provider = provider;
    this.exitCode = exitCode;
  }
}
