import type { TurnStepChunk } from "claude-code";
import type { BlockKey, StopReason, StreamEvent, StreamUsage } from "./types.ts";

// Turns the parser's events into the engine's response chunks. Each block gets
// the next index in order of appearance. A tool call is held until its input is
// complete, then sent as one tool chunk and one whole input chunk.
//
// The engine takes a tool call id of letters, digits, `_` or `-` only, and keeps
// it in the transcript, so later requests send it back to the provider. A provider
// id outside that set (`functions.Read:0`) or an empty one is replaced by an id
// made from the turn, step and block, which is unique in the session.

type StopChunk = Extract<TurnStepChunk, { kind: "stop" }>;
type TurnStopReason = StopChunk["stopReason"];
type TurnUsage = NonNullable<StopChunk["usage"]>;

export type ChunkMapper = {
  // Chunks for one event. `model` and `error` events produce none.
  map(event: StreamEvent): TurnStepChunk[];
};

export type ChunkTarget = {
  readonly turnId: string;
  // The step's position in the turn.
  readonly step: number;
  // The routed model id, which usage reports as the model that answered.
  readonly model: string;
};

type OpenTool = { index: number; id: string; name: string; json: string };

const ENGINE_ID = /^[A-Za-z0-9_-]+$/;

function toolIdOf(id: string, target: ChunkTarget, index: number): string {
  if (ENGINE_ID.test(id)) return id;
  return `call_${target.turnId.replace(/[^A-Za-z0-9_-]/g, "_")}_${target.step}_${index}`;
}

function stopReasonOf(reason: StopReason, sawTool: boolean): TurnStopReason {
  switch (reason) {
    case "end":
      return sawTool ? "tool_use" : "end_turn";
    case "length":
      return "max_tokens";
    case "tool":
      return "tool_use";
    case "refusal":
      return "refusal";
  }
}

function usageOf(usage: StreamUsage | undefined, model: string): TurnUsage | null {
  if (usage === undefined) return null;
  return {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    cache_read_input_tokens: usage.cacheReadTokens ?? 0,
    cache_creation_input_tokens: usage.cacheWriteTokens ?? 0,
    model,
  };
}

// The arguments as the engine expects them: a JSON object, or `{}` when the
// model wrote something that does not parse to one.
function inputJson(raw: string): string {
  if (raw.trim() === "") return "{}";
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? JSON.stringify(parsed) : "{}";
  } catch {
    return "{}";
  }
}

export function createChunkMapper(target: ChunkTarget): ChunkMapper {
  const indexes = new Map<BlockKey, number>();
  const tools = new Map<BlockKey, OpenTool>();
  let sawTool = false;

  function indexOf(block: BlockKey): number {
    const known = indexes.get(block);
    if (known !== undefined) return known;
    const index = indexes.size;
    indexes.set(block, index);
    return index;
  }

  return {
    map(event) {
      switch (event.type) {
        case "text":
          return [{ kind: "text", index: indexOf(event.block), text: event.text }];
        case "thinking":
          return [{ kind: "thinking", index: indexOf(event.block), text: event.text }];
        case "toolStart":
          tools.set(event.block, { index: indexOf(event.block), id: event.id, name: event.name, json: "" });
          sawTool = true;
          return [];
        case "toolInput": {
          const tool = tools.get(event.block);
          if (tool !== undefined) tool.json += event.json;
          return [];
        }
        case "toolEnd": {
          const tool = tools.get(event.block);
          if (tool === undefined) return [];
          tools.delete(event.block);
          return [
            { kind: "tool", index: tool.index, id: toolIdOf(tool.id, target, tool.index), name: tool.name },
            { kind: "input", index: tool.index, json: inputJson(tool.json) },
          ];
        }
        case "stop":
          return [{ kind: "stop", stopReason: stopReasonOf(event.reason, sawTool), usage: usageOf(event.usage, target.model) }];
        case "model":
        case "error":
          return [];
      }
    },
  };
}
