import type { CatalogModel, Price } from "../providers/types.ts";
import type { SpeedMap } from "../routing/metrics.ts";
import { CLAUDE_LINEUP, type ClaudeEntry } from "./claude-lineup.ts";

// The hub's entry sources. Each source gives one sidebar entry and its rows; a new
// kind of entry is a new source, and the view model never reads a provider directly.

export const CLAUDE_ID = "claude";
export const CLAUDE_LABEL = "Claude";

export type HubRow = {
  // The model's own name in its list: an alias for Claude, the bare model for a routed one.
  readonly id: string;
  // What `/model` takes: an alias, or `provider/model` for a routed model.
  readonly switchArg: string;
  readonly provider: string;
  readonly name: string;
  readonly contextWindow?: number;
  readonly maxOutput?: number;
  readonly price?: Price;
  readonly reasoning?: boolean;
  readonly vision?: boolean;
  readonly speed?: number;
};

export type HubSource = {
  readonly id: string;
  readonly label: string;
  rows(): readonly HubRow[];
  refresh?(): Promise<void>;
};

export function claudeSource(lineup: readonly ClaudeEntry[] = CLAUDE_LINEUP): HubSource {
  const rows: HubRow[] = lineup.map((entry) => ({
    id: entry.alias,
    switchArg: entry.alias,
    provider: CLAUDE_ID,
    name: entry.label,
  }));
  return { id: CLAUDE_ID, label: CLAUDE_LABEL, rows: () => rows };
}

function catalogRow(model: CatalogModel, speeds: SpeedMap): HubRow {
  const speed = speeds[model.id]?.tokensPerSecond;
  return {
    id: model.model,
    switchArg: model.id,
    provider: model.provider,
    name: model.name,
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxOutput === undefined ? {} : { maxOutput: model.maxOutput }),
    ...(model.price === undefined ? {} : { price: model.price }),
    reasoning: (model.reasoningEfforts?.length ?? 0) > 0,
    ...(model.vision === undefined ? {} : { vision: model.vision }),
    ...(speed === undefined ? {} : { speed }),
  };
}

export type CatalogSourceInput = {
  readonly id: string;
  readonly label: string;
  readonly models: readonly CatalogModel[];
  readonly speeds: SpeedMap;
  readonly refresh: (providerId: string) => Promise<void>;
};

// A provider's entry: its catalog models.
export function catalogSource(input: CatalogSourceInput): HubSource {
  const rows = input.models.filter((model) => model.provider === input.id).map((model) => catalogRow(model, input.speeds));
  return {
    id: input.id,
    label: input.label,
    rows: () => rows,
    refresh: () => input.refresh(input.id),
  };
}

export type SourcesInput = {
  readonly providers: readonly { readonly id: string; readonly name: string }[];
  readonly models: readonly CatalogModel[];
  readonly speeds: SpeedMap;
  readonly refresh: (providerId: string) => Promise<void>;
};

// Every source the hub shows: the Claude lineup, then one per listed provider.
export function hubSources(input: SourcesInput): HubSource[] {
  return [
    claudeSource(),
    ...input.providers.map((provider) =>
      catalogSource({
        id: provider.id,
        label: provider.name,
        models: input.models,
        speeds: input.speeds,
        refresh: input.refresh,
      }),
    ),
  ];
}
