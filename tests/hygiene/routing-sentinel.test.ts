import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { collect, harness, remember, signIn, spyNext, step } from "../support/routing.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

// FR8: a sentinel credential driven through every routed success and error path never reaches a
// surface it must not: argv, environment, a request URL, a file, the store, the UI, a chunk or the status line.
describe("routed steps keep the credential out of every surface", () => {
  it("passes on a success, with the credential sent only on the child's stdin", async () => {
    const sentinel = makeSentinel();
    const h = harness({
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
      spawn: () => ({ pieces: ["HTTP/2 200\r\n\r\n", 'data: {"model":"fixture-model-1","choices":[{"index":0,"delta":{"content":"hi"}}]}\n\ndata: {"model":"fixture-model-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'] }),
    });
    await signIn(h.engine, "opencode-go", sentinel);
    remember(h.capture);
    const { chunks } = await collect(routeStep(h.router, step(0), spyNext()));

    expect(chunks.length).toBeGreaterThan(0);
    assertNoSentinel(h.engine, sentinel, [JSON.stringify(chunks), h.engine.recorded.status]);
  });

  it("passes on an error, where the provider echoes the credential back", async () => {
    const sentinel = makeSentinel();
    const failing = harness({ http: () => ({ status: 401, text: `{"error":"${sentinel}"}`, headers: { "x-echo": sentinel } }) });
    await signIn(failing.engine, "opencode-go", sentinel);
    remember(failing.capture);
    const { chunks } = await collect(routeStep(failing.router, step(0), spyNext()));

    expect(chunks.length).toBeGreaterThan(0);
    assertNoSentinel(failing.engine, sentinel, [JSON.stringify(chunks), failing.engine.recorded.status]);
  });
});
