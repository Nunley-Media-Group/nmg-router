import { describe, expect, it } from "vitest";
import { drawHub, focusableKeys, type HubActions } from "../../src/hub/hub-view.ts";
import { ALL_SCOPE, hubView, withQuery, type HubState } from "../../src/hub/hub-state.ts";
import { hubSources, type HubRow } from "../../src/hub/sources.ts";
import { drawnElements } from "../support/fake-engine.ts";
import { ALL_MODELS, keyed, nodesOf, textOf } from "../support/hub-harness.ts";

const sources = hubSources({
  providers: [
    { id: "opencode-go", name: "OpenCode Go" },
    { id: "openai-codex", name: "Codex" },
  ],
  models: ALL_MODELS,
  speeds: { "opencode-go/kimi-k3.1-pro": { tokensPerSecond: 118.4, at: 1 } },
  refresh: async () => undefined,
});

function state(overrides: Partial<HubState> = {}): HubState {
  return {
    scope: ALL_SCOPE,
    query: "",
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
  };
  return { actions, calls };
}

function draw(current: HubState, actions: HubActions, recent: Record<string, number> = {}) {
  return drawHub(drawnElements as never, hubView(current, sources, recent), actions);
}

describe("hub view", () => {
  // A pane scrolls its body on the arrows and lets the left arrow through to the prompt;
  // a Select keeps every arrow, so the providers and the models are each one Select.
  it("draws the providers and the models as one Select each, with no row buttons", () => {
    const { actions } = recordingActions();
    const tree = draw(state({ scope: "opencode-go", currentModel: "opencode-go/glm-5.1" }), actions);
    expect(nodesOf(tree, "Button")).toEqual([]);
    expect(nodesOf(tree, "Select").map((node) => node.props.key)).toEqual(["models", "scopes"]);
    expect(keyed(tree, "scopes")?.props.value).toBe("opencode-go");
    expect(keyed(tree, "scopes")?.props.options.map((option: { value: string }) => option.value)).toEqual([
      "all",
      "claude",
      "openai-codex",
      "opencode-go",
    ]);
    expect(keyed(tree, "models")?.props.value).toBe("row:opencode-go/glm-5.1");
    expect(keyed(tree, "models")?.props.autoFocus).toBe(true);
  });

  it("labels each option with its id, the current mark, the window, the price and the speed", () => {
    const { actions } = recordingActions();
    const current = state({ scope: "opencode-go", currentModel: "opencode-go/kimi-k3.1-pro" });
    const options = keyed(draw(current, actions), "models")?.props.options as { value: string; label: string }[];
    const label = (value: string): string | undefined => options.find((option) => option.value === value)?.label;
    expect(label("row:opencode-go/kimi-k3.1-pro")).toBe("kimi-k3.1-pro ✓  128k  $0.6/2.4  118t/s");
    expect(label("row:opencode-go/glm-5.1")).toBe("glm-5.1          203k  free");
  });

  it("counts the matches of a search in each provider's label", () => {
    const { actions } = recordingActions();
    const tree = draw(withQuery(state(), "kimi", sources, {}), actions);
    const labels = (keyed(tree, "scopes")?.props.options as { label: string }[]).map((option) => option.label);
    expect(labels).toContain("Claude (0)");
    expect(labels).toContain("OpenCode Go (1)");
  });

  // The host's focus ring keeps a position in document order, so the search field and
  // the models come before the providers, while the sidebar stays on the left.
  it("draws the search field and the models before the providers, while the sidebar stays on the left", () => {
    const { actions } = recordingActions();
    for (const query of ["", "kimi"]) {
      const tree = draw(withQuery(state(), query, sources, {}), actions);
      const inOrder: string[] = [];
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (typeof value !== "object" || value === null) return;
        const node = value as { type?: string; props: { key?: string; children?: unknown } };
        if (node.type === "Input" || node.type === "Select") inOrder.push(node.props.key ?? "");
        visit(node.props.children);
      };
      visit(tree);
      expect(inOrder).toEqual(["search", "models", "scopes"]);
      expect((tree as { props: { flexDirection?: string } }).props.flexDirection).toBe("row-reverse");
      expect(focusableKeys(hubView(withQuery(state(), query, sources, {}), sources, {}))).toEqual([
        "search",
        "models",
        "scopes",
      ]);
    }
  });

  it("draws the detail line and the footer above the rows, so a long list cannot hide them", () => {
    const { actions } = recordingActions();
    const text = textOf(draw(state({ scope: "opencode-go" }), actions));
    const firstRow = text.indexOf("kimi-k3.1-pro  ");
    expect(text.indexOf("Enter switch")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Enter switch")).toBeLessThan(firstRow);
    expect(text.indexOf("Kimi K3.1 Pro ·")).toBeLessThan(firstRow);
  });

  it("draws the search field, the detail line of the first row and the footer", () => {
    const { actions } = recordingActions();
    const tree = draw(state({ scope: "opencode-go", query: "kimi" }), actions);
    expect(keyed(tree, "search")?.props.value).toBe("kimi");
    expect(textOf(tree)).toContain("↑↓ choose · Enter switch · Tab providers/search · Esc clear/close");
  });

  it("says so when nothing matches the search", () => {
    const { actions } = recordingActions();
    const tree = draw(state({ query: "zzzz" }), actions);
    expect(textOf(tree)).toContain("No matching models.");
  });

  it("routes each pick and the typing to its action", () => {
    const { actions, calls } = recordingActions();
    const tree = draw(state({ scope: "opencode-go" }), actions);
    keyed(tree, "scopes")?.props.onSelect?.("opencode-go");
    keyed(tree, "models")?.props.onSelect?.("row:opencode-go/kimi-k3.1-pro");
    keyed(tree, "models")?.props.onSelect?.("row:not-listed");
    keyed(tree, "search")?.props.onInput?.("kimi");
    expect(calls).toEqual(["scope:opencode-go", "pick:opencode-go/kimi-k3.1-pro", "query:kimi"]);
  });
});
