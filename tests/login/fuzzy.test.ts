import { describe, expect, it } from "vitest";
import { fuzzyFilter } from "../../src/login/fuzzy.ts";

const rows = ["OpenCode Go", "ClinePass", "OpenAI Codex", "xAI", "Anthropic"];

describe("fuzzyFilter (AC5)", () => {
  it("returns every row, in order, for an empty query", () => {
    expect(fuzzyFilter(rows, "  ", (row) => row)).toEqual(rows);
  });

  it("matches a case-insensitive subsequence", () => {
    expect(fuzzyFilter(rows, "ocg", (row) => row)).toEqual(["OpenCode Go"]);
    expect(fuzzyFilter(rows, "XAI", (row) => row)).toEqual(["xAI"]);
  });

  it("requires every word of the query to match", () => {
    expect(fuzzyFilter(rows, "open codex", (row) => row)).toEqual(["OpenAI Codex"]);
    expect(fuzzyFilter(rows, "open xai", (row) => row)).toEqual([]);
  });

  it("ranks the tighter match first", () => {
    const ranked = fuzzyFilter(["a-x-b", "ab"], "ab", (row) => row);
    expect(ranked).toEqual(["ab", "a-x-b"]);
  });

  it("keeps rows that tie in the order they came in", () => {
    expect(fuzzyFilter(["one a", "two a"], "a", (row) => row)).toEqual(["one a", "two a"]);
  });
});
