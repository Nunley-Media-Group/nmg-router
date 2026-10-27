import { fuzzyScore } from "../login/fuzzy.ts";
import { claudeMatches } from "./claude-lineup.ts";
import { formatPrice, formatSpeed, formatTokens } from "./format.ts";
import type { RecentMap } from "./recent.ts";
import { CLAUDE_ID, type HubRow, type HubSource } from "./sources.ts";
import { compareVersions } from "./version-order.ts";

// The hub's view model: pure functions over the sources, the recent-use map and the
// state. The controller keeps the state and redraws from these results.

export const ALL_SCOPE = "all";

export type HubState = {
  readonly scope: string;
  readonly query: string;
  readonly highlighted?: string;
  readonly view: "list" | "locked";
  readonly refreshing: ReadonlySet<string>;
  readonly currentModel: string;
  readonly contextTokens: number;
};

export type SidebarEntry = {
  readonly id: string;
  readonly label: string;
  readonly locked: boolean;
  readonly dimmed: boolean;
  readonly focusable: boolean;
};

export type VisibleRow = {
  readonly row: HubRow;
  readonly key: string;
  readonly left: string;
  readonly right: string;
  readonly current: boolean;
  readonly overContext: boolean;
};

export type HubView = {
  readonly mode: "list" | "locked";
  readonly scope: string;
  readonly query: string;
  readonly sidebar: readonly SidebarEntry[];
  readonly rows: readonly VisibleRow[];
  readonly detail?: string;
  readonly locked?: { readonly id: string; readonly label: string; readonly rows: readonly HubRow[] };
};

export function rowKey(row: HubRow): string {
  return `row:${row.switchArg}`;
}

function recentAt(row: HubRow, recent: RecentMap): number {
  return recent[row.switchArg] ?? 0;
}

// Claude first, then the providers A–Z.
function providerOrder(a: HubRow, b: HubRow): number {
  if (a.provider === b.provider) return 0;
  if (a.provider === CLAUDE_ID) return -1;
  if (b.provider === CLAUDE_ID) return 1;
  return a.provider.localeCompare(b.provider);
}

// The default order: recent use newest first, then provider, then the version order.
export function sortRows(rows: readonly HubRow[], recent: RecentMap): HubRow[] {
  return [...rows].sort(
    (a, b) =>
      recentAt(b, recent) - recentAt(a, recent) || providerOrder(a, b) || compareVersions(a.id, b.id),
  );
}

// Matches of `query` over `provider/id`, in score buckets best first, then recent use,
// then the default order.
export function searchRows(rows: readonly HubRow[], query: string, recent: RecentMap): HubRow[] {
  const matches: { row: HubRow; bucket: number; at: number; index: number }[] = [];
  sortRows(rows, recent).forEach((row, index) => {
    const score = fuzzyScore(`${row.provider}/${row.id}`, query);
    if (score !== undefined) matches.push({ row, bucket: Math.round(score / 10), at: recentAt(row, recent), index });
  });
  return matches
    .sort((a, b) => a.bucket - b.bucket || b.at - a.at || a.index - b.index)
    .map((match) => match.row);
}

export function isCurrent(row: HubRow, currentModel: string): boolean {
  return row.provider === CLAUDE_ID ? claudeMatches(row.id, currentModel) : row.switchArg === currentModel;
}

export function isOverContext(row: HubRow, contextTokens: number): boolean {
  return row.contextWindow !== undefined && contextTokens > row.contextWindow;
}

// `name · 128k ctx · 32k out · $0.6/2.4 per M · reasoning · vision`, leaving out what is unknown.
export function detailLine(row: HubRow): string {
  const parts = [row.name];
  if (row.contextWindow !== undefined) parts.push(`${formatTokens(row.contextWindow)} ctx`);
  if (row.maxOutput !== undefined) parts.push(`${formatTokens(row.maxOutput)} out`);
  const price = formatPrice(row.price);
  if (price !== undefined) parts.push(price === "free" ? "free" : `${price} per M`);
  if (row.reasoning === true) parts.push("reasoning");
  if (row.vision === true) parts.push("vision");
  return parts.join(" · ");
}

function visibleRow(row: HubRow, state: HubState): VisibleRow {
  const claude = row.provider === CLAUDE_ID;
  const current = isCurrent(row, state.currentModel);
  const overContext = isOverContext(row, state.contextTokens);
  const name = claude ? row.name : state.scope === ALL_SCOPE ? row.switchArg : row.id;
  const mark = overContext && row.contextWindow !== undefined ? ` ⊘ context>${formatTokens(row.contextWindow)}` : "";
  const right = claude
    ? ""
    : [
        row.contextWindow === undefined ? undefined : formatTokens(row.contextWindow),
        formatPrice(row.price),
        row.speed === undefined ? undefined : formatSpeed(row.speed),
      ]
        .filter((part): part is string => part !== undefined)
        .join("  ");
  return {
    row,
    key: rowKey(row),
    left: `${name}${current ? " ✓" : ""}${mark}`,
    right,
    current,
    overContext,
  };
}

// The rows a scope lists. "All models" leaves out a locked provider, whose bundled
// models only preview in its own entry.
export function rowsOf(scope: string, sources: readonly HubSource[]): HubRow[] {
  if (scope === ALL_SCOPE) return sources.filter((source) => !source.isLocked()).flatMap((source) => [...source.rows()]);
  return [...(sources.find((source) => source.id === scope)?.rows() ?? [])];
}

function sourceOf(scope: string, sources: readonly HubSource[]): HubSource | undefined {
  return sources.find((source) => source.id === scope);
}

function isSearching(query: string): boolean {
  return query.trim() !== "";
}

// The rows a scope shows for the query, in the search order or the default order.
function scopedRows(state: HubState, sources: readonly HubSource[], recent: RecentMap): HubRow[] {
  const rows = rowsOf(state.scope, sources);
  return isSearching(state.query) ? searchRows(rows, state.query, recent) : sortRows(rows, recent);
}

// Claude first, then the unlocked providers A–Z, then the locked ones A–Z.
function orderedSources(sources: readonly HubSource[]): HubSource[] {
  const byLabel = (a: HubSource, b: HubSource): number => a.label.localeCompare(b.label);
  const unlocked = sources.filter((source) => !source.isLocked());
  const locked = sources.filter((source) => source.isLocked());
  const claudeFirst = (a: HubSource, b: HubSource): number =>
    (a.id === CLAUDE_ID ? 0 : 1) - (b.id === CLAUDE_ID ? 0 : 1) || byLabel(a, b);
  return [...unlocked.sort(claudeFirst), ...locked.sort(byLabel)];
}

export function sidebarEntries(state: HubState, sources: readonly HubSource[], recent: RecentMap): SidebarEntry[] {
  const searching = isSearching(state.query);
  const countOf = (rows: readonly HubRow[]): number =>
    searching ? searchRows(rows, state.query, recent).length : rows.length;
  const entry = (id: string, label: string, count: number, locked: boolean, refreshing: boolean): SidebarEntry => {
    const zero = searching && count === 0;
    return {
      id,
      label: `${label} (${refreshing ? "…" : count})`,
      locked,
      dimmed: locked || zero,
      focusable: !zero,
    };
  };
  // "All models" counts the unlocked providers, the same rows its scope lists.
  const all = entry(ALL_SCOPE, "All models", countOf(rowsOf(ALL_SCOPE, sources)), false, false);
  return [
    all,
    ...orderedSources(sources).map((source) =>
      entry(source.id, source.label, countOf(source.rows()), source.isLocked(), state.refreshing.has(source.id)),
    ),
  ];
}

export function hubView(state: HubState, sources: readonly HubSource[], recent: RecentMap): HubView {
  const sidebar = sidebarEntries(state, sources, recent);
  const source = sourceOf(state.scope, sources);
  if (state.view === "locked" && source?.isLocked() === true) {
    return {
      mode: "locked",
      scope: state.scope,
      query: state.query,
      sidebar,
      rows: [],
      locked: { id: source.id, label: source.label, rows: [...source.rows()] },
    };
  }
  const rows = scopedRows(state, sources, recent).map((row) => visibleRow(row, state));
  const highlighted = rows.find((candidate) => candidate.key === state.highlighted) ?? rows[0];
  return {
    mode: "list",
    scope: state.scope,
    query: state.query,
    sidebar,
    rows,
    ...(highlighted === undefined ? {} : { detail: detailLine(highlighted.row) }),
  };
}

// The query with the search applied: an active scope with no matches falls back to all models.
export function withQuery(state: HubState, query: string, sources: readonly HubSource[], recent: RecentMap): HubState {
  const next: HubState = { ...state, query, highlighted: undefined };
  if (state.scope === ALL_SCOPE || !isSearching(query)) return next;
  const matches = searchRows(rowsOf(state.scope, sources), query, recent).length;
  return matches === 0 ? { ...next, scope: ALL_SCOPE, view: "list" } : next;
}

// Selecting a sidebar entry: a locked provider opens its locked view, others the list.
export function withScope(state: HubState, scope: string, sources: readonly HubSource[]): HubState {
  const source = sourceOf(scope, sources);
  if (scope === ALL_SCOPE || source === undefined) {
    return { ...state, scope: ALL_SCOPE, view: "list", highlighted: undefined };
  }
  return { ...state, scope, view: source.isLocked() ? "locked" : "list", highlighted: undefined };
}
