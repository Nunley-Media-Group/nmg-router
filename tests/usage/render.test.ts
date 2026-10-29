import { describe, expect, it } from "vitest";
import { renderUsageEntries, windowText } from "../../src/usage/render.ts";

const NOW = Date.parse("2026-12-23T02:16:40Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The reset suffix a window line shows for a reset that many milliseconds away.
function resetLine(ms: number): string {
  const entries = renderUsageEntries(
    [{ name: "Provider", reading: { kind: "ok", report: { windows: [{ id: "w", label: "5h", usedPercent: 1, resetsAt: NOW + ms }] } } }],
    NOW,
  );
  return entries.split("\n")[2] ?? "";
}

describe("windowText", () => {
  it("reads a window as its label and whole-number percent", () => {
    expect(windowText({ id: "primary", label: "5h", usedPercent: 23 })).toBe("5h 23%");
  });
});

describe("renderUsageEntries", () => {
  it("heads the text, then names each provider above its indented window lines", () => {
    const text = renderUsageEntries(
      [
        {
          name: "OpenAI Codex",
          reading: {
            kind: "ok",
            report: {
              windows: [
                { id: "primary", label: "5h", usedPercent: 23, resetsAt: NOW + 2 * HOUR + 10 * MINUTE },
                { id: "secondary", label: "7d", usedPercent: 41 },
              ],
            },
          },
        },
      ],
      NOW,
    );
    expect(text).toBe(["Plan usage", "OpenAI Codex", "  5h 23% · resets in 2h 10m", "  7d 41%"].join("\n"));
  });

  it("says no reading is available for a provider without a usage source", () => {
    expect(renderUsageEntries([{ name: "xAI", reading: "none" }], NOW)).toBe(
      ["Plan usage", "xAI", "  No usage reading available"].join("\n"),
    );
  });

  it("says why a reading could not be read, by its failure kind", () => {
    expect(renderUsageEntries([{ name: "OpenCode Go", reading: { kind: "offline" } }], NOW)).toBe(
      ["Plan usage", "OpenCode Go", "  Usage could not be read: offline"].join("\n"),
    );
  });

  it("floors each reset unit: days and hours, then hours and minutes, then minutes", () => {
    expect(resetLine(2 * DAY + 3 * HOUR + 4 * MINUTE)).toBe("  5h 1% · resets in 2d 3h");
    expect(resetLine(HOUR + 5 * MINUTE + 30_000)).toBe("  5h 1% · resets in 1h 5m");
    expect(resetLine(15 * MINUTE + 59_000)).toBe("  5h 1% · resets in 15m");
    expect(resetLine(30_000)).toBe("  5h 1% · resets in under 1m");
  });

  it("says a reset that has passed resets now", () => {
    expect(resetLine(0)).toBe("  5h 1% · resets now");
    expect(resetLine(-5 * MINUTE)).toBe("  5h 1% · resets now");
  });
});
