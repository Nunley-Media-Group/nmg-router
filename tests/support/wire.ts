import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TurnStepChunk } from "claude-code";
import { createChunkMapper } from "../../src/translate/chunks.ts";
import type { StreamEvent, StreamParser } from "../../src/translate/types.ts";

// The four recorded wire fixtures carry one reply: a thinking block, text in two
// pieces, and one Read tool call with split arguments. Every wire must map to the
// same chunks, whatever the piece boundaries.

export const FIXTURE_MODEL = "opencode-go/fixture-model-1";
export const TURN_ID = "turn-1";

export function fixtureText(name: string): string {
  return readFileSync(join(import.meta.dirname, "..", "fixtures", "sse", `${name}.sse`), "utf8");
}

// Cuts the text into pieces of seeded random sizes, so a failing split can be replayed.
export function randomPieces(text: string, seed: number): string[] {
  let state = seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state;
  };
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    const size = 1 + (next() % 17);
    pieces.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return pieces;
}

export function replay(parser: StreamParser, pieces: readonly string[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const piece of pieces) events.push(...parser.push(piece));
  events.push(...parser.end());
  return events;
}

export function chunksOf(events: readonly StreamEvent[]): TurnStepChunk[] {
  const mapper = createChunkMapper({ turnId: TURN_ID, step: 0, model: FIXTURE_MODEL });
  return events.flatMap((event) => mapper.map(event));
}

export const EXPECTED_CHUNKS: TurnStepChunk[] = [
  { kind: "thinking", index: 0, text: "Let me look." },
  { kind: "text", index: 1, text: "Reading " },
  { kind: "text", index: 1, text: "the file." },
  { kind: "tool", index: 2, id: "call_1", name: "Read" },
  { kind: "input", index: 2, json: '{"file_path":"notes.txt"}' },
  {
    kind: "stop",
    stopReason: "tool_use",
    usage: {
      input_tokens: 100,
      output_tokens: 15,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 0,
      model: FIXTURE_MODEL,
    },
  },
];
