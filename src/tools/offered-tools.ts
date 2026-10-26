import type { ToolInfo } from "claude-code";
import type { ToolDef } from "../translate/types.ts";
import { BUILTIN_TOOL_SCHEMAS } from "./builtin-schemas.ts";
import type { JsonSchema } from "./json-schema.ts";
import { NO_MCP_SCHEMAS, type McpSchemaSource } from "./mcp-schemas.ts";

// Only the tools a step offers are sent, each with its schema. A tool whose schema
// is unknown is skipped and named, so the caller can log it.

export type OfferedTools = {
  readonly tools: ToolDef[];
  readonly skipped: string[];
};

export function offeredTools(
  names: readonly string[],
  listed: readonly ToolInfo[],
  registry: Readonly<Record<string, JsonSchema>> = BUILTIN_TOOL_SCHEMAS,
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
    tools.push({ name, description: tool?.description ?? "", schema });
  }
  return { tools, skipped };
}
