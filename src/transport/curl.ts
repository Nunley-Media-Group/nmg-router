import type { HookStream, ProcessSpawnChunk, ProcessSpawnRequest, ProcessSpawnResult } from "claude-code";
import type { HttpRequestSpec } from "../translate/types.ts";
import { TransportFailure, type Transport, type TransportResponse } from "./types.ts";

// Streams a request through a child `curl`. The URL is the only request value in
// argv. Headers, credential and body go in the config read from stdin, so none of
// them reaches argv or the environment.

export type Spawn = (request: ProcessSpawnRequest) => HookStream<ProcessSpawnChunk, ProcessSpawnResult>;

const ARGS = ["--silent", "--show-error", "--no-buffer", "--include", "--proto", "=https", "--connect-timeout", "30", "--config", "-"];

const ESCAPES: Readonly<Record<string, string>> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };

// curl reads a quoted config value with backslash escapes.
export function quote(value: string): string {
  return `"${value.replace(/[\\"\n\r\t]/g, (ch) => ESCAPES[ch] ?? ch)}"`;
}

export function curlArgv(url: string): string[] {
  return ["curl", ...ARGS, url];
}

export function curlConfig(spec: HttpRequestSpec): string {
  const lines = [`request = ${quote(spec.method)}`];
  for (const [name, value] of Object.entries(spec.headers)) lines.push(`header = ${quote(`${name}: ${value}`)}`);
  lines.push(`data-binary = ${quote(spec.body)}`);
  return `${lines.join("\n")}\n`;
}

type Head = { readonly status: number; readonly headers: Record<string, string>; readonly rest: string };

const BLOCK_END = /\r?\n\r?\n/;

// Reads the final header block of the text so far. Interim blocks (100 Continue,
// a proxy's connection notice) are skipped. Undefined means the block is still incomplete.
export function readHead(text: string): Head | undefined {
  let remaining = text;
  for (;;) {
    const end = BLOCK_END.exec(remaining);
    if (end === null) return undefined;
    const block = remaining.slice(0, end.index);
    remaining = remaining.slice(end.index + end[0].length);
    const [statusLine = "", ...lines] = block.split(/\r?\n/);
    const match = /^HTTP\/\S+\s+(\d{3})/.exec(statusLine);
    if (match === null) throw new TransportFailure();
    const status = Number(match[1]);
    if ((status >= 100 && status < 200) || /connection established/i.test(statusLine)) continue;
    const headers: Record<string, string> = {};
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    return { status, headers, rest: remaining };
  }
}

const ABORTED = Symbol("aborted");

// What the stream returns when this side ends it: the child is killed, not read.
const ENDED: ProcessSpawnResult = { code: null, signal: null };

function onAbort(signal: AbortSignal): Promise<typeof ABORTED> {
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(ABORTED), { once: true }));
}

export function curlTransport(spawn: Spawn): Transport {
  return {
    name: "curl",
    async send(spec: HttpRequestSpec, signal: AbortSignal): Promise<TransportResponse> {
      if (signal.aborted) throw new TransportFailure();
      const child = spawn({ argv: curlArgv(spec.url), input: curlConfig(spec) });
      const aborted = onAbort(signal);
      let buffer = "";
      for (;;) {
        const step = await Promise.race([child.next(), aborted]);
        if (step === ABORTED) {
          void child.return(ENDED);
          throw new TransportFailure();
        }
        if (step.done === true) throw new TransportFailure();
        if (step.value.stream !== "stdout") continue;
        buffer += step.value.text;
        const head = readHead(buffer);
        if (head === undefined) continue;
        return { status: head.status, headers: head.headers, body: bodyOf(child, head.rest, signal, aborted) };
      }
    },
  };
}

// The rest of stdout, as it arrives. An abort ends the child and the pieces with it.
async function* bodyOf(
  child: HookStream<ProcessSpawnChunk, ProcessSpawnResult>,
  first: string,
  signal: AbortSignal,
  aborted: Promise<typeof ABORTED>,
): AsyncGenerator<string> {
  if (first !== "") yield first;
  for (;;) {
    // Checked first: a piece already buffered must not outrun an abort that has happened.
    if (signal.aborted) {
      void child.return(ENDED);
      return;
    }
    const step = await Promise.race([child.next(), aborted]);
    if (step === ABORTED) {
      void child.return(ENDED);
      return;
    }
    if (step.done === true) return;
    if (step.value.stream === "stdout") yield step.value.text;
  }
}
