import { describe, expect, it } from "vitest";
import type { ToolInfo } from "claude-code";
import { offeredToolNames, offeredTools, searchLoadedTools } from "../../src/tools/offered-tools.ts";
import { BUILTIN_TOOL_SCHEMAS } from "../../src/tools/builtin-schemas.ts";
import { SUBAGENT_HANDBACK, SUPPLEMENT_TOOL_SCHEMAS, SUPPLEMENT_TOOL_SOURCE_VERSION, TOOL_SCHEMAS } from "../../src/tools/supplement-schemas.ts";
import type { ApiMessageInput } from "../../src/translate/messages.ts";

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

// A ToolSearch call and its result, which loaded WebFetch by a tool_reference block.
const SEARCHED: ApiMessageInput[] = [
  { role: "assistant", content: [{ type: "tool_use", id: "search_1", name: "ToolSearch", input: { query: "select:WebFetch" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "search_1", content: [{ type: "tool_reference", tool_name: "WebFetch" }] }] },
];

const HOST_TOOLS: ToolInfo[] = [
  { name: "Read", description: "Read a file", mcp: false },
  { name: "WebFetch", description: "Fetch a page", mcp: false },
  { name: SUBAGENT_HANDBACK, description: "Deliver your final report", mcp: false },
];

// AC3, FR8: routed requests offer SubagentHandback in a subagent loop and the tools ToolSearch loaded.
describe("offered tool names", () => {
  it("adds the ToolSearch-loaded tools and, in a subagent loop, SubagentHandback, deduplicated in order", () => {
    expect(offeredToolNames(["Read", "WebFetch"], SEARCHED, HOST_TOOLS, "agent-1")).toEqual(["Read", "WebFetch", SUBAGENT_HANDBACK]);
    expect(offeredToolNames(["Read"], SEARCHED, HOST_TOOLS, "agent-1")).toEqual(["Read", "WebFetch", SUBAGENT_HANDBACK]);
  });

  it("never offers SubagentHandback to the main loop, even when a capture named it", () => {
    expect(offeredToolNames(["Read", SUBAGENT_HANDBACK], [], HOST_TOOLS, undefined)).toEqual(["Read"]);
  });

  it("offers SubagentHandback only when the host lists it", () => {
    expect(offeredToolNames(["Read"], [], [HOST_TOOLS[0]!], "agent-1")).toEqual(["Read"]);
  });

  it("reads tool_reference blocks only from ToolSearch results", () => {
    const other: ApiMessageInput[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "read_1", name: "Read", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read_1", content: [{ type: "tool_reference", tool_name: "Bash" }] }] },
    ];
    expect(searchLoadedTools([...SEARCHED, ...other])).toEqual(["WebFetch"]);
  });
});

describe("the supplement schemas", () => {
  it("gives SubagentHandback the 2.1.310 schema, a required message string", () => {
    expect(SUPPLEMENT_TOOL_SOURCE_VERSION).toBe("2.1.310");
    expect(SUPPLEMENT_TOOL_SCHEMAS[SUBAGENT_HANDBACK]).toEqual({
      type: "object",
      properties: { message: { type: "string", description: "Your full report for your caller" } },
      required: ["message"],
      additionalProperties: false,
    });
    const { tools, skipped } = offeredTools([SUBAGENT_HANDBACK], HOST_TOOLS);
    expect(tools.map((tool) => tool.name)).toEqual([SUBAGENT_HANDBACK]);
    expect(skipped).toEqual([]);
  });

  it("lets a generated entry win on a clash", () => {
    for (const name of Object.keys(BUILTIN_TOOL_SCHEMAS)) expect(TOOL_SCHEMAS[name]).toBe(BUILTIN_TOOL_SCHEMAS[name]);
  });
});
