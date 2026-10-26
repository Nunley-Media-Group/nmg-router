import type { Effort } from "../providers/types.ts";

// The status line after a routed step: the model and the thinking level it ran at.

export type Thinking = { readonly kind: "effort"; readonly effort: Effort } | { readonly kind: "off" } | { readonly kind: "unsupported" };

// A model with no supported levels cannot think. One that can, but got no effort on the step, is off.
export function thinkingOf(supported: readonly Effort[] | undefined, effort: Effort | undefined): Thinking {
  if (supported === undefined || supported.length === 0) return { kind: "unsupported" };
  return effort === undefined ? { kind: "off" } : { kind: "effort", effort };
}

export function statusText(model: string, thinking: Thinking): string {
  const level = thinking.kind === "effort" ? thinking.effort : thinking.kind;
  return `${model} · thinking ${level}`;
}

// The error state stays on the line until a later routed step succeeds.
export function errorStatusText(model: string, provider: string, kind: string): string {
  return `${model} · ${provider} error: ${kind}`;
}
