import { describe, expect, it } from "vitest";
import {
  ALL_SCOPE,
  detailLine,
  hubView,
  isCurrent,
  rowsOf,
  searchRows,
  sidebarEntries,
  sortRows,
  withQuery,
  withScope,
  type HubState,
} from "../../src/hub/hub-state.ts";
import { hubSources, type HubRow } from "../../src/hub/sources.ts";
import { ALL_MODELS } from "../support/hub-harness.ts";

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

function rowNamed(providerId: string, id: string): HubRow {
  const row = sources.find((source) => source.id === providerId)?.rows().find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`no row ${providerId}/${id}`);
  return row;
}

describe("sidebar", () => {
  it("lists All models, Claude, the unlocked providers A–Z, then the dimmed locked provider", () => {
    const entries = sidebarEntries(state(), sources, {});
    expect(entries.map((entry) => entry.label.replace(/ \(.*\)$/, ""))).toEqual([
      "All models",
      "Claude",
      "Codex",
      "OpenCode Go",
      "xAI",
    ]);
    expect(entries.slice(0, 4).map((entry) => entry.label)).toEqual([
      "All models (8)",
      "Claude (5)",
      "Codex (1)",
      "OpenCode Go (2)",
    ]);
    expect(entries.at(-1)).toMatchObject({ locked: true, dimmed: true, focusable: true });
  });

  it("draws a refreshing provider's count as an ellipsis", () => {
    const entries = sidebarEntries(state({ refreshing: new Set(["opencode-go"]) }), sources, {});
    expect(entries.find((entry) => entry.label.startsWith("OpenCode Go"))?.label).toBe("OpenCode Go (…)");
  });

  it("counts matches while searching and dims the entries with none, which cannot be chosen", () => {
    const entries = sidebarEntries(state({ query: "kimi" }), sources, {});
    const byName = (name: string) => entries.find((entry) => entry.label.startsWith(name));
    expect(byName("All models")).toMatchObject({ dimmed: false, focusable: true });
    expect(byName("Claude")).toMatchObject({ dimmed: true, focusable: false });
    expect(byName("OpenCode Go")?.label).toBe("OpenCode Go (1)");
    expect(byName("xAI")).toMatchObject({ dimmed: true, focusable: false });
  });
});

describe("search", () => {
  it("lists the matches across providers, by recent use within a score bucket", () => {
    const recent = { "opencode-go/kimi-k3.1-pro": 5 };
    const view = hubView(withQuery(state(), "kimi", sources, recent), sources, recent);
    expect(view.rows.map((row) => row.row.switchArg)).toEqual(["opencode-go/kimi-k3.1-pro", "openai-codex/kimi-k3-mini"]);
  });

  it("falls back to All models when the active scope has no matches", () => {
    const next = withQuery(state({ scope: "claude" }), "kimi", sources, {});
    expect(next.scope).toBe(ALL_SCOPE);
  });

  it("keeps the scope on an empty query, even for an empty provider", () => {
    expect(withQuery(state({ scope: "openai-codex" }), "", sources, {}).scope).toBe("openai-codex");
  });

  it("orders the search rows by score bucket, then recent use, then the default order", () => {
    const matches = searchRows(rowsOf(ALL_SCOPE, sources), "kimi", {});
    expect(matches.map((row) => row.switchArg)).toEqual(["openai-codex/kimi-k3-mini", "opencode-go/kimi-k3.1-pro"]);
  });
});

describe("rows", () => {
  it("sorts by recent use first, then Claude before the providers, then the newer version", () => {
    const rows = rowsOf(ALL_SCOPE, sources);
    expect(sortRows(rows, {})[0]?.provider).toBe("claude");
    expect(sortRows(rows, { "opencode-go/kimi-k3.1-pro": 9 })[0]?.switchArg).toBe("opencode-go/kimi-k3.1-pro");
    const openCode = sortRows(rowsOf("opencode-go", sources), {}).map((row) => row.id);
    expect(openCode).toEqual(["glm-5.1", "kimi-k3.1-pro"]);
  });

  it("marks a row current by its exact id, and a Claude alias by its full id", () => {
    expect(isCurrent(rowNamed("opencode-go", "kimi-k3.1-pro"), "opencode-go/kimi-k3.1-pro")).toBe(true);
    expect(isCurrent(rowNamed("opencode-go", "glm-5.1"), "opencode-go/kimi-k3.1-pro")).toBe(false);
    const opus = sources.find((source) => source.id === "claude")?.rows().find((row) => row.id === "opus");
    expect(opus && isCurrent(opus, "claude-opus-5-5")).toBe(true);
  });

  it("shows the id, the current mark, the window, the price and the speed; over-window rows carry the context mark", () => {
    const view = hubView(
      state({ scope: "opencode-go", currentModel: "opencode-go/kimi-k3.1-pro", contextTokens: 200000 }),
      sources,
      {},
    );
    const kimi = view.rows.find((row) => row.row.id === "kimi-k3.1-pro");
    expect(kimi?.left).toBe("kimi-k3.1-pro ✓ ⊘ context>128k");
    expect(kimi?.right).toBe("128k  $0.6/2.4  118t/s");
    expect(kimi?.overContext).toBe(true);
  });

  it("writes the detail line from the highlighted row, leaving out what is unknown", () => {
    expect(detailLine(rowNamed("opencode-go", "kimi-k3.1-pro"))).toBe("Kimi K3.1 Pro · 128k ctx · 33k out · $0.6/2.4 per M · reasoning");
    expect(detailLine(rowNamed("opencode-go", "glm-5.1"))).toBe("GLM-5.1 · 203k ctx · free");
    const view = hubView(state({ scope: "opencode-go" }), sources, {});
    expect(view.detail).toBe("GLM-5.1 · 203k ctx · free");
  });
});

describe("locked provider", () => {
  it("opens the locked view on its bundled models, and the list again for All models", () => {
    const locked = withScope(state(), "xai", sources);
    const view = hubView(locked, sources, {});
    expect(view.mode).toBe("locked");
    expect(view.locked?.label).toBe("xAI");
    expect(view.locked?.rows.every((row) => row.provider === "xai")).toBe(true);
    expect(hubView(withScope(locked, ALL_SCOPE, sources), sources, {}).mode).toBe("list");
  });
});
