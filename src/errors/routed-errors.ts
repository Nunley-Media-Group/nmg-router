import type { StreamErrorKind } from "../translate/types.ts";

// Typed errors for a routed step. A message names the provider and the failure
// and nothing else: never a response body, a header value, a credential or a
// child process's stderr. Classification may read the body, and only to choose a kind.

export type RoutedErrorKind =
  | "not_logged_in"
  | "disabled"
  | "unauthenticated"
  | "rate_limited"
  | "quota_exhausted"
  | "server_error"
  | "network"
  | "malformed"
  | "provider_error"
  | "refused"
  | "unreadable_context"
  | "internal";

export type RoutedErrorDetail = {
  readonly status?: number;
  readonly retryAfterSeconds?: number;
};

export class RoutedError extends Error {
  readonly code = "routed_error";
  readonly kind: RoutedErrorKind;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(kind: RoutedErrorKind, message: string, detail: RoutedErrorDetail = {}) {
    super(message);
    this.name = "RoutedError";
    this.kind = kind;
    this.status = detail.status;
    this.retryAfterSeconds = detail.retryAfterSeconds;
  }
}

// What went wrong on the way to the provider, without the text of it.
export type Outcome =
  | { readonly kind: "http"; readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: string }
  | { readonly kind: "stream"; readonly error: StreamErrorKind; readonly retryAfterSeconds?: number }
  | { readonly kind: "named"; readonly error: "not_logged_in" | "disabled" | "unauthenticated" | "network" | "unreadable_context" | "internal" };

const QUOTA_CODES = new Set(["insufficient_quota", "usage_limit_reached"]);

function quotaBody(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; error?: { code?: unknown } };
    const code = parsed.error?.code ?? parsed.code;
    if (typeof code === "string" && QUOTA_CODES.has(code)) return true;
  } catch {
    // Not JSON: the text check below still applies.
  }
  return /usage limit/i.test(body);
}

function numeric(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// A reset given as a Unix time (in seconds or milliseconds) is measured from now;
// a smaller number is already a wait.
function waitFromReset(value: number, now: number, unit: "ms" | "s"): number {
  const epochThreshold = unit === "ms" ? 1e12 : 1e9;
  if (value > epochThreshold) {
    const epochMs = unit === "ms" ? value : value * 1000;
    return Math.max(0, Math.ceil((epochMs - now) / 1000));
  }
  return Math.max(0, Math.ceil(unit === "ms" ? value / 1000 : value));
}

// Reads the wait from the four headers, in this order. Header names are lowercase.
export function retryAfterSeconds(headers: Readonly<Record<string, string>>, now: number): number | undefined {
  const retryMs = numeric(headers["retry-after-ms"]);
  if (retryMs !== undefined) return Math.max(0, Math.ceil(retryMs / 1000));

  const retry = headers["retry-after"];
  if (retry !== undefined) {
    const seconds = numeric(retry);
    if (seconds !== undefined) return Math.max(0, Math.ceil(seconds));
    const dated = Date.parse(retry);
    if (!Number.isNaN(dated)) return Math.max(0, Math.ceil((dated - now) / 1000));
  }

  const resetMs = numeric(headers["x-ratelimit-reset-ms"]);
  if (resetMs !== undefined) return waitFromReset(resetMs, now, "ms");
  const reset = numeric(headers["x-ratelimit-reset"]);
  if (reset !== undefined) return waitFromReset(reset, now, "s");
  return undefined;
}

export function userMessage(kind: RoutedErrorKind, provider: string, detail: RoutedErrorDetail = {}): string {
  const { status, retryAfterSeconds: wait } = detail;
  switch (kind) {
    case "not_logged_in":
      return `Not logged in to ${provider}. Run /login.`;
    case "disabled":
      return `${provider} is turned off in nmg-router's config.`;
    case "unauthenticated":
      return status === undefined
        ? `${provider} rejected the login. Run /login.`
        : `${provider} rejected the login (HTTP ${status}). Run /login.`;
    case "rate_limited":
      return wait === undefined ? `${provider} rate limit reached.` : `${provider} rate limit reached. Retry after ${wait} s.`;
    case "quota_exhausted":
      return `${provider} quota is used up.`;
    case "server_error":
      return `${provider} server error (HTTP ${status}).`;
    case "network":
      return `Could not reach ${provider}.`;
    case "malformed":
      return `${provider} sent a response nmg-router could not read.`;
    case "provider_error":
      return status === undefined ? `${provider} refused the request.` : `${provider} refused the request (HTTP ${status}).`;
    case "refused":
      return `${provider} refused the routed request.`;
    case "unreadable_context":
      return `nmg-router could not read this conversation for ${provider}.`;
    case "internal":
      return `nmg-router failed to answer with ${provider}.`;
  }
}

// Maps an outcome to its routed error. `now` is the clock the retry-after dates are read against.
export function classify(provider: string, outcome: Outcome, now: number = Date.now()): RoutedError {
  switch (outcome.kind) {
    case "named":
      return new RoutedError(outcome.error, userMessage(outcome.error, provider));
    case "stream": {
      // Every stream error kind is also a routed error kind.
      const detail = { retryAfterSeconds: outcome.retryAfterSeconds };
      return new RoutedError(outcome.error, userMessage(outcome.error, provider, detail), detail);
    }
    case "http":
      return httpError(provider, outcome, now);
  }
}

function httpError(provider: string, outcome: Extract<Outcome, { kind: "http" }>, now: number): RoutedError {
  const { status, headers, body } = outcome;
  let kind: RoutedErrorKind = "provider_error";
  let retryAfter: number | undefined;
  if (status === 401 || status === 403) kind = "unauthenticated";
  else if (status === 402) kind = "quota_exhausted";
  else if (status === 429) {
    if (quotaBody(body)) {
      kind = "quota_exhausted";
    } else {
      kind = "rate_limited";
      retryAfter = retryAfterSeconds(headers, now);
    }
  } else if (status >= 500) kind = "server_error";

  const detail = { status, retryAfterSeconds: retryAfter };
  return new RoutedError(kind, userMessage(kind, provider, detail), detail);
}

// A guard refusal already reads as a sentence that names no secret.
export function refusedError(refusal: Error): RoutedError {
  return new RoutedError("refused", refusal.message);
}
