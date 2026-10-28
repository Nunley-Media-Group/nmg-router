import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../../src/catalog/catalog.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { staticCapabilities } from "../../src/models/capability-sources.ts";
import type { CatalogModel, ProviderPlugin } from "../../src/providers/types.ts";
import { storeApiKey, freshOAuth, harness, storeOAuth } from "../support/login-harness.ts";
import { fakeEngine, type FakeHttpReply, type FakeHttpRequest } from "../support/fake-engine.ts";

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

const RECOMMENDED_URL = "https://api.cline.bot/api/v1/ai/cline/recommended-models";
const CLINE_MODELS_URL = "https://api.cline.bot/api/v1/ai/cline/models";
const MAC_CONFIG = "/Users/tester/Library/Application Support/nmg-router/config.json";

function visionById(models: readonly CatalogModel[]): Record<string, boolean | undefined> {
  return Object.fromEntries(models.map((model) => [model.id, model.vision]));
}

// A ClinePass refresh whose recommended list is `recommended`, with the model data
// fixture or `capability` answering the capability request.
async function refreshClinePass(recommended: unknown, capability: (request: FakeHttpRequest) => FakeHttpReply | undefined = () => json(fixture("cline-pass-models.json"))) {
  const { engine, services } = harness({
    platform: "linux",
    http: (request) => {
      if (request.url === RECOMMENDED_URL) return json(JSON.stringify(recommended));
      if (request.url === CLINE_MODELS_URL) return capability(request);
      return undefined;
    },
  });
  await storeApiKey(engine, "cline-pass", "fixture-key");
  await services.catalog.load();
  await services.catalog.refresh("cline-pass");
  return { engine, services };
}

describe("ClinePass image support from its model data (AC1, FR4)", () => {
  it("marks each alias by its vendor entry", async () => {
    const { services } = await refreshClinePass({
      clinePass: [{ id: "cline-pass/kimi-k3" }, { id: "cline-pass/glm-5.3" }, { id: "cline-pass/deepseek-v4.1-flash" }],
      free: [{ id: "cline-free/nemotron-3.5-super-vl" }, { id: "nvidia/nemotron-3.5-lightning-free" }],
    });

    expect(visionById(services.catalog.models())).toEqual({
      "cline-pass/kimi-k3": true,
      "cline-pass/glm-5.3": false,
      "cline-pass/deepseek-v4.1-flash": true,
      "cline-pass/cline-free/nemotron-3.5-super-vl": true,
      "cline-pass/nvidia/nemotron-3.5-lightning-free": false,
    });
  });

  it("leaves image support unknown for an alias with no entry or with entries that disagree", async () => {
    const { services } = await refreshClinePass({ clinePass: [{ id: "cline-pass/qwen3.8-max" }, { id: "cline-pass/twin-model" }] });

    expect(visionById(services.catalog.models())).toEqual({ "cline-pass/qwen3.8-max": undefined, "cline-pass/twin-model": undefined });
  });

  it("asks for the model data with the ClinePass client headers and the stored key (FR6)", async () => {
    const { engine } = await refreshClinePass({ clinePass: [{ id: "cline-pass/kimi-k3" }] });

    const request = engine.recorded.http.find((entry) => entry.url === CLINE_MODELS_URL);
    expect(request?.method).toBe("GET");
    expect(request?.headers.authorization).toBe("Bearer fixture-key");
    expect(request?.headers["X-CLIENT-TYPE"]).toBe("cline-sdk");
    expect(request?.body).toBeUndefined();
  });
});

describe("a failed capability lookup (AC6)", () => {
  it.each<[string, (request: FakeHttpRequest) => FakeHttpReply | undefined]>([
    ["answers HTTP 500", () => ({ status: 500, text: "" })],
    ["is offline", () => undefined],
    ["answers an unreadable body", () => json("{ not json")],
    ["answers an unexpected shape", () => json(JSON.stringify({ models: [] }))],
  ])("keeps the listing when the model data request %s", async (_case, capability) => {
    const { engine, services } = await refreshClinePass({ clinePass: [{ id: "cline-pass/kimi-k3" }] }, capability);

    expect(services.catalog.status("cline-pass")).toBe("ok");
    expect(services.catalog.models().map((model) => [model.id, model.vision, model.cached])).toEqual([["cline-pass/kimi-k3", undefined, false]]);
    expect(engine.recorded.ui).toEqual([]);
    expect(engine.recorded.debug).toContain("ClinePass capability data unavailable");
  });

  it("keeps bundled image support when xAI's language-model data is refused", async () => {
    const { services } = await refreshXai(() => ({ status: 403, text: "" }));

    expect(services.catalog.status("xai")).toBe("ok");
    expect(visionById(services.catalog.models())).toEqual({ "xai/grok-4.6": true, "xai/grok-4.3": undefined });
  });
});

// An xAI refresh over the model list fixture, with the language-model fixture or
// `capability` answering the capability request.
async function refreshXai(
  capability: (request: FakeHttpRequest) => FakeHttpReply | undefined = () => json(fixture("xai-language-models.json")),
  list = fixture("xai-models.json"),
) {
  const { engine, services } = harness({
    platform: "linux",
    http: (request) => {
      if (request.url === "https://api.x.ai/v1/models") return json(list);
      if (request.url === "https://api.x.ai/v1/language-models") return capability(request);
      return undefined;
    },
  });
  await storeApiKey(engine, "xai", "fixture-key");
  await services.catalog.load();
  await services.catalog.refresh("xai");
  return { engine, services };
}

describe("xAI image support from its language-model data (AC2, FR5)", () => {
  it("marks a model by its id and by an alias, and a text-only one as text-only", async () => {
    const list = JSON.stringify({ data: [{ id: "grok-4.6" }, { id: "grok-4.6-latest" }, { id: "grok-4.3-mini" }] });
    const { engine, services } = await refreshXai(undefined, list);

    expect(visionById(services.catalog.models())).toEqual({
      "xai/grok-4.6": true,
      "xai/grok-4.6-latest": true,
      "xai/grok-4.3-mini": false,
    });
    const request = engine.recorded.http.find((entry) => entry.url === "https://api.x.ai/v1/language-models");
    expect(request?.headers.authorization).toBe("Bearer fixture-key");
    expect(request?.headers["User-Agent"]).toBe("nmg-router");
  });

  it("lists models from /models, not from the language-model data", async () => {
    const { services } = await refreshXai();

    expect(services.catalog.models().map((model) => model.id)).toEqual(["xai/grok-4.6", "xai/grok-4.3"]);
  });
});

describe("OpenCode Go bundled image support (AC4)", () => {
  it("marks kimi-k3 vision and glm-5.3 text-only with no extra request", async () => {
    const list = JSON.stringify({ data: [{ id: "kimi-k3" }, { id: "glm-5.3" }, { id: "omen-alpha" }] });
    const { engine, services } = harness({
      platform: "linux",
      http: (request) => (request.url === "https://opencode.ai/inference/go/v1/models" ? json(list) : undefined),
    });
    await storeApiKey(engine, "opencode-go", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("opencode-go");

    expect(visionById(services.catalog.models())).toEqual({
      "opencode-go/kimi-k3": true,
      "opencode-go/glm-5.3": false,
      "opencode-go/omen-alpha": undefined,
    });
    expect(engine.recorded.http.map((request) => request.url)).toEqual(["https://opencode.ai/inference/go/v1/models"]);
  });
});

describe("an OpenAI-compatible list that states modalities (AC3)", () => {
  it("marks a live-listed custom provider's models from the list", async () => {
    const config = { providers: { "my-relay": { baseUrl: "https://relay.example.com/v1", api: "openai-completions", auth: "none" } } };
    const list = {
      data: [
        { id: "seer-1", input_modalities: ["text", "image"] },
        { id: "scribe-1", input_modalities: ["text"] },
        { id: "mystery-1" },
      ],
    };
    const { services } = harness({
      platform: "macos",
      files: { [MAC_CONFIG]: JSON.stringify(config) },
      http: (request) => (request.url === "https://relay.example.com/v1/models" ? { status: 200, body: list } : undefined),
    });
    await services.catalog.load();
    await services.catalog.refresh("my-relay");

    expect(visionById(services.catalog.models())).toEqual({
      "my-relay/seer-1": true,
      "my-relay/scribe-1": false,
      "my-relay/mystery-1": undefined,
    });
  });
});

describe("image support precedence (FR3)", () => {
  it("takes the list, then the capability source, then the bundled metadata", async () => {
    // opencode-go's bundled metadata marks kimi-k3 vision and glm-5.1 and minimax-m2.5 text-only.
    const plugin: ProviderPlugin = {
      identity: { id: "opencode-go", name: "Fixture Go", baseUrl: "https://fixture.example.com" },
      login: { kind: "none" },
      models: {
        list: async () => ({
          kind: "ok",
          models: [{ id: "glm-5.1", vision: true }, { id: "kimi-k3" }, { id: "minimax-m2.5" }, { id: "unlisted-1" }],
        }),
      },
      capabilities: staticCapabilities({ "glm-5.1": { vision: false }, "kimi-k3": { vision: false } }),
      wire: () => ({ wire: "openai-completions", baseUrl: "https://fixture.example.com" }),
    };
    const engine = fakeEngine({ platform: "linux" });
    const catalog = createCatalog({ ...engine, credentials: createCredentialStore(engine) }, [plugin]);
    await catalog.load();
    await catalog.refresh();

    expect(visionById(catalog.models())).toEqual({
      "opencode-go/glm-5.1": true,
      "opencode-go/kimi-k3": false,
      "opencode-go/minimax-m2.5": false,
      "opencode-go/unlisted-1": undefined,
    });
  });

  it("keeps the listing when a capability source throws", async () => {
    const plugin: ProviderPlugin = {
      identity: { id: "fixture", name: "Fixture", baseUrl: "https://fixture.example.com" },
      login: { kind: "none" },
      models: { list: async () => ({ kind: "ok", models: [{ id: "model-1" }] }) },
      capabilities: {
        read: async () => {
          throw new Error("capability source failed");
        },
      },
      wire: () => ({ wire: "openai-completions", baseUrl: "https://fixture.example.com" }),
    };
    const engine = fakeEngine({ platform: "linux" });
    const catalog = createCatalog({ ...engine, credentials: createCredentialStore(engine) }, [plugin]);
    await catalog.load();
    await catalog.refresh();

    expect(catalog.status("fixture")).toBe("ok");
    expect(catalog.models().map((model) => model.id)).toEqual(["fixture/model-1"]);
    expect(engine.recorded.ui).toEqual([]);
  });
});
