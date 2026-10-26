import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, MODEL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step } from "../support/routing.ts";

const CACHE = {
  version: 1,
  providers: {
    "opencode-go": {
      fetchedAt: 1,
      status: "ok",
      models: [
        {
          id: MODEL,
          provider: "opencode-go",
          model: "kimi-k3.1-pro",
          name: "Kimi test",
          wire: "openai-completions",
          baseUrl: "https://opencode.ai/inference/go/v1",
          reasoningEfforts: ["low", "medium"],
          vision: false,
        },
        {
          id: "opencode-go/plain-model",
          provider: "opencode-go",
          model: "plain-model",
          name: "Plain",
          wire: "openai-completions",
          baseUrl: "https://opencode.ai/inference/go/v1",
          vision: false,
        },
      ],
    },
  },
};

// AC8: effort is clamped to the model's own levels, and the status line shows the level or that thinking is unsupported.
describe("thinking levels", () => {
  it("clamps max to the highest supported level, sends it, and shows it in the status line", async () => {
    const h = harness({ http: replies(chatTurn({ text: "ok" })) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0, MODEL, { effort: "max" }), spyNext()));

    const [request] = postsTo(h.engine, CHAT_URL);
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ reasoning_effort: "medium" });
    expect(h.engine.recorded.status.at(-1)).toBe(`${MODEL} · thinking medium`);
  });

  it("clamps high the same way for a model that supports only low and medium", async () => {
    const h = harness({ http: replies(chatTurn({ text: "ok" })) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0, MODEL, { effort: "high" }), spyNext()));

    expect(JSON.parse(postsTo(h.engine, CHAT_URL)[0]?.body ?? "{}")).toMatchObject({ reasoning_effort: "medium" });
  });

  it("sends no reasoning field and says thinking is unsupported for a non-reasoning model", async () => {
    const h = harness({ http: replies(chatTurn({ text: "ok" })) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0, "opencode-go/plain-model", { effort: "high" }), spyNext()));

    const body = JSON.parse(postsTo(h.engine, CHAT_URL)[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(h.engine.recorded.status.at(-1)).toBe("opencode-go/plain-model · thinking unsupported");
  });

  it("says thinking is off for a reasoning model that got no effort on the step", async () => {
    const h = harness({ http: replies(chatTurn({ text: "ok" })) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0, MODEL), spyNext()));

    expect(h.engine.recorded.status.at(-1)).toBe(`${MODEL} · thinking off`);
  });
});
