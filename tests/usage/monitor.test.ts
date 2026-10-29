import { describe, expect, it, vi } from "vitest";
import { createUsageMonitor } from "../../src/usage/monitor.ts";
import type { UsageOutcome, UsageReport } from "../../src/usage/report.ts";

const REPORT: UsageReport = { windows: [{ id: "rolling", label: "5h", usedPercent: 12 }] };
const OK: UsageOutcome = { kind: "ok", report: REPORT };

// A clock the test moves by hand, so the throttle is exact.
function clock() {
  let at = 0;
  return { now: () => at, set: (ms: number) => (at = ms) };
}

describe("usage monitor throttle", () => {
  it("sends no read at 59 999 ms after a read and one at 60 000 ms", async () => {
    const time = clock();
    const monitor = createUsageMonitor(time.now);
    const source = vi.fn(async () => OK);

    await monitor.read("opencode-go", "default", source);
    time.set(59_999);
    expect(await monitor.read("opencode-go", "default", source)).toEqual(OK);
    expect(source).toHaveBeenCalledTimes(1);

    time.set(60_000);
    await monitor.read("opencode-go", "default", source);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("shares a read that is still in flight", async () => {
    const monitor = createUsageMonitor(clock().now);
    let finish = (): void => undefined;
    const source = vi.fn(() => new Promise<UsageOutcome>((resolve) => (finish = () => resolve(OK))));

    const first = monitor.read("opencode-go", "default", source);
    const second = monitor.read("opencode-go", "default", source);
    finish();

    expect(await first).toEqual(OK);
    expect(await second).toEqual(OK);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("counts a header reading as a read", async () => {
    const time = clock();
    const monitor = createUsageMonitor(time.now);
    const source = vi.fn(async () => OK);

    monitor.record("opencode-go", "default", REPORT);
    time.set(30_000);
    await monitor.read("opencode-go", "default", source);
    expect(source).not.toHaveBeenCalled();
    expect(monitor.latest("opencode-go", "default")).toEqual(REPORT);

    time.set(60_000);
    await monitor.read("opencode-go", "default", source);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("throttles each provider and account on its own", async () => {
    const monitor = createUsageMonitor(clock().now);
    const source = vi.fn(async () => OK);

    await monitor.read("opencode-go", "default", source);
    await monitor.read("opencode-go", "work", source);
    await monitor.read("openai-codex", "default", source);
    expect(source).toHaveBeenCalledTimes(3);
  });
});

describe("usage monitor outcomes", () => {
  it("keeps the last good report through a failed read, and records the failure as the latest outcome", async () => {
    const time = clock();
    const monitor = createUsageMonitor(time.now);
    await monitor.read("opencode-go", "default", async () => OK);

    time.set(60_000);
    const failed = await monitor.read("opencode-go", "default", async () => ({ kind: "offline" }));

    expect(failed).toEqual({ kind: "offline" });
    expect(monitor.outcome("opencode-go", "default")).toEqual({ kind: "offline" });
    expect(monitor.latest("opencode-go", "default")).toEqual(REPORT);
  });

  it("reads a source that throws as unavailable, and never rejects", async () => {
    const monitor = createUsageMonitor(clock().now);
    const outcome = await monitor.read("opencode-go", "default", async () => {
      throw new Error("provider reply: secret-ish body");
    });

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(monitor.latest("opencode-go", "default")).toBeUndefined();
  });

  it("holds nothing for an account it has not read", () => {
    const monitor = createUsageMonitor(clock().now);
    expect(monitor.latest("openai-codex", undefined)).toBeUndefined();
    expect(monitor.outcome("openai-codex", undefined)).toBeUndefined();
  });
});
