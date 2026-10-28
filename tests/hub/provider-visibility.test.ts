import { describe, expect, it, vi } from "vitest";
import { CLAUDE_LINEUP } from "../../src/hub/claude-lineup.ts";
import { handleModelCommand } from "../../src/hub/model-command.ts";
import type { CatalogModel } from "../../src/providers/types.ts";
import { drawnElements } from "../support/fake-engine.ts";
import {
  ALL_MODELS,
  apiKeyPlugin,
  chooseScope,
  freePlugin,
  GLM,
  hubHarness,
  type HubHarness,
  KIMI,
  keyed,
  optionValues,
  settle,
  textOf,
} from "../support/hub-harness.ts";

// Which providers the /model hub lists: each one that needs no login, or has a stored one.

const GROK: CatalogModel = {
  id: "xai/grok-4.6",
  provider: "xai",
  model: "grok-4.6",
  name: "Grok 4.6",
  wire: "openai-completions",
  baseUrl: "https://example.test",
  contextWindow: 256000,
};

const LLAMA: CatalogModel = {
  id: "local/llama-3",
  provider: "local",
  model: "llama-3",
  name: "Llama 3",
  wire: "openai-completions",
  baseUrl: "https://example.test",
};

// As the person's `/model` with no arguments, which opens the hub on All models.
async function openHub(h: HubHarness): Promise<void> {
  await handleModelCommand(
    h.host,
    { command: "model", args: "", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 200 } } as never,
    vi.fn(),
    h.hub,
  );
}

function tree(h: HubHarness): unknown {
  return h.hub.draw(drawnElements as never);
}

function scopeIds(h: HubHarness): string[] {
  return optionValues(tree(h), "scopes");
}

describe("provider visibility in the /model hub", () => {
  it("AC1: a provider that needs a login and has none has no entry, and no model in All models or a search", async () => {
    const h = await hubHarness({ logins: ["opencode-go"], models: [...ALL_MODELS, GROK] });
    await openHub(h);
    expect(scopeIds(h)).not.toContain("xai");
    expect(textOf(tree(h))).not.toContain("xai/");

    keyed(tree(h), "search")?.props.onInput?.("xai");
    await settle();
    expect(textOf(tree(h))).not.toContain("xai/");
  });

  it("AC2: a provider with a stored login and a provider that needs no login are both listed, with their models", async () => {
    const h = await hubHarness({
      logins: ["opencode-go"],
      providers: [apiKeyPlugin("opencode-go", "OpenCode Go"), freePlugin("local", "Local")],
      models: [KIMI, GLM, LLAMA],
    });
    await openHub(h);
    expect(scopeIds(h).sort()).toEqual(["all", "claude", "local", "opencode-go"]);
    expect(textOf(tree(h))).toContain("opencode-go/kimi-k3.1-pro");
    expect(textOf(tree(h))).toContain("local/llama-3");
  });

  it("AC3: a login saved in the session lists the provider and its models on the next open", async () => {
    const h = await hubHarness({ models: [...ALL_MODELS, GROK] });
    await openHub(h);
    expect(scopeIds(h)).not.toContain("xai");

    h.services.logins.add("xai");
    await openHub(h);
    expect(scopeIds(h)).toContain("xai");
    chooseScope(tree(h), "xai");
    await settle();
    expect(optionValues(tree(h), "models")).toEqual(["row:xai/grok-4.6"]);
  });

  it("AC4: a logout hides the provider on the next open", async () => {
    const h = await hubHarness({ models: ALL_MODELS });
    await openHub(h);
    expect(scopeIds(h)).toContain("opencode-go");

    h.services.logins.delete("opencode-go");
    await openHub(h);
    expect(scopeIds(h)).not.toContain("opencode-go");
    expect(textOf(tree(h))).not.toContain("opencode-go/");
  });

  it("AC5: a stored login that does not resolve keeps the provider listed with its cached models", async () => {
    const h = await hubHarness({ logins: ["opencode-go"], statuses: { "opencode-go": "unauthenticated" } });
    expect(h.services.catalog.status("opencode-go")).toBe("unauthenticated");
    await openHub(h);
    expect(scopeIds(h)).toContain("opencode-go");
    chooseScope(tree(h), "opencode-go");
    await settle();
    expect(optionValues(tree(h), "models").sort()).toEqual(["row:opencode-go/glm-5.1", "row:opencode-go/kimi-k3.1-pro"]);
  });

  it("AC6: with no login-requiring provider logged in, only All models and Claude are listed, with no locked view or login button", async () => {
    const h = await hubHarness({ logins: [] });
    await openHub(h);
    expect(scopeIds(h).sort()).toEqual(["all", "claude"]);

    const drawn = tree(h);
    expect(textOf(drawn)).not.toContain("has no credentials");
    expect(textOf(drawn)).not.toContain("Log in to");
    expect(textOf(drawn)).not.toMatch(/hidden|not logged in/i);
    expect(keyed(drawn, "login")).toBeUndefined();
    expect(optionValues(drawn, "models").sort()).toEqual(CLAUDE_LINEUP.map((entry) => `row:${entry.alias}`).sort());
  });
});
