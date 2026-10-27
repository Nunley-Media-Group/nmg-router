import { describe, expect, it } from "vitest";
import { drawHub, type HubActions } from "../../src/hub/hub-view.ts";
import { ALL_SCOPE, hubView, withQuery, withScope, type HubState } from "../../src/hub/hub-state.ts";
import { hubSources, type HubRow } from "../../src/hub/sources.ts";
import { drawnElements } from "../support/fake-engine.ts";
import { ALL_MODELS, keyed, nodesOf, textOf } from "../support/hub-harness.ts";

const sources = hubSources({
  providers: [
    { id: "opencode-go", name: "OpenCode Go", locked: false },
    { id: "openai-codex", name: "Codex", locked: false },
    { id: "xai", name: "xAI", locked: true },
  ],
  models: ALL_MODELS,
  speeds: { "opencode-go/kimi-k3.1-pro": { tokensPerSecond: 118.4, at: 1 } },
  refresh: async () => undefined,
});

function state(overrides: Partial<HubState> = {}): HubState {
  return {
    scope: ALL_SCOPE,
    query: "",
    view: "list",
    refreshing: new Set(),
    currentModel: "claude-sonnet-5-5",
    contextTokens: 0,
    ...overrides,
  };
}

function recordingActions(): { actions: HubActions; calls: string[] } {
  const calls: string[] = [];
  const actions: HubActions = {
    selectScope: (id) => calls.push(`scope:${id}`),
    setQuery: (text) => calls.push(`query:${text}`),
    pick: (row: HubRow) => calls.push(`pick:${row.switchArg}`),
    submit: () => calls.push("submit"),
    login: (providerId) => calls.push(`login:${providerId}`),
  };
  return { actions, calls };
}

function draw(current: HubState, actions: HubActions, recent: Record<string, number> = {}) {
  return drawHub(drawnElements as never, hubView(current, sources, recent), actions);
}

describe("hub view", () => {
  it("draws the sidebar entries with no matches as dim text, not buttons", () => {
    const { actions } = recordingActions();
    const tree = draw(withQuery(state(), "kimi", sources, {}), actions);
    const buttonKeys = nodesOf(tree, "Button").map((node) => node.props.key);
    expect(buttonKeys).toContain("scope:all");
    expect(buttonKeys).toContain("scope:opencode-go");
    expect(buttonKeys).not.toContain("scope:claude");
    expect(textOf(tree)).toContain("Claude (0)");
  });

  it("draws each row with its id, the current mark, the window, the price and the speed", () => {
    const { actions } = recordingActions();
    const current = state({ scope: "opencode-go", currentModel: "opencode-go/kimi-k3.1-pro" });
    const tree = draw(current, actions);
    const row = keyed(tree, "row:opencode-go/kimi-k3.1-pro");
    expect(row).toBeDefined();
    const rowText = textOf(row);
    expect(rowText).toContain("kimi-k3.1-pro ✓");
    expect(rowText).toContain("128k");
    expect(rowText).toContain("$0.6/2.4");
    expect(rowText).toContain("118t/s");
    expect(textOf(keyed(tree, "row:opencode-go/glm-5.1"))).toContain("free");
  });

  it("draws the search field, the detail line of the first row and the footer", () => {
    const { actions } = recordingActions();
    const tree = draw(state({ scope: "opencode-go", query: "kimi" }), actions);
    expect(keyed(tree, "search")?.props.value).toBe("kimi");
    expect(textOf(tree)).toContain("Enter switch · Tab/↑↓ move · type to search · Esc clear/close");
  });

  it("draws the locked view with the no-credentials text, its bundled models and a focused login button", () => {
    const { actions } = recordingActions();
    const tree = draw(withScope(state(), "xai", sources), actions);
    expect(textOf(tree)).toContain("xAI has no credentials.");
    expect(textOf(tree)).toContain("models in catalog:");
    expect(textOf(tree)).toContain("xai/grok-4.6");
    const login = keyed(tree, "login");
    expect(login?.props.label).toBe("Log in to xAI");
    expect(login?.props.autoFocus).toBe(true);
    expect(keyed(tree, "search")).toBeUndefined();
  });

  it("says so when nothing matches the search", () => {
    const { actions } = recordingActions();
    const tree = draw(state({ query: "zzzz" }), actions);
    expect(textOf(tree)).toContain("No matching models.");
  });

  it("routes each press to its action", () => {
    const { actions, calls } = recordingActions();
    const tree = draw(state({ scope: "opencode-go" }), actions);
    keyed(tree, "scope:opencode-go")?.props.onPress?.();
    keyed(tree, "row:opencode-go/kimi-k3.1-pro")?.props.onPress?.();
    keyed(tree, "search")?.props.onInput?.("kimi");
    expect(calls).toEqual(["scope:opencode-go", "pick:opencode-go/kimi-k3.1-pro", "query:kimi"]);
  });
});
