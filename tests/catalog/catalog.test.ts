import { describe, expect, it } from "vitest";
import { writeCache, type CatalogCache } from "../../src/catalog/cache.ts";
import type { CatalogModel } from "../../src/providers/types.ts";
import { freshOAuth, harness, storeApiKey, storeOAuth } from "../support/login-harness.ts";
import { fakeEngine } from "../support/fake-engine.ts";
import { createCatalog } from "../../src/catalog/catalog.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";

function model(provider: string, name: string, baseUrl: string): CatalogModel {
  return { id: `${provider}/${name}`, provider, model: name, name, wire: "openai-completions", baseUrl };
}

const SEED: CatalogCache = {
  version: 1,
  providers: {
    "opencode-go": { fetchedAt: 1, status: "ok", models: [model("opencode-go", "glm-old", "https://opencode.ai/inference/go/v1")] },
    xai: { fetchedAt: 1, status: "ok", models: [model("xai", "grok-old", "https://api.x.ai/v1")] },
    "cline-pass": { fetchedAt: 1, status: "ok", models: [model("cline-pass", "glm-old", "https://api.cline.bot/api/v1")] },
    "openai-codex": { fetchedAt: 1, status: "ok", models: [model("openai-codex", "gpt-old", "https://chatgpt.com/backend-api")] },
  },
};

describe("catalog load (AC3)", () => {
  it("reads the cache with no network call and marks it as already ok", async () => {
    const { engine, services } = harness({ platform: "linux" });
    await writeCache(engine, SEED);
    await services.catalog.load();

    expect(engine.recorded.http).toEqual([]);
    expect(services.catalog.status("xai")).toBe("ok");
    expect(services.catalog.models().map((entry) => entry.id)).toContain("xai/grok-old");
    expect(services.catalog.models().every((entry) => entry.cached === false)).toBe(true);
  });
});

describe("catalog refresh failure states (AC3)", () => {
  it("records each failure, keeps the cached models and marks them cached", async () => {
    const { engine, services } = harness({
      platform: "linux",
      http: (request) => {
        if (request.url.startsWith("https://opencode.ai/")) return { status: 401, body: { error: "no" } };
        if (request.url.startsWith("https://api.x.ai/")) return { status: 404 };
        if (request.url.startsWith("https://api.cline.bot/")) return { status: 200, body: { clinePass: [], free: [] } };
        return undefined;
      },
    });
    await writeCache(engine, SEED);
    await storeApiKey(engine, "opencode-go", "fixture-key");
    await storeApiKey(engine, "xai", "fixture-key");
    await storeApiKey(engine, "cline-pass", "fixture-key");
    await storeOAuth(engine, "openai-codex", "acct-fixture-1", freshOAuth("acct-fixture-1"));
    await services.catalog.load();
    await services.catalog.refresh();

    expect(services.catalog.status("opencode-go")).toBe("unauthenticated");
    expect(services.catalog.status("xai")).toBe("unavailable");
    expect(services.catalog.status("cline-pass")).toBe("empty");
    expect(services.catalog.status("openai-codex")).toBe("offline");
    const cached = services.catalog.models();
    expect(cached.map((entry) => entry.id).sort()).toEqual(
      ["cline-pass/glm-old", "openai-codex/gpt-old", "opencode-go/glm-old", "xai/grok-old"].sort(),
    );
    expect(cached.every((entry) => entry.cached === true)).toBe(true);
  });

  it("replaces the cache with the fresh list on success", async () => {
    const { engine, services } = harness({
      platform: "linux",
      http: () => ({ status: 200, body: { data: [{ id: "grok-4.6" }] } }),
    });
    await writeCache(engine, SEED);
    await storeApiKey(engine, "xai", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("xai");

    expect(services.catalog.status("xai")).toBe("ok");
    expect(services.catalog.models().filter((entry) => entry.provider === "xai").map((entry) => entry.model)).toEqual([
      "grok-4.6",
    ]);
    expect(services.catalog.models().find((entry) => entry.provider === "xai")?.cached).toBe(false);
  });

  it("records not-logged-in with no network call when no credential is stored", async () => {
    const { engine, services } = harness({ platform: "linux" });
    await services.catalog.load();
    await services.catalog.refresh("xai");

    expect(services.catalog.status("xai")).toBe("not-logged-in");
    expect(engine.recorded.http).toEqual([]);
    expect(services.catalog.models()).toEqual([]);
  });

  it("drops Claude models from the discovered list", async () => {
    const { engine, services } = harness({
      platform: "linux",
      http: () => ({ status: 200, body: { data: [{ id: "claude-haiku-5-5" }, { id: "grok-4.6" }] } }),
    });
    await storeApiKey(engine, "xai", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh("xai");

    expect(services.catalog.models().map((entry) => entry.id)).toEqual(["xai/grok-4.6"]);
  });
});

describe("catalog filters and status", () => {
  it("hides disabled providers from the models but keeps them for /logout", async () => {
    const { engine, services } = harness({
      platform: "macos",
      files: {
        "/Users/tester/Library/Application Support/nmg-router/config.json": JSON.stringify({
          disabledProviders: ["xai"],
          enabledModels: ["opencode-go/glm-*"],
        }),
      },
    });
    await writeCache(engine, SEED);
    await services.catalog.load();

    expect(services.catalog.enabledProviders().map((plugin) => plugin.identity.id)).not.toContain("xai");
    expect(services.catalog.providers().map((plugin) => plugin.identity.id)).toContain("xai");
    expect(services.catalog.models().map((entry) => entry.id)).toEqual(["opencode-go/glm-old"]);
  });

  it("uses the active account when one is stored, and the first stored account otherwise", async () => {
    const { engine, services } = harness({ platform: "linux" });
    await storeOAuth(engine, "openai-codex", "acct-a", freshOAuth("acct-a"));
    await storeOAuth(engine, "openai-codex", "acct-b", freshOAuth("acct-b"));
    await services.catalog.load();

    expect(await services.catalog.activeAccount("openai-codex")).toBe("acct-a");
    expect(await services.catalog.activeAccount("xai")).toBeUndefined();
  });

  it("forgets a provider's cache entry", async () => {
    const { engine, services } = harness({ platform: "linux" });
    await writeCache(engine, SEED);
    await services.catalog.load();
    await services.catalog.forget("xai");

    expect(services.catalog.status("xai")).toBe("never");
    expect(services.catalog.models().some((entry) => entry.provider === "xai")).toBe(false);
  });
});

describe("catalog without a credential store in use", () => {
  it("builds from explicit deps", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const catalog = createCatalog({ ...engine, credentials: createCredentialStore(engine) });
    await catalog.load();
    expect(catalog.providers()).toHaveLength(4);
  });
});
