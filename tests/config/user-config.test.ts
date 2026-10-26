import { describe, expect, it } from "vitest";
import { configPath, loadUserConfig } from "../../src/config/user-config.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";
import { harness, storeApiKey } from "../support/login-harness.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";
import { BUILTIN_IDS } from "../../src/providers/builtin/index.ts";

const MAC_PATH = "/Users/tester/Library/Application Support/nmg-router/config.json";

describe("config path per OS (FR4)", () => {
  it.each<[string, FakeOptions, string]>([
    ["macOS", { platform: "macos" }, MAC_PATH],
    ["Linux with XDG_CONFIG_HOME", { platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" } }, "/xdg/nmg-router/config.json"],
    ["Linux with the default", { platform: "linux" }, "/home/tester/.config/nmg-router/config.json"],
    [
      "Windows with APPDATA",
      { platform: "windows", env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" } },
      "C:\\Users\\tester\\AppData\\Roaming\\nmg-router\\config.json",
    ],
  ])("resolves the path on %s", async (_label, options, expected) => {
    expect(await configPath(fakeEngine(options))).toBe(expected);
  });
});

describe("loading config.json (FR4)", () => {
  it("gives an empty config and no problem when the file is missing", async () => {
    const load = await loadUserConfig(fakeEngine({ platform: "macos" }), BUILTIN_IDS);
    expect(load.config).toEqual({ providers: {}, disabledProviders: [], enabledModels: [] });
    expect(load.problems).toEqual([]);
  });

  it("gives one problem and an empty config for malformed JSON", async () => {
    const load = await loadUserConfig(
      fakeEngine({ platform: "macos", files: { [MAC_PATH]: "{ not json" } }),
      BUILTIN_IDS,
    );
    expect(load.config.providers).toEqual({});
    expect(load.problems.map((problem) => problem.code)).toEqual(["malformed_file"]);
  });
});

const RELAY = {
  providers: {
    "my-relay": {
      name: "My Relay",
      baseUrl: "https://relay.example.com/v1",
      api: "openai-completions",
      auth: "api-key",
      headers: { "X-Title": "nmg-router" },
      models: [{ id: "glm-5.1", name: "GLM 5.1", contextWindow: 200000, reasoningEfforts: ["low", "high"], price: { input: 0.5, output: 2 } }],
    },
  },
  disabledProviders: ["xai"],
  enabledModels: ["opencode-go/glm-*", "my-relay/*"],
};

describe("custom provider and filters (AC4)", () => {
  it("lists the custom provider, hides xAI and keeps only the matching models", async () => {
    const { engine, services } = harness({
      platform: "macos",
      files: { [MAC_PATH]: JSON.stringify(RELAY) },
      http: () => ({ status: 200, body: { data: [{ id: "glm-5.1" }, { id: "kimi-k3" }] } }),
    });
    await storeApiKey(engine, "my-relay", "fixture-key");
    await storeApiKey(engine, "opencode-go", "fixture-key");
    await services.catalog.load();
    await services.catalog.refresh();

    expect(services.catalog.providers().map((plugin) => plugin.identity.id)).toEqual([
      "opencode-go",
      "cline-pass",
      "openai-codex",
      "xai",
      "my-relay",
    ]);
    expect(services.catalog.enabledProviders().map((plugin) => plugin.identity.id)).not.toContain("xai");
    const ids = services.catalog.models().map((entry) => entry.id);
    expect(ids).toContain("my-relay/glm-5.1");
    expect(ids).not.toContain("my-relay/kimi-k3");
    expect(ids).not.toContain("xai/grok-4.6");
    const relay = services.catalog.models().find((entry) => entry.id === "my-relay/glm-5.1");
    expect(relay).toMatchObject({ wire: "openai-completions", baseUrl: "https://relay.example.com/v1", contextWindow: 200000 });
    expect(relay?.price).toEqual({ input: 0.5, output: 2 });
  });

  it("rejects an entry holding an API key, names its path, points to /login and never echoes the value", async () => {
    const sentinel = makeSentinel();
    const config = {
      providers: { "leaky-relay": { baseUrl: "https://relay.example.com/v1", api: "openai-completions", apiKey: sentinel } },
    };
    const { engine, services } = harness({ platform: "macos", files: { [MAC_PATH]: JSON.stringify(config) } });
    await services.catalog.load();

    expect(services.catalog.providers().map((plugin) => plugin.identity.id)).not.toContain("leaky-relay");
    const messages = engine.recorded.ui;
    const problem = messages.find((text) => text.includes("looks like a credential"));
    expect(problem).toBe(
      "Config entry providers.leaky-relay.apiKey looks like a credential and was ignored. Use /login to sign in to leaky-relay.",
    );
    assertNoSentinel(engine, sentinel, messages);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["an Authorization header", { headers: { Authorization: "placeholder" }, baseUrl: "https://relay.example.com/v1" }, "providers.header-relay.headers.Authorization"],
    ["a Bearer value", { headers: { "X-Route": "Bearer placeholder" }, baseUrl: "https://relay.example.com/v1" }, "providers.header-relay.headers.X-Route"],
    ["a nested token", { options: { nested: { access_token: "placeholder" } } }, "providers.header-relay.options.nested.access_token"],
  ])("refuses a credential held as %s", async (_label, entry, path) => {
    const load = await loadUserConfig(
      fakeEngine({ platform: "macos", files: { [MAC_PATH]: JSON.stringify({ providers: { "header-relay": entry } }) } }),
      BUILTIN_IDS,
    );
    expect(load.config.providers).toEqual({});
    expect(load.problems[0]?.path).toBe(path);
  });

  it("refuses a built-in id, an Anthropic id and an Anthropic host", async () => {
    const config = {
      providers: {
        xai: { baseUrl: "https://relay.example.com/v1" },
        anthropic: { baseUrl: "https://relay.example.com/v1" },
        "claude-relay": { baseUrl: "https://api.anthropic.com/v1" },
        "Bad Id": { baseUrl: "https://relay.example.com/v1" },
      },
    };
    const load = await loadUserConfig(
      fakeEngine({ platform: "macos", files: { [MAC_PATH]: JSON.stringify(config) } }),
      BUILTIN_IDS,
    );
    expect(load.config.providers).toEqual({});
    expect(load.problems.map((problem) => problem.code)).toEqual(["builtin_id", "anthropic_entry", "anthropic_entry", "invalid_id"]);
  });
});
