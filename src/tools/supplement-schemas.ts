import { BUILTIN_TOOL_SCHEMAS } from "./builtin-schemas.ts";
import type { JsonSchema } from "./json-schema.ts";

// Hand-kept schemas for host tools the generated declarations omit. Each one is
// copied from the named Claude Code version's own tool definition, as a live
// session sends it. Check them again when the host version changes.

export const SUPPLEMENT_TOOL_SOURCE_VERSION = "2.1.310";

// The tool a subagent delivers its final report through.
export const SUBAGENT_HANDBACK = "SubagentHandback";

export const SUPPLEMENT_TOOL_SCHEMAS: Readonly<Record<string, JsonSchema>> = {
  [SUBAGENT_HANDBACK]: {
    type: "object",
    properties: {
      message: { type: "string", description: "Your full report for your caller" },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

// The registry a routed request reads: the generated schemas, then the supplement
// for names they lack. A generated entry wins on a clash.
export const TOOL_SCHEMAS: Readonly<Record<string, JsonSchema>> = { ...SUPPLEMENT_TOOL_SCHEMAS, ...BUILTIN_TOOL_SCHEMAS };
