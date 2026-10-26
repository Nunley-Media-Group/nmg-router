import { BUILTIN_TOOL_SCHEMAS } from "./builtin-schemas.ts";
import type { JsonSchema } from "./json-schema.ts";

// Hand-kept schemas and descriptions for host tools the generated declarations
// omit. Each one is copied from the named Claude Code version's own tool
// definition, as a live session sends it. Check them again when the host version changes.

export const SUPPLEMENT_TOOL_SOURCE_VERSION = "2.1.310";

// The tool a subagent delivers its final report through. The host never lists it
// to a mod, in `$.tool.list()` or a subagent's render, so its description is kept here too.
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

export const SUPPLEMENT_TOOL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [SUBAGENT_HANDBACK]:
    "Deliver your final report to the agent that spawned you (your caller). Use it once, for that hand-off only: " +
    `when your work is complete, call ${SUBAGENT_HANDBACK}({message: <your full report>}). The call ends your run, ` +
    "so do everything else first and put everything your caller needs in that one report. It is not a messaging " +
    "channel: do not use it for progress updates or questions.\n\n" +
    `Only a report delivered through ${SUBAGENT_HANDBACK} reaches your caller; plain text you write at the end of ` +
    "your run is NOT delivered. There is no recipient parameter: the report can only go to your caller.",
};

// The registry a routed request reads: the generated schemas, then the supplement
// for names they lack. A generated entry wins on a clash.
export const TOOL_SCHEMAS: Readonly<Record<string, JsonSchema>> = { ...SUPPLEMENT_TOOL_SCHEMAS, ...BUILTIN_TOOL_SCHEMAS };
