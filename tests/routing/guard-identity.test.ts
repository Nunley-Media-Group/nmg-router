import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step, textOf } from "../support/routing.ts";

// AC5: the request guard runs first, nothing is shown before the response's model passes, every
// request goes only to the provider's host, and OpenCode Go carries one session id and the mod's version.
describe("guard and identity on every routed request", () => {
  it("refuses an Anthropic model before any request is sent", async () => {
    const h = harness();
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();
    const { chunks } = await collect(routeStep(h.router, step(0, "opencode-go/claude-opus-5-5"), next));

    expect(textOf(chunks)).toBe('Refused a routed request for "opencode-go/claude-opus-5-5": it names an Anthropic model.');
    expect(h.engine.recorded.http).toEqual([]);
    expect(next.calls).toEqual([]);
  });

  it("shows nothing from a response that names an Anthropic model", async () => {
    const h = harness({ http: replies(chatTurn({ text: "leaked text", model: "anthropic/claude-opus-5-5" })) });
    await signIn(h.engine);
    remember(h.capture);
    const { chunks } = await collect(routeStep(h.router, step(0), spyNext()));

    expect(textOf(chunks)).not.toContain("leaked text");
    expect(textOf(chunks)).toContain("Rejected the response");
  });

  it("sends each request to the provider host with one session id and the plugin version", async () => {
    const h = harness({ http: replies(chatTurn({ text: "one" }), chatTurn({ text: "two" })) });
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();
    await collect(routeStep(h.router, step(0), next));
    await collect(routeStep(h.router, step(1), next));

    const requests = postsTo(h.engine, CHAT_URL);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(new URL(request.url).host).toBe("opencode.ai");
      expect(request.headers["User-Agent"]).toBe("nmg-router/0.5.0");
      expect(request.headers["x-opencode-session"]).toBe("session-7");
    }
  });
});
