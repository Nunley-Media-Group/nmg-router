import { describe, expect, it } from "vitest";
import { formatPrice, formatSpeed, formatTokens } from "../../src/hub/format.ts";
import { recentOf, withRecent, RECENT_LIMIT } from "../../src/hub/recent.ts";
import { CLAUDE_LINEUP, claudeMatches } from "../../src/hub/claude-lineup.ts";
import { compareVersions, extractVersionNumber } from "../../src/hub/version-order.ts";

describe("hub labels", () => {
  it("writes token counts in thousands and millions", () => {
    expect(formatTokens(128000)).toBe("128k");
    expect(formatTokens(1000000)).toBe("1m");
    expect(formatTokens(1500000)).toBe("1.5m");
    expect(formatTokens(202752)).toBe("203k");
  });

  it("writes prices per million tokens, `free` for zero, and nothing without a price", () => {
    expect(formatPrice({ input: 0.6, output: 2.4 })).toBe("$0.6/2.4");
    expect(formatPrice({ input: 0, output: 0 })).toBe("free");
    expect(formatPrice(undefined)).toBeUndefined();
  });

  it("writes speed in whole tokens per second", () => {
    expect(formatSpeed(118.4)).toBe("118t/s");
  });
});

describe("version order", () => {
  it("reads the version from dotted, dashed and leading numbers", () => {
    expect(extractVersionNumber("kimi-k3.1-pro")).toBe(3.1);
    expect(extractVersionNumber("claude-opus-5-5")).toBe(5.5);
    expect(extractVersionNumber("glm-5")).toBe(5);
    expect(extractVersionNumber("opus")).toBe(0);
  });

  it("puts the newer version first, then the -latest id before the same version's plain id", () => {
    expect(["claude-opus-4-5", "claude-opus-5-5"].sort(compareVersions)).toEqual(["claude-opus-5-5", "claude-opus-4-5"]);
    expect(["gpt-5", "gpt-5-latest"].sort(compareVersions)).toEqual(["gpt-5-latest", "gpt-5"]);
  });
});

describe("recent use", () => {
  it("keeps the newest ids, up to the limit, with their times", () => {
    let map: unknown = undefined;
    for (let index = 0; index < RECENT_LIMIT + 10; index += 1) {
      map = withRecent(map, `opencode-go/m-${index}`, index);
    }
    const kept = recentOf(map);
    expect(Object.keys(kept)).toHaveLength(RECENT_LIMIT);
    expect(kept["opencode-go/m-0"]).toBeUndefined();
    expect(kept[`opencode-go/m-${RECENT_LIMIT + 9}`]).toBe(RECENT_LIMIT + 9);
  });

  it("moves an id used again to its new time", () => {
    const first = withRecent(undefined, "opus", 1);
    expect(withRecent(first, "opus", 9)).toEqual({ opus: 9 });
  });

  it("ignores stored values that are not times", () => {
    expect(recentOf({ opus: 1, sonnet: "x", haiku: null })).toEqual({ opus: 1 });
    expect(recentOf(undefined)).toEqual({});
  });
});

describe("Claude lineup", () => {
  it("lists the five aliases with labels", () => {
    expect(CLAUDE_LINEUP.map((entry) => entry.alias)).toEqual(["default", "opus", "sonnet", "haiku", "fable"]);
  });

  it("matches an alias to a full Claude model id that carries it between dashes", () => {
    expect(claudeMatches("opus", "claude-opus-5-5")).toBe(true);
    expect(claudeMatches("opus", "opus")).toBe(true);
    expect(claudeMatches("opus", "claude-sonnet-5-5")).toBe(false);
  });
});
