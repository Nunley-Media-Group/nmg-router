import type { Price } from "../providers/types.ts";

// The compact labels the hub draws: 128k, 1m, $0.6/2.4, free and 118t/s.

function trimmed(value: number): string {
  return String(Number(value.toFixed(3)));
}

// Token counts in thousands and millions: 128000 is 128k, 1000000 is 1m.
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${trimmed(count / 1_000_000)}m`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}

// USD per million tokens as `$input/output`, `free` when both are zero, and
// undefined when the model has no price.
export function formatPrice(price: Price | undefined): string | undefined {
  if (price === undefined) return undefined;
  if (price.input === 0 && price.output === 0) return "free";
  return `$${trimmed(price.input)}/${trimmed(price.output)}`;
}

// Output speed in whole tokens per second.
export function formatSpeed(tokensPerSecond: number): string {
  return `${Math.round(tokensPerSecond)}t/s`;
}
