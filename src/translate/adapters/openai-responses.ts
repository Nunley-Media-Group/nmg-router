import { applyReasoning, type ReasoningMapper } from "../reasoning.ts";
import { createSseSplitter } from "../sse.ts";
import type { RoutedRequest, StreamEvent, StreamParser, StreamUsage, Turn, WireAdapter } from "../types.ts";
import { asRecord, bearer, dataUrl, errorKindOf, numberOf, parseJson, requestSpec, resultText, stringOf, imagesOf } from "./shared.ts";

// OpenAI Responses: request encoding and the typed server-sent event parser. The
// Codex dialect reuses both, so nothing here is specific to one account type.

const REASONING: ReasoningMapper = { transport: "effort", field: "reasoning.effort" };

function imageItem(image: { readonly mediaType: string; readonly data: string }): unknown {
  return { role: "user", content: [{ type: "input_image", image_url: dataUrl(image) }] };
}

function itemsOf(turn: Turn): unknown[] {
  return turn.blocks.flatMap((block): unknown[] => {
    switch (block.kind) {
      case "text":
        return turn.role === "assistant"
          ? [{ role: "assistant", content: block.text }]
          : [{ role: "user", content: [{ type: "input_text", text: block.text }] }];
      case "image":
        return [imageItem(block)];
      case "tool_use":
        return [{ type: "function_call", call_id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) }];
      case "tool_result":
        return [
          { type: "function_call_output", call_id: block.id, output: resultText(block.content) },
          ...imagesOf(block.content).map(imageItem),
        ];
    }
  });
}

export function responsesBody(request: RoutedRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    input: request.turns.flatMap(itemsOf),
    stream: true,
    store: false,
  };
  if (request.system !== "") body.instructions = request.system;
  if (request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
  }
  if (request.maxOutput !== undefined) body.max_output_tokens = request.maxOutput;
  if (request.reasoning !== undefined) {
    applyReasoning(body, request.reasoning.mapper ?? REASONING, request.reasoning.effort);
    body.reasoning = { ...asRecord(body.reasoning), summary: "auto" };
  }
  return body;
}

function usageOf(value: unknown): StreamUsage | undefined {
  const usage = asRecord(value);
  if (usage === undefined) return undefined;
  const input = numberOf(usage.input_tokens) ?? 0;
  const cached = numberOf(asRecord(usage.input_tokens_details)?.cached_tokens) ?? 0;
  return { inputTokens: Math.max(0, input - cached), outputTokens: numberOf(usage.output_tokens) ?? 0, cacheReadTokens: cached };
}

export function createResponsesParser(): StreamParser {
  const splitter = createSseSplitter();
  const calls = new Map<string, boolean>();
  let modelSeen = false;
  let sawTool = false;
  let stopped = false;

  function handle(data: string, out: StreamEvent[]): void {
    if (stopped) return;
    const event = asRecord(parseJson(data));
    if (event === undefined) {
      out.push({ type: "error", kind: "malformed" });
      return;
    }
    const response = asRecord(event.response);
    const model = stringOf(response?.model);
    if (model !== undefined && !modelSeen) {
      modelSeen = true;
      out.push({ type: "model", id: model });
    }
    switch (stringOf(event.type)) {
      case "response.output_item.added": {
        const item = asRecord(event.item);
        if (item?.type !== "function_call") return;
        const block = stringOf(item.id) ?? "";
        calls.set(block, false);
        sawTool = true;
        out.push({ type: "toolStart", block, id: stringOf(item.call_id) ?? block, name: stringOf(item.name) ?? "" });
        return;
      }
      case "response.output_text.delta": {
        const text = stringOf(event.delta);
        if (text !== undefined && text !== "") out.push({ type: "text", block: stringOf(event.item_id) ?? "text", text });
        return;
      }
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_text.delta": {
        const text = stringOf(event.delta);
        if (text !== undefined && text !== "") out.push({ type: "thinking", block: stringOf(event.item_id) ?? "thinking", text });
        return;
      }
      case "response.function_call_arguments.delta": {
        const block = stringOf(event.item_id) ?? "";
        const json = stringOf(event.delta);
        if (json === undefined || json === "") return;
        calls.set(block, true);
        out.push({ type: "toolInput", block, json });
        return;
      }
      case "response.output_item.done": {
        const item = asRecord(event.item);
        if (item?.type !== "function_call") return;
        const block = stringOf(item.id) ?? "";
        const received = calls.get(block) ?? false;
        const args = stringOf(item.arguments);
        if (!received && args !== undefined && args !== "") out.push({ type: "toolInput", block, json: args });
        out.push({ type: "toolEnd", block });
        calls.delete(block);
        return;
      }
      case "response.completed":
        out.push({ type: "stop", reason: sawTool ? "tool" : "end", usage: usageOf(response?.usage) });
        stopped = true;
        return;
      case "response.incomplete": {
        const reason = stringOf(asRecord(response?.incomplete_details)?.reason);
        if (reason === "content_filter") {
          out.push({ type: "error", kind: "provider_error" });
          return;
        }
        out.push({ type: "stop", reason: "length", usage: usageOf(response?.usage) });
        stopped = true;
        return;
      }
      case "error":
      case "response.failed": {
        const error = asRecord(event.error) ?? asRecord(response?.error);
        out.push({ type: "error", kind: errorKindOf(stringOf(error?.code) ?? stringOf(error?.type)) });
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

export const responsesAdapter: WireAdapter = {
  wire: "openai-responses",
  encode(request, context) {
    return requestSpec(`${context.baseUrl}/responses`, responsesBody(request), context, bearer(context.token));
  },
  parser: createResponsesParser,
};
