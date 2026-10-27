import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storeApiKey, freshOAuth, harness, storeOAuth } from "../support/login-harness.ts";
import type { FakeHttpReply } from "../support/fake-engine.ts";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8");
}

const json = (text: string): FakeHttpReply => ({ status: 200, text });

describe("OpenCode Go discovery (AC2)", () => {
  it("lists each fixture model with its wire, metadata and no Claude model", async () => {
    const list = fixture("opencode-go-models.json");
    const { engine, services } = harness({
      platform: "linux",
      http: (request) => (request.url === "https://opencode.ai/inference/go/v1/models" ? json(list) : undefined),
    });
    await storeApiKey(engine, "opencode-go", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("opencode-go");

    const models = services.catalog.models();
    expect(models.map((model) => model.id)).toEqual([
      "opencode-go/glm-5.1",
      "opencode-go/kimi-k3",
      "opencode-go/gpt-5.5",
      "opencode-go/minimax-m2.5",
    ]);
    const wires = Object.fromEntries(models.map((model) => [model.model, model.wire]));
    expect(wires).toEqual({
      "glm-5.1": "openai-completions",
      "kimi-k3": "openai-completions",
      "gpt-5.5": "openai-responses",
      "minimax-m2.5": "anthropic-messages",
    });

    const glm = models.find((model) => model.model === "glm-5.1");
    expect(glm).toMatchObject({ contextWindow: 202752, maxOutput: 32768, vision: false, cached: false });
    expect(glm?.reasoningEfforts).toContain("xhigh");
    expect(glm?.price).toMatchObject({ input: 1.4, output: 4.4 });
    expect(models.find((model) => model.model === "kimi-k3")?.vision).toBe(true);
  });

  it("sends the stored key as a bearer token with the honest user agent", async () => {
    const list = fixture("opencode-go-models.json");
    const { engine, services } = harness({ platform: "linux", http: () => json(list) });
    await storeApiKey(engine, "opencode-go", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("opencode-go");

    const [request] = engine.recorded.http;
    expect(request?.headers.authorization).toBe("Bearer fixture-key");
    expect(request?.headers["User-Agent"] ?? request?.headers["user-agent"]).toBe("nmg-router");
  });
});

describe("OpenAI Codex discovery", () => {
  it("lists visible models with the Codex wire and drops hidden ones", async () => {
    const list = fixture("codex-models.json");
    const { engine, services } = harness({
      platform: "linux",
      http: (request) => (request.url.startsWith("https://chatgpt.com/backend-api/codex/models") ? json(list) : undefined),
    });
    await storeOAuth(engine, "openai-codex", "acct-fixture-1", freshOAuth("acct-fixture-1"));
    await services.catalog.load();
    await services.catalog.refresh("openai-codex");

    expect(services.catalog.models().map((model) => model.id)).toEqual(["openai-codex/gpt-5.5"]);
    expect(services.catalog.models()[0]).toMatchObject({
      wire: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      contextWindow: 272000,
      maxOutput: 128000,
      vision: true,
    });
    const [request] = engine.recorded.http;
    expect(request?.headers["chatgpt-account-id"]).toBe("acct-fixture-1");
    expect(request?.headers.authorization).toBe("Bearer access-fixture");
  });
});

describe("ClinePass discovery", () => {
  it("reads both lists, strips the prefix once and marks free models", async () => {
    const list = fixture("cline-pass-recommended-models.json");
    const { engine, services } = harness({
      platform: "linux",
      http: (request) =>
        request.url === "https://api.cline.bot/api/v1/ai/cline/recommended-models" ? json(list) : undefined,
    });
    await storeApiKey(engine, "cline-pass", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("cline-pass");

    const models = services.catalog.models();
    expect(models.map((model) => model.id)).toEqual([
      "cline-pass/glm-5.2",
      "cline-pass/kimi-k2.7-code",
      "cline-pass/deepseek-v4-flash",
    ]);
    expect(models.find((model) => model.model === "deepseek-v4-flash")?.name).toBe("DeepSeek V4 Flash (free)");
    expect(models[0]).toMatchObject({ wire: "openai-completions", baseUrl: "https://api.cline.bot/api/v1" });
    expect(engine.recorded.http[0]?.headers["X-PLATFORM"]).toBe("linux");
  });

  it("names a model the list names by its id after the bare model", async () => {
    const list = JSON.stringify({
      clinePass: [{ id: "cline-pass/qwen3.7-max", name: "cline-pass/qwen3.7-max" }],
      free: [{ id: "cline-free/solar-mini4", name: "cline-free/solar-mini4" }],
    });
    const { engine, services } = harness({
      platform: "linux",
      http: (request) =>
        request.url === "https://api.cline.bot/api/v1/ai/cline/recommended-models" ? json(list) : undefined,
    });
    await storeApiKey(engine, "cline-pass", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("cline-pass");

    const names = services.catalog.models().map((model) => [model.id, model.name]);
    expect(names).toEqual([
      ["cline-pass/qwen3.7-max", "qwen3.7-max"],
      ["cline-pass/cline-free/solar-mini4", "solar-mini4 (free)"],
    ]);
  });
});

describe("xAI discovery", () => {
  it("applies the bundled metadata to a listed model", async () => {
    const list = fixture("xai-models.json");
    const { engine, services } = harness({
      platform: "linux",
      http: (request) => (request.url === "https://api.x.ai/v1/models" ? json(list) : undefined),
    });
    await storeApiKey(engine, "xai", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("xai");

    const grok = services.catalog.models().find((model) => model.model === "grok-4.6");
    expect(grok).toMatchObject({ wire: "openai-responses", contextWindow: 500000, maxOutput: 500000, vision: true });
    expect(services.catalog.models().find((model) => model.model === "grok-4.3")?.contextWindow).toBeUndefined();
  });
});
