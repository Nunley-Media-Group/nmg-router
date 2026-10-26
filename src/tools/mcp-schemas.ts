import type { JsonSchema } from "./json-schema.ts";

// Where an MCP tool's input schema comes from. No mods API exposes one today, so
// the runtime source answers undefined and every MCP tool is left out and named
// in the debug log.

export type McpSchemaSource = {
  schema(name: string): JsonSchema | undefined;
};

export const NO_MCP_SCHEMAS: McpSchemaSource = {
  schema: () => undefined,
};
