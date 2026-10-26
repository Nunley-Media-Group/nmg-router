import { describe, expect, it } from "vitest";
import type { ToolInfo } from "claude-code";
import { hostOffersHandback, offeredToolNames, offeredTools, searchLoadedTools } from "../../src/tools/offered-tools.ts";
import { BUILTIN_TOOL_SCHEMAS } from "../../src/tools/builtin-schemas.ts";
import {
  SUBAGENT_HANDBACK,
  SUPPLEMENT_TOOL_DESCRIPTIONS,
  SUPPLEMENT_TOOL_SCHEMAS,
  SUPPLEMENT_TOOL_SOURCE_VERSION,
  TOOL_SCHEMAS,
} from "../../src/tools/supplement-schemas.ts";
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

// The host's reminder that a subagent's report goes through SubagentHandback, as auto mode adds it on 2.1.311.
const REMINDER: ApiMessageInput = {
  role: "user",
  content: [{ type: "text", text: "Your final report is delivered through SubagentHandback." }],
};

// The session's tool listing, as 2.1.310 and 2.1.311 answer `$.tool.list()` in any
// loop: SubagentHandback is never in it.
const HOST_TOOLS: ToolInfo[] = [
  { name: "Read", description: "Read a file", mcp: false },
  { name: "WebFetch", description: "Fetch a page", mcp: false },
];

// AC3, FR8: routed requests offer SubagentHandback in a subagent loop and the tools ToolSearch loaded.
describe("offered tool names", () => {
  it("adds the ToolSearch-loaded tools and, in a subagent loop, SubagentHandback, deduplicated in order", () => {
    expect(offeredToolNames(["Read", "WebFetch"], [REMINDER, ...SEARCHED], "agent-1")).toEqual(["Read", "WebFetch", SUBAGENT_HANDBACK]);
    expect(offeredToolNames(["Read"], [REMINDER, ...SEARCHED], "agent-1")).toEqual(["Read", "WebFetch", SUBAGENT_HANDBACK]);
  });

  it("never offers SubagentHandback to the main loop, even when a capture named it", () => {
    expect(offeredToolNames(["Read", SUBAGENT_HANDBACK], [REMINDER], undefined)).toEqual(["Read"]);
  });

  it("offers SubagentHandback to a subagent whose host reminder names it, though the host never lists it", () => {
    expect(HOST_TOOLS.some((tool) => tool.name === SUBAGENT_HANDBACK)).toBe(false);
    expect(offeredToolNames(["Read"], [REMINDER], "agent-1")).toEqual(["Read", SUBAGENT_HANDBACK]);
  });

  it("does not offer SubagentHandback to a subagent the host gave none, as outside auto mode", () => {
    expect(offeredToolNames(["Read", SUBAGENT_HANDBACK], SEARCHED, "agent-1")).toEqual(["Read", "WebFetch"]);
  });

  it("reads the reminder only from user text, not the model's own text or a tool result", () => {
    const echoed: ApiMessageInput[] = [
      { role: "assistant", content: [{ type: "text", text: "I will call SubagentHandback." }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read_1", content: [{ type: "text", text: "SubagentHandback" }] }] },
    ];
    expect(hostOffersHandback(echoed)).toBe(false);
    expect(hostOffersHandback([REMINDER])).toBe(true);
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

  it("gives SubagentHandback the host's own description when the listing does not name it", () => {
    const [tool] = offeredTools([SUBAGENT_HANDBACK], HOST_TOOLS).tools;
    expect(tool?.description).toBe(SUPPLEMENT_TOOL_DESCRIPTIONS[SUBAGENT_HANDBACK]);
    expect(tool?.description).toMatch(/^Deliver your final report to the agent that spawned you \(your caller\)\./);
    expect(tool?.description).toContain("call SubagentHandback({message: <your full report>})");
    expect(tool?.description).toContain("plain text you write at the end of your run is NOT delivered");
  });

  it("prefers a listed tool's own description over the supplement's", () => {
    const listing = [{ name: SUBAGENT_HANDBACK, description: "From the host", mcp: false }];
    expect(offeredTools([SUBAGENT_HANDBACK], listing).tools[0]?.description).toBe("From the host");
  });

  it("lets a generated entry win on a clash", () => {
    for (const name of Object.keys(BUILTIN_TOOL_SCHEMAS)) expect(TOOL_SCHEMAS[name]).toBe(BUILTIN_TOOL_SCHEMAS[name]);
  });
});
