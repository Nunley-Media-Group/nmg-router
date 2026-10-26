import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, MODEL, SESSION, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step, textOf, userText } from "../support/routing.ts";

const CLAUDE = "claude-sonnet-5-5";

// AC3: each loop's steps are answered by the model they name. A routed subagent reads its own transcript
// and prompt, a Claude subagent passes through, and no subagent step moves the main status line.
describe("subagent steps by their own model", () => {
  it("answers a routed subagent from its own transcript and captured prompt, and never calls next", async () => {
    const h = harness({
      http: replies(chatTurn({ text: "Sub done." })),
      session: { id: SESSION, messages: [userText("Main task")], agents: { "agent-1": [userText("Sub task")] } },
    });
    await signIn(h.engine);
    remember(h.capture, MODEL, "SUBAGENT PROMPT");
    const next = spyNext();

    const { chunks } = await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), next));

    expect(textOf(chunks)).toBe("Sub done.");
    expect(next.calls).toEqual([]);
    const body = JSON.parse(postsTo(h.engine, CHAT_URL)[0]?.body ?? "{}") as { messages: unknown[] };
    expect(body.messages[0]).toEqual({ role: "system", content: "SUBAGENT PROMPT" });
    expect(JSON.stringify(body.messages)).toContain("Sub task");
    expect(JSON.stringify(body.messages)).not.toContain("Main task");
    expect(h.tracker.model("agent-1")).toBe(MODEL);
  });

  it("passes a Claude subagent through to next, untouched, under a routed main loop", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Main." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    const next = spyNext();

    const { chunks } = await collect(routeStep(h.router, step(0, CLAUDE, { agentId: "agent-2" }), next));

    expect(next.calls).toEqual([expect.objectContaining({ agentId: "agent-2", model: CLAUDE })]);
    expect(textOf(chunks)).toBe("from claude");
    expect(postsTo(h.engine, CHAT_URL)).toHaveLength(1);
    expect(h.tracker.model("agent-2")).toBe(CLAUDE);
  });

  it("leaves the main status line as the main loop set it", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Main." }), chatTurn({ text: "Sub." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    const afterMain = h.engine.recorded.status.length;
    expect(afterMain).toBe(1);

    await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    expect(h.engine.recorded.status).toHaveLength(afterMain);
  });
});
