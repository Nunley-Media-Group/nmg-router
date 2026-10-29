import type { HttpOutcome } from "../providers/http.ts";

// The provider-agnostic plan usage. A usage source reads one of these, and both the
// status line and `/usage` render only this shape. Nothing here is provider-specific.

export type UsageWindow = {
  // The provider's own name for the window, such as `primary` or `weekly`.
  readonly id: string;
  readonly label: string;
  // A whole number from 0 to 100.
  readonly usedPercent: number;
  // Epoch milliseconds.
  readonly resetsAt?: number;
};

export type UsageReport = { readonly windows: readonly UsageWindow[] };

export type UsageFailureKind = "unauthenticated" | "unavailable" | "offline" | "malformed";

export type UsageOutcome = { readonly kind: "ok"; readonly report: UsageReport } | { readonly kind: UsageFailureKind };

// A whole number from 0 to 100, or undefined for anything that is not a finite number.
export function percentOf(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Whole days as `<n>d`, else whole hours as `<n>h`, else minutes as `<n>m`.
export function windowLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

// A number is a Unix time in seconds, or in milliseconds above 1e12. A string is an ISO date.
export function epochOf(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// Maps a failed read to its kind. The host's outcome carries no body or header, so none reaches here.
export function failureOf(outcome: Exclude<HttpOutcome, { readonly kind: "ok" }>): UsageFailureKind {
  switch (outcome.kind) {
    case "status":
      return outcome.status === 401 || outcome.status === 403 ? "unauthenticated" : "unavailable";
    case "offline":
      return "offline";
    case "malformed":
      return "malformed";
  }
}

// The record a parser reads a body or a header block as. Anything that is not a plain object reads as empty.
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
