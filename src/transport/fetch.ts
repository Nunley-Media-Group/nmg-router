import type { HostPort } from "../host.ts";
import type { HttpRequestSpec } from "../translate/types.ts";
import { TransportFailure, type Transport, type TransportResponse } from "./types.ts";

// The whole-response path: one `$.http.fetch` call, with the body fed to the
// parser at once. Used where no system `curl` exists, so nothing streams.

async function* whole(text: string): AsyncGenerator<string> {
  if (text !== "") yield text;
}

export function fetchTransport(http: HostPort["http"]): Transport {
  return {
    name: "fetch",
    async send(spec: HttpRequestSpec, signal: AbortSignal): Promise<TransportResponse> {
      if (signal.aborted) throw new TransportFailure();
      let reply: Awaited<ReturnType<HostPort["http"]["fetch"]>>;
      try {
        reply = await http.fetch(spec.url, { method: spec.method, headers: { ...spec.headers }, body: spec.body });
      } catch {
        throw new TransportFailure();
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(reply.headers)) headers[name.toLowerCase()] = value;
      return { status: reply.status, headers, body: whole(reply.text) };
    },
  };
}
