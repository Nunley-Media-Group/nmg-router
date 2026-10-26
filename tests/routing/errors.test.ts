import { describe, expect, it } from "vitest";
import { routeStep, routeStepFailed } from "../../src/routing/turn-step.ts";
import {
  CHAT_URL,
  blockKinds,
  chatTurn,
  collect,
  harness,
  onEngine,
  postsTo,
  remember,
  replies,
  signIn,
  spyNext,
  step,
  textOf,
  MODEL,
} from "../support/routing.ts";

const PROVIDER = "OpenCode Go";

// AC9: each failure ends with its message and an end of turn, sets the error state, never calls next,
// and sends exactly one request (none for a missing login).
describe("clear errors and no fallback", () => {
  const cases: [string, Parameters<typeof replies>[0] | undefined, string][] = [
    ["a 401", "401", `${PROVIDER} rejected the login (HTTP 401). Run /login.`],
    ["a 429 with retry-after", "429-retry", `${PROVIDER} rate limit reached. Retry after 12 s.`],
    ["a quota body", "429-quota", `${PROVIDER} quota is used up.`],
    ["a 5xx", "500", `${PROVIDER} server error (HTTP 500).`],
    ["an unparseable response", "malformed", `${PROVIDER} sent a response nmg-router could not read.`],
    ["a network failure", undefined, `Could not reach ${PROVIDER}.`],
  ];

  function responderFor(kind: string | undefined) {
    switch (kind) {
      case "401":
        return () => ({ status: 401, text: '{"error":"bad key"}' });
      case "429-retry":
        return () => ({ status: 429, headers: { "retry-after": "12" }, text: "{}" });
      case "429-quota":
        return () => ({ status: 429, text: '{"error":{"code":"insufficient_quota"}}' });
      case "500":
        return () => ({ status: 500, text: "boom" });
      case "malformed":
        return () => ({ status: 200, text: "this is not an event stream\n\n" });
      default:
        return () => undefined;
    }
  }

  it.each(cases)("answers %s with its message, the error state, and no next", async (_label, kind, message) => {
    const h = harness({ http: responderFor(kind) });
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();
    const { chunks } = await collect(routeStep(h.router, step(0), next));

    expect(textOf(chunks)).toBe(message);
    expect(chunks.at(-1)).toEqual({ kind: "stop", stopReason: "end_turn", usage: null });
    expect(h.engine.recorded.status.at(-1)).toMatch(/ error: /);
    expect(next.calls).toEqual([]);
    expect(postsTo(h.engine, CHAT_URL)).toHaveLength(1);
  });

  it("answers a missing login with no request at all", async () => {
    const h = harness({ http: replies(chatTurn({ text: "never" })) });
    remember(h.capture);
    const next = spyNext();
    const { chunks } = await collect(routeStep(h.router, step(0), next));

    expect(textOf(chunks)).toBe(`Not logged in to ${PROVIDER}. Run /login.`);
    expect(postsTo(h.engine, CHAT_URL)).toEqual([]);
    expect(next.calls).toEqual([]);
  });

  it("clears the error state on the next success", async () => {
    const h = harness({ http: replies(chatTurn({ text: "fine" })) });
    await signIn(h.engine);
    remember(h.capture);
    h.engine.recorded.status.push(`${MODEL} · ${PROVIDER} error: network`);
    await collect(routeStep(h.router, step(0), spyNext()));

    expect(h.engine.recorded.status.at(-1)).toBe(`${MODEL} · thinking unsupported`);
  });

  it("answers a failed routed hook through the catch handler, and replays a Claude step through next", async () => {
    const h = harness();
    await signIn(h.engine);
    remember(h.capture);

    const routed = Object.assign(spyNext(), { error: new Error("hook blew up") });
    const failed = await collect(routeStepFailed(h.router, step(0), routed));
    expect(textOf(failed.chunks)).toBe(`nmg-router failed to answer with ${PROVIDER}.`);
    expect(routed.calls).toEqual([]);

    const claude = Object.assign(spyNext(), { error: new Error("hook blew up") });
    const replayed = await collect(routeStepFailed(h.router, step(1, "claude-haiku-5-5"), claude));
    expect(textOf(replayed.chunks)).toBe("from claude");
    expect(claude.calls).toHaveLength(1);
  });

  it("answers a hook the engine failed mid-stream in a block of its own, so the message is shown", async () => {
    const h = harness({
      http: replies(chatTurn({ thinking: "Let me read it.", tool: { id: "call_1", name: "Read", input: { file_path: "notes.txt" } } })),
    });
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();
    const run = await onEngine(h.router, step(0), next, (chunk) => (chunk.kind === "tool" ? "refused" : undefined));

    expect(run.caught).toBe(true);
    expect(blockKinds(run.chunks)).toEqual(["thinking", "text"]);
    expect(run.chunks).toContainEqual({ kind: "text", index: 1, text: `nmg-router failed to answer with ${PROVIDER}.` });
    expect(run.chunks.at(-1)).toEqual({ kind: "stop", stopReason: "end_turn", usage: null });
    expect(h.engine.recorded.status.at(-1)).toBe(`${MODEL} · ${PROVIDER} error: internal`);
    expect(next.calls).toEqual([]);
    expect(postsTo(h.engine, CHAT_URL)).toHaveLength(1);
  });
});
