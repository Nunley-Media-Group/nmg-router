import type { Effort } from "../providers/types.ts";

// Maps the step's effort to the model's reasoning field. A requested level is
// clamped to the levels the model supports, so `max` on a model with `low` and
// `medium` becomes `medium`.

export const EFFORT_ORDER: readonly Effort[] = ["minimal", "low", "medium", "high", "xhigh", "max"];

// The step's effort: a named level, or a token budget.
export type RequestedEffort = "low" | "medium" | "high" | "xhigh" | "max" | number;

export const BUDGET_TOKENS: Readonly<Record<Effort, number>> = {
  minimal: 1024,
  low: 4096,
  medium: 8192,
  high: 16384,
  xhigh: 32768,
  max: 32768,
};

export function budgetOf(effort: Effort): number {
  return BUDGET_TOKENS[effort];
}

function effortOfBudget(tokens: number): Effort {
  if (tokens <= 1024) return "minimal";
  if (tokens <= 4096) return "low";
  if (tokens <= 8192) return "medium";
  if (tokens <= 16384) return "high";
  if (tokens <= 32767) return "xhigh";
  return "max";
}

export function toEffort(requested: RequestedEffort | undefined): Effort | undefined {
  if (requested === undefined) return undefined;
  return typeof requested === "number" ? effortOfBudget(requested) : requested;
}

// The highest supported level at or below the request; else the lowest supported.
// An exact match is kept. No levels, or no request, gives none.
export function clamp(effort: Effort | undefined, supported: readonly Effort[]): Effort | undefined {
  if (effort === undefined || supported.length === 0) return undefined;
  if (supported.includes(effort)) return effort;
  const rank = (level: Effort): number => EFFORT_ORDER.indexOf(level);
  const ranked = [...supported].sort((a, b) => rank(a) - rank(b));
  const atOrBelow = ranked.filter((level) => rank(level) <= rank(effort));
  return atOrBelow.at(-1) ?? ranked[0];
}

export type ReasoningMapper =
  // Writes the effort as a string into a dotted field, such as `reasoning_effort` or `reasoning.effort`.
  | { readonly transport: "effort"; readonly field: string }
  // Writes an extended-thinking budget: `thinking: { type: "enabled", budget_tokens }`.
  | { readonly transport: "budget" }
  // Writes the named value the model's metadata gives for the effort.
  | { readonly transport: "level"; readonly field: string; readonly levels: Readonly<Partial<Record<Effort, string | boolean>>> };

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.at(-1) ?? path;
  let node = target;
  for (const key of keys.slice(0, -1)) {
    const existing = node[key];
    if (typeof existing !== "object" || existing === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

// Writes nothing when the effort is absent, which is how a non-reasoning model
// or a step without effort gets no reasoning field.
export function applyReasoning(body: Record<string, unknown>, mapper: ReasoningMapper, effort: Effort | undefined): void {
  if (effort === undefined) return;
  switch (mapper.transport) {
    case "effort":
      setPath(body, mapper.field, effort);
      return;
    case "budget":
      body.thinking = { type: "enabled", budget_tokens: BUDGET_TOKENS[effort] };
      return;
    case "level": {
      const value = mapper.levels[effort];
      if (value !== undefined) setPath(body, mapper.field, value);
      return;
    }
  }
}
