import { describe, expect, it } from "vitest";
import type { ToolInfo } from "claude-code";
import { offeredTools } from "../../src/tools/offered-tools.ts";

const listed: ToolInfo[] = [
  { name: "Read", description: "Read a file", mcp: false },
  { name: "mcp__docs__search", description: "Search the docs", mcp: true },
  { name: "mcp__notes__add", description: "Add a note", mcp: true },
];

describe("offered tools", () => {
  it("sends only the offered built-in tools, each with its schema and description", () => {
    const { tools, skipped } = offeredTools(["Read"], listed);
    expect(tools).toEqual([{ name: "Read", description: "Read a file", schema: expect.objectContaining({ type: "object" }) }]);
    expect(skipped).toEqual([]);
  });

  it("leaves an MCP tool out and names it when its schema is not exposed", () => {
    const { tools, skipped } = offeredTools(["Read", "mcp__docs__search"], listed);
    expect(tools.map((tool) => tool.name)).toEqual(["Read"]);
    expect(skipped).toEqual(["mcp__docs__search"]);
  });

  it("includes an MCP tool whose schema the source returns", () => {
    const source = { schema: (name: string) => (name === "mcp__notes__add" ? { type: "object" as const, properties: {} } : undefined) };
    const { tools } = offeredTools(["mcp__notes__add"], listed, undefined, source);
    expect(tools.map((tool) => tool.name)).toEqual(["mcp__notes__add"]);
  });

  it("does not read an inherited property as a schema", () => {
    const { tools, skipped } = offeredTools(["constructor", "toString"], listed);
    expect(tools).toEqual([]);
    expect(skipped).toEqual(["constructor", "toString"]);
  });
});
