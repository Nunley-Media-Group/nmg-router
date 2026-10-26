import { describe, expect, it } from "vitest";
import { createAutoTrigger, type TriggerDeps } from "../../src/compaction/auto-trigger.ts";
import { shouldCompact, thresholdTokens } from "../../src/compaction/threshold.ts";
import { MAIN_LOOP, createSessionTracker } from "../../src/routing/session-tracker.ts";
import { usageOf } from "../support/fake-turn.ts";

const ROUTED = "opencode-go/glm-5.1";
const WINDOW = 128000;

// Waits for the callbacks the fake clock scheduled.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function triggerFixture(overrides: Partial<TriggerDeps> = {}) {
  const tracker = createSessionTracker();
  const compacts: number[] = [];
  const delays: number[] = [];
  const debug: string[] = [];
  const deps: TriggerDeps = {
    tracker,
    contextWindow: async () => WINDOW,
    after: (ms, fn) => {
      delays.push(ms);
      setTimeout(fn, 0);
    },
    compact: async () => {
      compacts.push(compacts.length);
      return { messages: [] };
    },
    debug: (text) => debug.push(text),
    ...overrides,
  };
  return { tracker, deps, compacts, delays, debug };
}

// AC2: the threshold is the window less the larger of 15% and 16384 tokens.
describe("the compaction threshold", () => {
  it("is 108800 tokens for a 128000-token window", () => {
    expect(thresholdTokens(128000)).toBe(108800);
  });

  it("is reached at 108800 tokens and not at 108799", () => {
    expect(shouldCompact(108800, 128000)).toBe(true);
    expect(shouldCompact(108799, 128000)).toBe(false);
  });
});

// AC2: a main-loop turn that ends at the threshold starts compaction, and one below it does nothing.
describe("the main-loop trigger", () => {
  it("schedules a compaction when a routed turn ends at the threshold", async () => {
    const { tracker, deps, compacts, delays } = triggerFixture();
    tracker.recordStep(MAIN_LOOP, ROUTED);
    tracker.recordUsage(MAIN_LOOP, usageOf(108800));

    await createAutoTrigger(deps).onTurnComplete();
    await tick();

    expect(delays).toEqual([0]);
    expect(compacts).toHaveLength(1);
  });

  it("does nothing when the routed turn ends one token below the threshold", async () => {
    const { tracker, deps, compacts, delays } = triggerFixture();
    tracker.recordStep(MAIN_LOOP, ROUTED);
    tracker.recordUsage(MAIN_LOOP, usageOf(108799));

    await createAutoTrigger(deps).onTurnComplete();
    await tick();

    expect(delays).toEqual([]);
    expect(compacts).toEqual([]);
  });

  it("does nothing for a Claude model, whose window the engine already handles", async () => {
    const { tracker, deps, delays } = triggerFixture({ contextWindow: async () => undefined });
    tracker.recordStep(MAIN_LOOP, "claude-sonnet-5-5");
    tracker.recordUsage(MAIN_LOOP, usageOf(500000));

    await createAutoTrigger(deps).onTurnComplete();

    expect(delays).toEqual([]);
  });

  it("starts one compaction at a time, and retries at the next turn end after a rejected start", async () => {
    let fail = true;
    const attempts: number[] = [];
    const { tracker, deps, debug, delays } = triggerFixture({
      compact: async () => {
        attempts.push(attempts.length);
        if (fail) throw new Error("a turn is running");
        return { messages: [] };
      },
    });
    tracker.recordStep(MAIN_LOOP, ROUTED);
    tracker.recordUsage(MAIN_LOOP, usageOf(120000));
    const trigger = createAutoTrigger(deps);

    await trigger.onTurnComplete();
    await trigger.onTurnComplete();
    await tick();
    expect(attempts).toHaveLength(1);
    expect(debug).toEqual(["nmg-router could not start compaction; it will be retried at the next turn end."]);

    fail = false;
    await trigger.onTurnComplete();
    await tick();
    expect(attempts).toHaveLength(2);
    expect(delays).toEqual([0, 0]);
  });

  it("never throws, and logs once, when the window cannot be read", async () => {
    const { tracker, deps, debug, delays } = triggerFixture({
      contextWindow: async () => {
        throw new Error("catalog unavailable");
      },
    });
    tracker.recordStep(MAIN_LOOP, ROUTED);
    tracker.recordUsage(MAIN_LOOP, usageOf(120000));

    await expect(createAutoTrigger(deps).onTurnComplete()).resolves.toBeUndefined();
    expect(delays).toEqual([]);
    expect(debug).toEqual(["nmg-router could not check the context threshold."]);
  });
});
