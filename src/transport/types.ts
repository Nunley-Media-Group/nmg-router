import type { HttpRequestSpec } from "../translate/types.ts";

// A transport sends one request and yields the response's body as text pieces.
// It never retries and never sends a request to any host but the one in the spec.

export type TransportResponse = {
  readonly status: number;
  // Header names are lowercase.
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<string>;
};

export type Transport = {
  readonly name: "curl" | "fetch";
  send(spec: HttpRequestSpec, signal: AbortSignal): Promise<TransportResponse>;
};

// The host could not reach the provider. The message is never shown: the router names the failure.
export class TransportFailure extends Error {
  readonly code = "transport_failure";

  constructor() {
    super("transport failed");
    this.name = "TransportFailure";
  }
}
