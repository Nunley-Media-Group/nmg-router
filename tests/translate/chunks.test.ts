import { describe, expect, it } from "vitest";
import { createChunkMapper } from "../../src/translate/chunks.ts";
import type { StreamEvent } from "../../src/translate/types.ts";

function toolChunk(id: string, target = { turnId: "turn-1", step: 2, model: "opencode-go/m" }) {
  const mapper = createChunkMapper(target);
  const events: StreamEvent[] = [
    { type: "toolStart", block: "b", id, name: "Read" },
    { type: "toolInput", block: "b", json: "{}" },
    { type: "toolEnd", block: "b" },
  ];
  return events.flatMap((event) => mapper.map(event)).find((chunk) => chunk.kind === "tool");
}

// The engine takes a tool call id of letters, digits, _ or - only.
describe("tool call ids", () => {
  it("keeps a provider id the engine accepts", () => {
    expect(toolChunk("call_resp_1-a_0")).toEqual({ kind: "tool", index: 0, id: "call_resp_1-a_0", name: "Read" });
  });

  it.each(["functions.Read:0", "call 1", "id/with/slashes", ""])("replaces %j with an id from the turn, step and block", (id) => {
    expect(toolChunk(id)).toEqual({ kind: "tool", index: 0, id: "call_turn-1_2_0", name: "Read" });
  });

  it("makes the replacement engine-safe whatever the turn id holds", () => {
    expect(toolChunk("functions.Read:0", { turnId: "turn.9:x", step: 0, model: "opencode-go/m" })?.id).toBe("call_turn_9_x_0_0");
  });
});
