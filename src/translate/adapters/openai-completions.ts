import { applyReasoning, type ReasoningMapper } from "../reasoning.ts";
import { createSseSplitter } from "../sse.ts";
import type { RoutedRequest, StopReason, StreamEvent, StreamParser, StreamUsage, WireAdapter } from "../types.ts";
import { asRecord, bearer, dataUrl, errorKindOf, imagesOf, numberOf, parseJson, requestSpec, resultText, stringOf } from "./shared.ts";

// OpenAI Chat Completions: request encoding and the streamed chunk parser.

const REASONING: ReasoningMapper = { transport: "effort", field: "reasoning_effort" };

const FINISH: Readonly<Record<string, StopReason>> = {
  stop: "end",
  length: "length",
  tool_calls: "tool",
  function_call: "tool",
  content_filter: "refusal",
};

function imageParts(images: readonly { readonly mediaType: string; readonly data: string }[]): unknown[] {
  return images.map((image) => ({ type: "image_url", image_url: { url: dataUrl(image) } }));
}

// A user turn's text and images become one message. Its tool results become tool
// messages first, and the images they carried follow in a user message.
function messagesOf(request: RoutedRequest): unknown[] {
  const out: unknown[] = [];
  if (request.system !== "") out.push({ role: "system", content: request.system });
  for (const turn of request.turns) {
    if (turn.role === "assistant") {
      const text = turn.blocks.flatMap((block) => (block.kind === "text" ? [block.text] : [])).join("");
      const calls = turn.blocks.flatMap((block) =>
        block.kind === "tool_use"
          ? [{ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }]
          : [],
      );
      const message: Record<string, unknown> = { role: "assistant", content: text === "" && calls.length > 0 ? null : text };
      if (calls.length > 0) message.tool_calls = calls;
      out.push(message);
      continue;
    }
    const results = turn.blocks.flatMap((block) => (block.kind === "tool_result" ? [block] : []));
    for (const result of results) out.push({ role: "tool", tool_call_id: result.id, content: resultText(result.content) });
    const texts = turn.blocks.flatMap((block) => (block.kind === "text" ? [block.text] : []));
    const images = [
      ...turn.blocks.flatMap((block) => (block.kind === "image" ? [block] : [])),
      ...results.flatMap((result) => imagesOf(result.content)),
    ];
    if (images.length === 0) {
      if (texts.length > 0) out.push({ role: "user", content: texts.join("\n") });
    } else {
      out.push({ role: "user", content: [...texts.map((text) => ({ type: "text", text })), ...imageParts(images)] });
    }
  }
  return out;
}

function usageOf(value: unknown): StreamUsage | undefined {
  const usage = asRecord(value);
  if (usage === undefined) return undefined;
  const prompt = numberOf(usage.prompt_tokens) ?? 0;
  const cached = numberOf(asRecord(usage.prompt_tokens_details)?.cached_tokens) ?? 0;
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: numberOf(usage.completion_tokens) ?? 0,
    cacheReadTokens: cached,
  };
}

export function createCompletionsParser(): StreamParser {
  const splitter = createSseSplitter();
  const openTools = new Map<number, string>();
  let modelSeen = false;
  let finish: StopReason | undefined;
  let usage: StreamUsage | undefined;
  let stopped = false;

  function stop(out: StreamEvent[]): void {
    if (stopped) return;
    stopped = true;
    if (finish !== undefined) out.push({ type: "stop", reason: finish, usage });
  }

  function handle(data: string, out: StreamEvent[]): void {
    if (stopped) return;
    if (data === "[DONE]") {
      stop(out);
      return;
    }
    const chunk = asRecord(parseJson(data));
    if (chunk === undefined) {
      out.push({ type: "error", kind: "malformed" });
      return;
    }
    const error = asRecord(chunk.error);
    if (error !== undefined) {
      out.push({ type: "error", kind: errorKindOf(stringOf(error.code) ?? stringOf(error.type)) });
      return;
    }
    const model = stringOf(chunk.model);
    if (model !== undefined && !modelSeen) {
      modelSeen = true;
      out.push({ type: "model", id: model });
    }
    usage = usageOf(chunk.usage) ?? usage;
    const choice = asRecord(Array.isArray(chunk.choices) ? chunk.choices[0] : undefined);
    if (choice === undefined) return;
    const delta = asRecord(choice.delta) ?? {};
    const content = stringOf(delta.content);
    if (content !== undefined && content !== "") out.push({ type: "text", block: "text", text: content });
    const reasoning = stringOf(delta.reasoning_content) ?? stringOf(delta.reasoning) ?? stringOf(delta.reasoning_text);
    if (reasoning !== undefined && reasoning !== "") out.push({ type: "thinking", block: "thinking", text: reasoning });
    const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const entry of calls) {
      const call = asRecord(entry);
      if (call === undefined) continue;
      const index = numberOf(call.index) ?? 0;
      const block = `tool:${index}`;
      const fn = asRecord(call.function) ?? {};
      if (!openTools.has(index)) {
        openTools.set(index, block);
        out.push({ type: "toolStart", block, id: stringOf(call.id) ?? "", name: stringOf(fn.name) ?? "" });
      }
      const args = stringOf(fn.arguments);
      if (args !== undefined && args !== "") out.push({ type: "toolInput", block, json: args });
    }
    const reason = stringOf(choice.finish_reason);
    if (reason !== undefined) {
      for (const block of openTools.values()) out.push({ type: "toolEnd", block });
      openTools.clear();
      finish = FINISH[reason] ?? "end";
    }
  }

  return {
    push(text) {
      const out: StreamEvent[] = [];
      for (const record of splitter.push(text)) handle(record.data, out);
      return out;
    },
    end() {
      const out: StreamEvent[] = [];
      if (!stopped) {
        if (finish !== undefined) stop(out);
        else out.push({ type: "error", kind: "malformed" });
      }
      return out;
    },
  };
}

export const completionsAdapter: WireAdapter = {
  wire: "openai-completions",
  encode(request, context) {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: messagesOf(request),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.schema },
      }));
    }
    if (request.maxOutput !== undefined) body.max_tokens = request.maxOutput;
    if (request.reasoning !== undefined) applyReasoning(body, request.reasoning.mapper ?? REASONING, request.reasoning.effort);
    return requestSpec(`${context.baseUrl}/chat/completions`, body, context, bearer(context.token));
  },
  parser: createCompletionsParser,
};
