import type { Effort, RawModel } from "./types.ts";

// A model whose reasoning field is named by level (its own field and value per effort).
export type ReasoningTransport = {
  readonly transport: "level";
  readonly field: string;
  readonly levels: Readonly<Partial<Record<Effort, string | boolean>>>;
};

export type ModelMetadata = Omit<RawModel, "id"> & { readonly reasoningTransport?: ReasoningTransport };

// Bundled capability metadata for built-in providers' current models, keyed by
// `provider/model`. A provider's live list supplies the limits it knows, and
// these fill what it leaves out. The values come from oh-my-pi's bundled
// catalog data (pi-catalog models.json), used as reference data only.
//
// ClinePass has no entry: no source checked supplied verified per-model limits
// or prices, so its models carry only what its live list returns.

export const BUNDLED_METADATA: Readonly<Record<string, ModelMetadata>> = {
  "opencode-go/glm-5.1": {
    name: "GLM-5.1",
    contextWindow: 202752,
    maxOutput: 32768,
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    vision: false,
    price: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    wire: "openai-completions",
  },
  "opencode-go/kimi-k3": {
    name: "Kimi K3",
    contextWindow: 1048576,
    maxOutput: 131072,
    reasoningEfforts: ["low", "high", "max"],
    vision: true,
    price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
    wire: "openai-completions",
  },
  "opencode-go/minimax-m2.5": {
    name: "MiniMax-M2.5",
    contextWindow: 204800,
    maxOutput: 65536,
    reasoningEfforts: ["low", "medium", "high"],
    vision: false,
    price: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0 },
    wire: "anthropic-messages",
  },
  "openai-codex/gpt-5.5": {
    name: "GPT-5.5",
    contextWindow: 272000,
    maxOutput: 128000,
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    vision: true,
    price: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
    wire: "openai-codex-responses",
  },
  "xai/grok-4.6": {
    name: "Grok 4.6",
    contextWindow: 500000,
    maxOutput: 500000,
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    vision: true,
    price: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
    wire: "openai-responses",
  },
};

export function metadataFor(modelId: string): ModelMetadata | undefined {
  return BUNDLED_METADATA[modelId];
}
