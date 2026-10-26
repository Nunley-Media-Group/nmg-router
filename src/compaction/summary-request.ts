import type { SessionMessage } from "claude-code";
import { parseModelId } from "../models/model-id.ts";
import type { RoutedRequest, Turn } from "../translate/types.ts";
import { SUMMARY_STRUCTURE, SUMMARY_SYSTEM_PROMPT } from "./summary-prompt.ts";

// Builds the summarizer's request from a transcript. It is pure: the transcript
// goes in as text, and the request carries no tools and no reasoning.

// A tool result longer than this is cut, so one large output cannot fill the summary's input.
export const TOOL_RESULT_LIMIT = 2000;

// The summary's output budget: 0.8 of the 16384 reserve, and never more than the model allows.
const SUMMARY_OUTPUT_LIMIT = 13107;
const DEFAULT_OUTPUT = 16384;

function cut(text: string): string {
  if (text.length <= TOOL_RESULT_LIMIT) return text;
  return `${text.slice(0, TOOL_RESULT_LIMIT)}\n[... ${text.length - TOOL_RESULT_LIMIT} more characters truncated]`;
}

// Each message as role-tagged lines, in order. Images and thinking are not in a
// SessionMessage, so they are left out here by construction.
export function serializeMessages(messages: readonly SessionMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.text !== "") lines.push(`${message.role === "user" ? "[User]" : "[Assistant]"}: ${message.text}`);
    for (const use of message.toolUses) lines.push(`[Tool Call]: ${use.tool}(${JSON.stringify(use.input)})`);
    for (const result of message.toolResults ?? []) lines.push(`[Tool Result]: ${cut(result.text)}`);
  }
  return lines.join("\n");
}

export function buildSummaryRequest(
  messages: readonly SessionMessage[],
  instructions: string | undefined,
  model: { readonly id: string; readonly maxOutput?: number | undefined },
): RoutedRequest {
  const focus = instructions === undefined || instructions.trim() === "" ? "" : `\n\nAdditional focus: ${instructions.trim()}`;
  const text = `<conversation>\n${serializeMessages(messages)}\n</conversation>\n\n${SUMMARY_STRUCTURE}${focus}`;
  const turn: Turn = { role: "user", blocks: [{ kind: "text", text }] };
  return {
    model: parseModelId(model.id)?.model ?? model.id,
    system: SUMMARY_SYSTEM_PROMPT,
    turns: [turn],
    tools: [],
    maxOutput: Math.min(model.maxOutput ?? DEFAULT_OUTPUT, SUMMARY_OUTPUT_LIMIT),
  };
}
