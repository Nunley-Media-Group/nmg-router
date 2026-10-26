import { applyReasoning, budgetOf, type ReasoningMapper } from "../reasoning.ts";
import { createSseSplitter } from "../sse.ts";
import type { HttpRequestSpec, RoutedRequest, StopReason, StreamEvent, StreamParser, StreamUsage, Turn, WireAdapter } from "../types.ts";
import { asRecord, numberOf, parseJson, requestSpec, stringOf } from "./shared.ts";

// Anthropic Messages wire: request encoding and the event-typed stream parser.
// The key goes in `x-api-key`, the header this wire uses.

const REASONING: ReasoningMapper = { transport: "budget" };
const DEFAULT_MAX_OUTPUT = 16384;
const BUDGET_HEADROOM = 4000;

const STOP: Readonly<Record<string, StopReason>> = {
  end_turn: "end",
  stop_sequence: "end",
  max_tokens: "length",
  tool_use: "tool",
  refusal: "refusal",
};

type AnthropicMessage = { role: "user" | "assistant"; content: unknown[] };

function blockOf(block: Turn["blocks"][number]): unknown {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: block.mediaType, data: block.data } };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input ?? {} };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: block.isError,
        content: block.content.map((item) =>
          item.kind === "text" ? { type: "text", text: item.text } : { type: "image", source: { type: "base64", media_type: item.mediaType, data: item.data } },
        ),
      };
  }
}

// Consecutive user turns merge into one message, and two assistant turns in a row
// get a `Continue.` user turn between them.
export function anthropicMessages(turns: readonly Turn[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const turn of turns) {
    const content = turn.blocks.map(blockOf);
    const previous = out.at(-1);
    if (turn.role === "user" && previous?.role === "user") {
      previous.content.push(...content);
      continue;
    }
    if (turn.role === "assistant" && previous?.role === "assistant") {
      out.push({ role: "user", content: [{ type: "text", text: "Continue." }] });
    }
    out.push({ role: turn.role, content });
  }
  return out;
}

function usageOf(value: unknown, into: StreamUsage): StreamUsage {
  const usage = asRecord(value);
  if (usage === undefined) return into;
  return {
    inputTokens: numberOf(usage.input_tokens) ?? into.inputTokens,
    outputTokens: numberOf(usage.output_tokens) ?? into.outputTokens,
    cacheReadTokens: numberOf(usage.cache_read_input_tokens) ?? into.cacheReadTokens,
    cacheWriteTokens: numberOf(usage.cache_creation_input_tokens) ?? into.cacheWriteTokens,
  };
}

export function createAnthropicParser(): StreamParser {
  const splitter = createSseSplitter();
  const openTools = new Set<number>();
  let modelSeen = false;
  let finish: StopReason | undefined;
  let usage: StreamUsage = {};
  let stopped = false;

  function handle(data: string, out: StreamEvent[]): void {
    if (stopped) return;
    const event = asRecord(parseJson(data));
    if (event === undefined) {
      out.push({ type: "error", kind: "malformed" });
      return;
    }
    const index = numberOf(event.index) ?? 0;
    switch (stringOf(event.type)) {
      case "message_start": {
        const message = asRecord(event.message);
        const model = stringOf(message?.model);
        if (model !== undefined && !modelSeen) {
          modelSeen = true;
          out.push({ type: "model", id: model });
        }
        usage = usageOf(message?.usage, usage);
        return;
      }
      case "content_block_start": {
        const block = asRecord(event.content_block);
        if (block?.type === "tool_use") {
          openTools.add(index);
          out.push({ type: "toolStart", block: index, id: stringOf(block.id) ?? "", name: stringOf(block.name) ?? "" });
        }
        return;
      }
      case "content_block_delta": {
        const delta = asRecord(event.delta);
        if (delta?.type === "text_delta" && typeof delta.text === "string") out.push({ type: "text", block: index, text: delta.text });
        if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") out.push({ type: "thinking", block: index, text: delta.thinking });
        if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") out.push({ type: "toolInput", block: index, json: delta.partial_json });
        return;
      }
      case "content_block_stop":
        if (openTools.delete(index)) out.push({ type: "toolEnd", block: index });
        return;
      case "message_delta": {
        const reason = stringOf(asRecord(event.delta)?.stop_reason);
        if (reason !== undefined) finish = STOP[reason] ?? "end";
        usage = usageOf(event.usage, usage);
        return;
      }
      case "message_stop":
        stopped = true;
        if (finish === undefined) out.push({ type: "error", kind: "malformed" });
        else out.push({ type: "stop", reason: finish, usage });
        return;
      case "error": {
        const error = asRecord(event.error);
        out.push({ type: "error", kind: stringOf(error?.type) === "rate_limit_error" ? "rate_limited" : "provider_error" });
        return;
      }
      default:
        return;
    }
  }

  return {
    push(text) {
      const out: StreamEvent[] = [];
      for (const record of splitter.push(text)) handle(record.data, out);
      return out;
    },
    end() {
      return stopped ? [] : [{ type: "error", kind: "malformed" }];
    },
  };
}

export const anthropicAdapter: WireAdapter = {
  wire: "anthropic-messages",
  encode(request: RoutedRequest, context): HttpRequestSpec {
    const effort = request.reasoning?.effort;
    const mapper = request.reasoning?.mapper ?? REASONING;
    const budget = effort === undefined || mapper.transport !== "budget" ? undefined : budgetOf(effort);
    const base = request.maxOutput ?? DEFAULT_MAX_OUTPUT;
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: budget === undefined ? base : Math.max(base, budget + BUDGET_HEADROOM),
      messages: anthropicMessages(request.turns),
      stream: true,
    };
    if (request.system !== "") body.system = [{ type: "text", text: request.system }];
    if (request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.schema }));
    }
    if (effort !== undefined) applyReasoning(body, mapper, effort);
    const auth: Record<string, string> = context.token === undefined ? {} : { "x-api-key": context.token };
    return requestSpec(`${context.baseUrl}/v1/messages`, body, context, { ...auth, "anthropic-version": "2023-06-01" });
  },
  parser: createAnthropicParser,
};
