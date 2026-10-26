import { describe, expect, it } from "vitest";
import { globMatch, modelEnabled } from "../../src/models/patterns.ts";

describe("enabledModels patterns (AC4)", () => {
  it.each([
    ["opencode-go/glm-*", "opencode-go/glm-5.1", true],
    ["opencode-go/glm-*", "opencode-go/kimi-k3", false],
    ["glm-5.?", "glm-5.1", true],
    ["glm-5.?", "glm-5.10", false],
    ["GLM-5.1", "glm-5.1", true],
    ["glm-5.1", "glm-5.10", false],
    ["", "glm-5.1", false],
  ])("matches %s against %s as %s", (pattern, text, expected) => {
    expect(globMatch(pattern, text)).toBe(expected);
  });

  it("treats regular-expression characters as plain text", () => {
    expect(globMatch("a.b", "axb")).toBe(false);
    expect(globMatch("a+b", "a+b")).toBe(true);
  });

  it("allows everything when the list is absent or empty", () => {
    expect(modelEnabled([], "xai", "grok-4.6")).toBe(true);
  });

  it("tests both the qualified and the bare model name", () => {
    expect(modelEnabled(["my-relay/*"], "my-relay", "any")).toBe(true);
    expect(modelEnabled(["glm-*"], "opencode-go", "glm-5.1")).toBe(true);
    expect(modelEnabled(["kimi-*"], "opencode-go", "glm-5.1")).toBe(false);
  });

  it("allows no model when a non-empty list matches nothing", () => {
    expect(modelEnabled(["nothing-here"], "xai", "grok-4.6")).toBe(false);
  });
});
