import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import type { TurnStepChunk } from "claude-code";
import { CHAT_URL, HEAD, MODEL, harness, postsTo, remember, signIn, spyNext, step, textOf } from "../support/routing.ts";

const TEXT = 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{"content":"Reading "}}]}\n\n';
const TOOL_START = 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"Read","arguments":""}}]}}]}\n\n';
const FINISH = 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n';
const ARGS_1 = 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"file_"}}]}}]}\n\n';
const ARGS_2 = 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"path\\":\\"notes.txt\\"}"}}]}}]}\n\n';
const USAGE = 'data: {"model":"fixture-model-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: [DONE]\n\n';

// Drives a routed step like the engine does, recording when each chunk leaves the hook.
async function consume(
  stream: AsyncGenerator<TurnStepChunk, unknown>,
  events: string[],
  onChunk?: (chunk: TurnStepChunk) => void,
): Promise<TurnStepChunk[]> {
  const chunks: TurnStepChunk[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done === true) return chunks;
    chunks.push(next.value);
    events.push(`chunk:${next.value.kind}`);
    onChunk?.(next.value);
  }
}

// AC7: text as it arrives, a tool call once its input is whole, secrets on stdin only, abort, metrics, and fetch without curl.
describe("streaming a routed step", () => {
  it("yields text before the child ends and a tool call once its input is complete", async () => {
    const h = harness({
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
      spawn: () => ({ pieces: [HEAD, TEXT, TOOL_START, ARGS_1, ARGS_2, FINISH, USAGE] }),
    });
    await signIn(h.engine);
    remember(h.capture);
    const events = h.engine.recorded.events;
    const chunks = await consume(routeStep(h.router, step(0), spyNext()), events);

    expect(textOf(chunks)).toBe("Reading ");
    expect(events.indexOf("chunk:text")).toBeLessThan(events.indexOf("child:exit"));
    expect(events.indexOf("chunk:tool")).toBeGreaterThan(events.indexOf("child:piece:6"));
    expect(events.indexOf("chunk:input")).toBeGreaterThan(events.indexOf("chunk:tool"));
    expect(chunks).toContainEqual({ kind: "input", index: 1, json: '{"file_path":"notes.txt"}' });
  });

  it("sends the credential and body on the child's stdin, never in argv or the environment", async () => {
    const h = harness({
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
      spawn: () => ({ pieces: [HEAD, TEXT, FINISH, USAGE] }),
    });
    await signIn(h.engine, "opencode-go", "stdin-key");
    remember(h.capture);
    await consume(routeStep(h.router, step(0), spyNext()), []);

    const call = h.engine.recorded.processes.find((process) => process.argv[0] === "curl" && process.argv[1] !== "--version");
    expect(call?.argv.join(" ")).not.toContain("stdin-key");
    expect(call?.env).toBeUndefined();
    expect(call?.stdin).toContain('header = "authorization: Bearer stdin-key"');
    expect(call?.stdin).toContain("data-binary =");
  });

  it("stops the chunks and ends the child when the signal aborts", async () => {
    const controller = new AbortController();
    const h = harness({
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
      spawn: () => ({ pieces: [HEAD, TEXT, TEXT, TEXT], hang: true }),
    });
    await signIn(h.engine);
    remember(h.capture);
    const events = h.engine.recorded.events;
    const chunks = await consume(routeStep(h.router, step(0), spyNext(controller.signal)), events, () => controller.abort());

    expect(chunks).toHaveLength(1);
    expect(events).toContain("child:killed");
  });

  it("records time to first token for the model and logs it to debug", async () => {
    const h = harness({
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
      spawn: () => ({ pieces: [HEAD, TEXT, FINISH, USAGE] }),
    });
    await signIn(h.engine);
    remember(h.capture);
    await consume(routeStep(h.router, step(0), spyNext()), []);

    const speed = h.engine.recorded.storeWrites.filter((write) => write.key === "metrics.speed").at(-1)?.value as Record<string, { ttftMs?: number }>;
    expect(typeof speed[MODEL]?.ttftMs).toBe("number");
    expect(h.engine.recorded.debug.some((line) => line.startsWith(`speed ${MODEL}:`))).toBe(true);
  });

  it("falls back to one whole-response fetch of the same provider URL when curl is absent", async () => {
    const h = harness({ http: (request) => (request.url === CHAT_URL ? { status: 200, text: TEXT + FINISH + USAGE } : undefined) });
    await signIn(h.engine);
    remember(h.capture);
    const chunks = await consume(routeStep(h.router, step(0), spyNext()), []);

    expect(textOf(chunks)).toBe("Reading ");
    const requests = postsTo(h.engine, CHAT_URL);
    expect(requests).toHaveLength(1);
    expect(h.engine.recorded.processes.filter((process) => process.argv[0] === "curl")).toHaveLength(1);
  });
});
