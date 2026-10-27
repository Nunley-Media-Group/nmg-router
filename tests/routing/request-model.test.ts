import { describe, expect, it } from "vitest";
import { clinePassRequestModel } from "../../src/providers/builtin/cline-pass.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import { chatTurn, collect, harness, postsTo, remember, signIn, spyNext, step, textOf } from "../support/routing.ts";

// ClinePass takes only `modelType/model` ids and answers a bare one with HTTP 400. Its
// paid ids lose `cline-pass/` in the `provider/model` id, so a request puts it back;
// a free id keeps its own prefix.

const CLINE_CHAT_URL = "https://api.cline.bot/api/v1/chat/completions";

function cachedClinePass(model: string) {
  return {
    id: `cline-pass/${model}`,
    provider: "cline-pass",
    model,
    name: `cline-pass/${model}`,
    wire: "openai-completions",
    baseUrl: "https://api.cline.bot/api/v1",
  };
}

describe("clinePassRequestModel", () => {
  it("puts cline-pass/ back on a paid id, and leaves an id with its own prefix as it is", () => {
    expect(clinePassRequestModel("qwen3.7-plus")).toBe("cline-pass/qwen3.7-plus");
    expect(clinePassRequestModel("nvidia/nemotron-3.5-lightning-free")).toBe("nvidia/nemotron-3.5-lightning-free");
    expect(clinePassRequestModel("cline-free/solar-mini4")).toBe("cline-free/solar-mini4");
  });
});

describe("a routed ClinePass request", () => {
  it.each([
    ["qwen3.7-plus", "cline-pass/qwen3.7-plus"],
    ["cline-free/solar-mini4", "cline-free/solar-mini4"],
  ])("names %s as %s, from a catalog cached before the fix", async (model, sent) => {
    const answer = chatTurn({ text: "Routed answer." });
    const h = harness({ http: (request) => (request.url === CLINE_CHAT_URL ? { status: 200, text: answer } : undefined) });
    await h.engine.store.set("catalog.cache", {
      version: 1,
      providers: { "cline-pass": { fetchedAt: 1, status: "ok", models: [cachedClinePass(model)] } },
    });
    await h.engine.store.set("accounts.active", { "cline-pass": "default" });
    await signIn(h.engine, "cline-pass");
    remember(h.capture, `cline-pass/${model}`);

    const routed = await collect(routeStep(h.router, step(0, `cline-pass/${model}`), spyNext()));

    expect(textOf(routed.chunks)).toBe("Routed answer.");
    const [request] = postsTo(h.engine, CLINE_CHAT_URL);
    expect(JSON.parse(request?.body ?? "{}").model).toBe(sent);
  });
});
