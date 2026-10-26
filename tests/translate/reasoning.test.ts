import { describe, expect, it } from "vitest";
import { applyReasoning, clamp, toEffort } from "../../src/translate/reasoning.ts";

describe("effort from the step", () => {
  it("keeps a named level and maps a budget to the level whose range it falls in", () => {
    expect(toEffort("high")).toBe("high");
    expect(toEffort(undefined)).toBeUndefined();
    expect(toEffort(1024)).toBe("minimal");
    expect(toEffort(1025)).toBe("low");
    expect(toEffort(8192)).toBe("medium");
    expect(toEffort(16384)).toBe("high");
    expect(toEffort(32767)).toBe("xhigh");
    expect(toEffort(32768)).toBe("max");
  });
});

describe("clamp", () => {
  it("keeps an exact match", () => {
    expect(clamp("low", ["low", "medium"])).toBe("low");
  });

  it("takes the highest supported level at or below the request", () => {
    expect(clamp("high", ["low", "medium"])).toBe("medium");
    expect(clamp("max", ["low", "medium"])).toBe("medium");
  });

  it("falls to the lowest supported level when none is at or below the request", () => {
    expect(clamp("minimal", ["low", "medium"])).toBe("low");
  });

  it("gives none for a model with no levels, or a step with no effort", () => {
    expect(clamp("high", [])).toBeUndefined();
    expect(clamp(undefined, ["low"])).toBeUndefined();
  });
});

describe("reasoning mappers", () => {
  it("writes the effort into its dotted field", () => {
    const body: Record<string, unknown> = { model: "m" };
    applyReasoning(body, { transport: "effort", field: "reasoning.effort" }, "medium");
    expect(body).toEqual({ model: "m", reasoning: { effort: "medium" } });
  });

  it("writes an extended-thinking budget", () => {
    const body: Record<string, unknown> = {};
    applyReasoning(body, { transport: "budget" }, "high");
    expect(body).toEqual({ thinking: { type: "enabled", budget_tokens: 16384 } });
  });

  it("writes the named value the model's levels give for the effort", () => {
    const body: Record<string, unknown> = {};
    applyReasoning(body, { transport: "level", field: "thinking.mode", levels: { high: "deep" } }, "high");
    expect(body).toEqual({ thinking: { mode: "deep" } });
  });

  it("writes nothing when there is no effort", () => {
    const body: Record<string, unknown> = {};
    applyReasoning(body, { transport: "effort", field: "reasoning_effort" }, undefined);
    expect(body).toEqual({});
  });
});
