import { describe, expect, it } from "vitest";
import { claudeUsageReport, epochOf, failureOf, percentOf, windowLabel } from "../../src/usage/report.ts";

describe("percentOf", () => {
  it("rounds a finite number to a whole percent and clamps it to 0 through 100", () => {
    expect(percentOf(23.4)).toBe(23);
    expect(percentOf(23.5)).toBe(24);
    expect(percentOf(-4)).toBe(0);
    expect(percentOf(140)).toBe(100);
  });

  it("answers undefined for anything that is not a finite number", () => {
    expect(percentOf("23")).toBeUndefined();
    expect(percentOf(Number.NaN)).toBeUndefined();
    expect(percentOf(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(percentOf(undefined)).toBeUndefined();
  });
});

describe("windowLabel", () => {
  it("names a window by whole days, else whole hours, else minutes", () => {
    expect(windowLabel(300)).toBe("5h");
    expect(windowLabel(10080)).toBe("7d");
    expect(windowLabel(90)).toBe("90m");
    expect(windowLabel(1440)).toBe("1d");
    expect(windowLabel(60)).toBe("1h");
  });
});

describe("epochOf", () => {
  it("reads a number as seconds, or as milliseconds above 1e12", () => {
    expect(epochOf(1798000000)).toBe(1798000000000);
    expect(epochOf(1798000000000)).toBe(1798000000000);
  });

  it("reads a string as an ISO date", () => {
    expect(epochOf("2026-12-23T04:00:00Z")).toBe(Date.parse("2026-12-23T04:00:00Z"));
  });

  it("answers undefined for anything else", () => {
    expect(epochOf("not a date")).toBeUndefined();
    expect(epochOf(Number.NaN)).toBeUndefined();
    expect(epochOf({})).toBeUndefined();
  });
});

describe("failureOf", () => {
  it("maps an authentication refusal to unauthenticated, any other status to unavailable", () => {
    expect(failureOf({ kind: "status", status: 401 })).toBe("unauthenticated");
    expect(failureOf({ kind: "status", status: 403 })).toBe("unauthenticated");
    expect(failureOf({ kind: "status", status: 500 })).toBe("unavailable");
  });

  it("maps an unreachable host to offline and an unreadable body to malformed", () => {
    expect(failureOf({ kind: "offline" })).toBe("offline");
    expect(failureOf({ kind: "malformed" })).toBe("malformed");
  });
});

describe("claudeUsageReport", () => {
  it("labels five_hour as 5h, seven_day as 7d and spend_limit as spend, and any other kind by its own name", () => {
    const report = claudeUsageReport([
      { kind: "five_hour", percentUsed: 10 },
      { kind: "seven_day", percentUsed: 20 },
      { kind: "spend_limit", percentUsed: 30 },
      { kind: "seven_day_opus", percentUsed: 40 },
    ]);
    expect(report.windows).toEqual([
      { id: "five_hour", label: "5h", usedPercent: 10 },
      { id: "seven_day", label: "7d", usedPercent: 20 },
      { id: "spend_limit", label: "spend", usedPercent: 30 },
      { id: "seven_day_opus", label: "seven_day_opus", usedPercent: 40 },
    ]);
  });

  it("rounds each percent to a whole number, clamps it, and drops a window whose percent is not a finite number", () => {
    const report = claudeUsageReport([
      { kind: "five_hour", percentUsed: 23.5 },
      { kind: "seven_day", percentUsed: 23.4 },
      { kind: "spend_limit", percentUsed: 112.5 },
      { kind: "other", percentUsed: Number.NaN },
    ]);
    expect(report.windows.map((window) => window.usedPercent)).toEqual([24, 23, 100]);
  });

  it("reads an ISO resetsAt as epoch milliseconds and leaves an unparseable one out", () => {
    const report = claudeUsageReport([
      { kind: "five_hour", percentUsed: 1, resetsAt: "2026-12-23T04:26:40Z" },
      { kind: "seven_day", percentUsed: 2, resetsAt: "not a date" },
    ]);
    expect(report.windows[0]?.resetsAt).toBe(Date.parse("2026-12-23T04:26:40Z"));
    expect(report.windows[1]).toEqual({ id: "seven_day", label: "7d", usedPercent: 2 });
  });

  it("is empty with no windows", () => {
    expect(claudeUsageReport([])).toEqual({ windows: [] });
  });
});
