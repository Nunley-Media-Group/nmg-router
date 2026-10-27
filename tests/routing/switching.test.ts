import { describe, expect, it } from "vitest";
import { routeStep, routeStepFailed } from "../../src/routing/turn-step.ts";
import { chatTurn, collect, harness, replies, remember, signIn, spyNext, step, textOf, userText, CHAT_URL, postsTo } from "../support/routing.ts";

// AC4: a routed step after Claude turns carries them without thinking; the next Claude step passes through.
describe("switching between Claude and a routed model keeps context", () => {
  it("sends the Claude turns without their thinking, and the next Claude step still passes through", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Routed answer." })) }, [
      userText("Read notes"),
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "SECRET CLAUDE THINKING", signature: "sig" },
          { type: "text", text: "Claude says hello." },
        ],
      },
      userText("Now the routed model"),
    ]);
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();

    expect(textOf((await collect(routeStep(h.router, step(0, "claude-haiku-5-5"), next))).chunks)).toBe("from claude");
    const routed = await collect(routeStep(h.router, step(1), next));
    expect(textOf(routed.chunks)).toBe("Routed answer.");
    expect(next.calls).toHaveLength(1);

    const [request] = postsTo(h.engine, CHAT_URL);
    expect(request?.body).toContain("Claude says hello.");
    expect(request?.body).not.toContain("SECRET CLAUDE THINKING");

    const back = await collect(routeStep(h.router, step(2, "claude-haiku-5-5"), next));
    expect(textOf(back.chunks)).toBe("from claude");
    expect(next.calls).toHaveLength(2);
    expect(h.messages).toHaveLength(3);
  });
});

// AC4, AC5: a Claude main-loop step clears the routed status line, and a Claude step with no routed status records none.
describe("the routed status line on Claude steps", () => {
  it("clears the line a routed main-loop step set, when a Claude main-loop step follows", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Routed." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    expect(h.engine.recorded.status).toHaveLength(1);
    expect(h.engine.recorded.status.at(-1)).not.toBe("");

    const next = spyNext();
    await collect(routeStep(h.router, step(1, "claude-haiku-5-5"), next));

    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.status).toHaveLength(2);
    expect(h.engine.recorded.status.at(-1)).toBe("");
  });

  it("clears the error line a failed routed main-loop step set, when a Claude main-loop step follows", async () => {
    const h = harness({ http: (request) => (request.url === CHAT_URL ? { status: 500, text: "{}" } : undefined) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    expect(h.engine.recorded.status.at(-1)).not.toBe("");

    await collect(routeStep(h.router, step(1, "claude-haiku-5-5"), spyNext()));

    expect(h.engine.recorded.status).toHaveLength(2);
    expect(h.engine.recorded.status.at(-1)).toBe("");
  });

  it("clears the line when a Claude main-loop step is replayed through routeStepFailed", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Routed." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));

    const next = spyNext();
    await collect(routeStepFailed(h.router, step(1, "claude-haiku-5-5"), next));

    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.status.at(-1)).toBe("");
  });

  it("records no status call for a Claude main-loop step when no routed step set the line", async () => {
    const h = harness();
    const next = spyNext();

    await collect(routeStep(h.router, step(0, "claude-haiku-5-5"), next));

    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.status).toEqual([]);
  });
});
