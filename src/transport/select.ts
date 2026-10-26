import type { HostPort } from "../host.ts";
import { curlTransport, type Spawn } from "./curl.ts";
import { fetchTransport } from "./fetch.ts";
import type { Transport } from "./types.ts";

// Picks `curl` when it runs, else the whole-response fetch. The choice is made
// once per session and kept, so the probe runs one time.

export type SelectHost = {
  readonly process: Pick<HostPort["process"], "run">;
  readonly http: HostPort["http"];
  readonly spawn: Spawn;
};

async function choose(host: SelectHost): Promise<Transport> {
  try {
    const probe = await host.process.run(["curl", "--version"]);
    if (probe.exitCode === 0) return curlTransport(host.spawn);
  } catch {
    // curl could not start: fall through to the whole-response path.
  }
  return fetchTransport(host.http);
}

export function createTransportSelector(host: SelectHost): () => Promise<Transport> {
  let selected: Promise<Transport> | undefined;
  return () => (selected ??= choose(host));
}
