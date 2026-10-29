import type { UsageOutcome, UsageWindow } from "./report.ts";

// The text of usage. The status line and `/usage` both render through here, so no
// call site builds usage text by concatenation.

export function windowText(window: UsageWindow): string {
  return `${window.label} ${window.usedPercent}%`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Time until a reset, floored in each unit: `Xd Yh`, `Xh Ym`, `Ym`, or `under 1m`.
function durationText(ms: number): string {
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)}h ${Math.floor((ms % HOUR_MS) / MINUTE_MS)}m`;
  if (ms >= MINUTE_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  return "under 1m";
}

function windowLine(window: UsageWindow, now: number): string {
  if (window.resetsAt === undefined) return `  ${windowText(window)}`;
  const remaining = window.resetsAt - now;
  const reset = remaining <= 0 ? "resets now" : `resets in ${durationText(remaining)}`;
  return `  ${windowText(window)} · ${reset}`;
}

export type UsageEntry = {
  readonly name: string;
  // "none" for a provider with no usage source, which has nothing to read.
  readonly reading: UsageOutcome | "none";
};

// The `/usage` text after the built-in view: a heading, then each entry's name and its indented lines.
export function renderUsageEntries(entries: readonly UsageEntry[], now: number): string {
  const lines = ["Plan usage"];
  for (const entry of entries) {
    lines.push(entry.name, ...readingLines(entry.reading, now));
  }
  return lines.join("\n");
}

function readingLines(reading: UsageOutcome | "none", now: number): string[] {
  if (reading === "none") return ["  No usage reading available"];
  if (reading.kind !== "ok") return [`  Usage could not be read: ${reading.kind}`];
  if (reading.report.windows.length === 0) return ["  No usage reading available"];
  return reading.report.windows.map((window) => windowLine(window, now));
}
