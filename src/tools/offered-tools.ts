import type { ToolInfo } from "claude-code";
import type { ApiMessageInput } from "../translate/messages.ts";
import type { ToolDef } from "../translate/types.ts";
import type { JsonSchema } from "./json-schema.ts";
import { NO_MCP_SCHEMAS, type McpSchemaSource } from "./mcp-schemas.ts";
import { SUBAGENT_HANDBACK, SUPPLEMENT_TOOL_DESCRIPTIONS, TOOL_SCHEMAS } from "./supplement-schemas.ts";

// Only the tools a step offers are sent, each with its schema. A tool whose schema
// is unknown is skipped and named, so the caller can log it.

export type OfferedTools = {
  readonly tools: ToolDef[];
  readonly skipped: string[];
};

const TOOL_SEARCH = "ToolSearch";

// The tools a loop loaded through ToolSearch: each `tool_reference` block in the
// result of one of its ToolSearch calls. A loaded deferred tool is not in the
// captured names, so it stays offered only through these.
export function searchLoadedTools(messages: readonly ApiMessageInput[]): string[] {
  const searches = new Set<string>();
  const names: string[] = [];
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "tool_use" && block.name === TOOL_SEARCH && typeof block.id === "string") searches.add(block.id);
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string" || !searches.has(block.tool_use_id)) continue;
      if (!Array.isArray(block.content)) continue;
      for (const item of block.content as { type?: unknown; tool_name?: unknown }[]) {
        if (item.type === "tool_reference" && typeof item.tool_name === "string") names.push(item.tool_name);
      }
    }
  }
  return names;
}

// The sentence that opens the host's handback reminder, as 2.1.311 words it.
const HANDBACK_REMINDER = `Your final report is delivered through ${SUBAGENT_HANDBACK}`;

// Whether the host has given this loop SubagentHandback. The host never lists the
// tool to a mod, but where it runs one (a subagent in auto mode on 2.1.311) it tells
// the subagent so in a reminder of its own: a top-level user text block holding the
// reminder sentence. Other user text can name the tool, such as gitStatus commit
// subjects or a delegation prompt, so only the sentence counts. Outside auto mode the
// host has no such tool, and a call to it fails.
export function hostOffersHandback(messages: readonly ApiMessageInput[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      message.content.some((block) => block.type === "text" && typeof block.text === "string" && block.text.includes(HANDBACK_REMINDER)),
  );
}

// The names a routed step offers, deduplicated in order: the captured names, the
// tools the loop loaded through ToolSearch, then SubagentHandback in a subagent's
// loop whose host reminder names it. Any other loop, the main loop included, is
// never offered SubagentHandback.
export function offeredToolNames(
  captured: readonly string[],
  messages: readonly ApiMessageInput[],
  agentId: string | undefined,
): string[] {
  const names = new Set([...captured, ...searchLoadedTools(messages)]);
  if (agentId !== undefined && hostOffersHandback(messages)) names.add(SUBAGENT_HANDBACK);
  else names.delete(SUBAGENT_HANDBACK);
  return [...names];
}

export function offeredTools(
  names: readonly string[],
  listed: readonly ToolInfo[],
  registry: Readonly<Record<string, JsonSchema>> = TOOL_SCHEMAS,
  mcp: McpSchemaSource = NO_MCP_SCHEMAS,
): OfferedTools {
  const info = new Map(listed.map((tool) => [tool.name, tool]));
  const tools: ToolDef[] = [];
  const skipped: string[] = [];
  for (const name of names) {
    const tool = info.get(name);
    // `Object.hasOwn` keeps a name such as `constructor` from reading the prototype.
    const schema =
      tool?.mcp === true ? mcp.schema(name) : Object.hasOwn(registry, name) ? registry[name] : undefined;
    if (schema === undefined) {
      skipped.push(name);
      continue;
    }
    // A tool the host does not list takes its supplement description. Only a name with a schema gets here.
    tools.push({ name, description: tool?.description ?? SUPPLEMENT_TOOL_DESCRIPTIONS[name] ?? "", schema });
  }
  return { tools, skipped };
}
