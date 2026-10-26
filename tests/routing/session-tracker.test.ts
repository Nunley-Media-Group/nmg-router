import { describe, expect, it } from "vitest";
import { MAIN_LOOP, createSessionTracker } from "../../src/routing/session-tracker.ts";
import { usageOf } from "../support/fake-turn.ts";

// FR3: the tracker keeps each loop's model and context apart, and remembers the recent routed tool ids.
describe("session tracker", () => {
  it("keeps the latest model of each loop apart", () => {
    const tracker = createSessionTracker();
    tracker.recordStep(MAIN_LOOP, "opencode-go/glm-5.1");
    tracker.recordStep("agent-1", "claude-sonnet-5-5");
    tracker.recordStep(MAIN_LOOP, "opencode-go/kimi-k3.1-pro");

    expect(tracker.model(MAIN_LOOP)).toBe("opencode-go/kimi-k3.1-pro");
    expect(tracker.model("agent-1")).toBe("claude-sonnet-5-5");
    expect(tracker.model("agent-2")).toBeUndefined();
  });

  it("holds the sum of the last usage's four counts, and starts again after a compaction", () => {
    const tracker = createSessionTracker();
    tracker.recordUsage(MAIN_LOOP, {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 4,
    });
    expect(tracker.contextTokens(MAIN_LOOP)).toBe(154);

    tracker.recordUsage(MAIN_LOOP, usageOf(9));
    expect(tracker.contextTokens(MAIN_LOOP)).toBe(9);

    tracker.resetContext(MAIN_LOOP);
    expect(tracker.contextTokens(MAIN_LOOP)).toBe(0);
  });

  it("recognises the 1024 most recent routed tool ids and forgets the older ones", () => {
    const tracker = createSessionTracker();
    for (let index = 0; index < 1025; index += 1) tracker.recordToolId(`call_${index}`);

    expect(tracker.isRoutedTool("call_0")).toBe(false);
    expect(tracker.isRoutedTool("call_1")).toBe(true);
    expect(tracker.isRoutedTool("call_1024")).toBe(true);
    expect(tracker.isRoutedTool("call_claude")).toBe(false);
  });

  it("keeps a tool id it saw again as recent", () => {
    const tracker = createSessionTracker();
    tracker.recordToolId("call_old");
    for (let index = 0; index < 1023; index += 1) tracker.recordToolId(`call_${index}`);
    tracker.recordToolId("call_old");
    tracker.recordToolId("call_new");

    // `call_old` became the newest, so the oldest id, `call_0`, is the one dropped.
    expect(tracker.isRoutedTool("call_old")).toBe(true);
    expect(tracker.isRoutedTool("call_new")).toBe(true);
    expect(tracker.isRoutedTool("call_0")).toBe(false);
  });
});
