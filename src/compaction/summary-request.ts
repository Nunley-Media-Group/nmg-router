import type { SessionMessage } from "claude-code";
import { parseModelId } from "../models/model-id.ts";
import type { ApiMessageInput } from "../translate/messages.ts";
import type { RoutedRequest, Turn } from "../translate/types.ts";
import { SUMMARY_STRUCTURE, SUMMARY_SYSTEM_PROMPT } from "./summary-prompt.ts";

// Builds the summarizer's request from a transcript. It is pure: the transcript
// goes in as text, and the request carries no tools and no reasoning.

// A tool result longer than this is cut, so one large output cannot fill the summary's input.
export const TOOL_RESULT_LIMIT = 2000;

// The summary's output budget: 0.8 of the 16384 reserve, and never more than the model allows.
const SUMMARY_OUTPUT_LIMIT = 13107;
const DEFAULT_OUTPUT = 16384;

// A transcript message in either shape: a session row (`session.compact`'s
// messages) or the Messages API form (`$.session.messages({ as: "api" })`).
export type TranscriptMessage = SessionMessage | ApiMessageInput;

function cut(text: string): string {
  if (text.length <= TOOL_RESULT_LIMIT) return text;
  return `${text.slice(0, TOOL_RESULT_LIMIT)}\n[... ${text.length - TOOL_RESULT_LIMIT} more characters truncated]`;
}

// One message's parts, in the order they are written: its text, its tool calls, its tool results.
type Parts = { text: string; calls: { tool: string; input: unknown }[]; results: string[] };

// A tool result's text: a string, or its text blocks joined. Images are left out.
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((item: { type?: unknown; text?: unknown }) => (item.type === "text" && typeof item.text === "string" ? [item.text] : []))
    .join("\n");
}

function partsOf(message: TranscriptMessage): Parts {
  if (!("content" in message)) {
    return {
      text: message.text,
      calls: message.toolUses.map((use) => ({ tool: use.tool, input: use.input })),
      results: (message.toolResults ?? []).map((result) => result.text),
    };
  }
  const parts: Parts = { text: "", calls: [], results: [] };
  const texts: string[] = [];
  for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block.type === "tool_use" && typeof block.name === "string") parts.calls.push({ tool: block.name, input: block.input });
    else if (block.type === "tool_result") parts.results.push(resultText(block.content));
  }
  parts.text = texts.join("\n");
  return parts;
}

// Each message as role-tagged lines, in order. Images and thinking are left out.
export function serializeMessages(messages: readonly TranscriptMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const { text, calls, results } = partsOf(message);
    if (text !== "") lines.push(`${message.role === "user" ? "[User]" : "[Assistant]"}: ${text}`);
    for (const call of calls) lines.push(`[Tool Call]: ${call.tool}(${JSON.stringify(call.input)})`);
    for (const result of results) lines.push(`[Tool Result]: ${cut(result)}`);
  }
  return lines.join("\n");
}

// `prior` is an earlier summary the new one updates; it is written first.
export function buildSummaryRequest(
  messages: readonly TranscriptMessage[],
  instructions: string | undefined,
  model: { readonly id: string; readonly maxOutput?: number | undefined },
  prior?: string,
): RoutedRequest {
  const focus = instructions === undefined || instructions.trim() === "" ? "" : `\n\nAdditional focus: ${instructions.trim()}`;
  const earlier = prior === undefined ? [] : [`[Earlier summary]: ${prior}`];
  const transcript = [...earlier, serializeMessages(messages)].filter((part) => part !== "").join("\n");
  const text = `<conversation>\n${transcript}\n</conversation>\n\n${SUMMARY_STRUCTURE}${focus}`;
  const turn: Turn = { role: "user", blocks: [{ kind: "text", text }] };
  return {
    model: parseModelId(model.id)?.model ?? model.id,
    system: SUMMARY_SYSTEM_PROMPT,
    turns: [turn],
    tools: [],
    maxOutput: Math.min(model.maxOutput ?? DEFAULT_OUTPUT, SUMMARY_OUTPUT_LIMIT),
  };
}
