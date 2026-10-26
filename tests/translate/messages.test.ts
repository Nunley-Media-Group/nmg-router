import { describe, expect, it } from "vitest";
import { normalizeMessages, type ApiMessageInput } from "../../src/translate/messages.ts";

const vision = { id: "opencode-go/kimi-k3", vision: true };
const textOnly = { id: "opencode-go/minimax-m2.7", vision: false };

describe("message normalization", () => {
  const conversation: ApiMessageInput[] = [
    { role: "user", content: [{ type: "text", text: "Read notes" }] },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "private reasoning", signature: "sig" },
        { type: "redacted_thinking", data: "opaque" },
        { type: "text", text: "On it." },
        { type: "tool_use", id: "call_1", name: "Read", input: { file_path: "notes.txt" } },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call_1", is_error: true, content: [{ type: "text", text: "missing" }] },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      ],
    },
  ];

  it("keeps text, tool calls, tool results and images, and drops thinking", () => {
    const turns = normalizeMessages(conversation, vision);
    expect(turns).toEqual([
      { role: "user", blocks: [{ kind: "text", text: "Read notes" }] },
      {
        role: "assistant",
        blocks: [
          { kind: "text", text: "On it." },
          { kind: "tool_use", id: "call_1", name: "Read", input: { file_path: "notes.txt" } },
        ],
      },
      {
        role: "user",
        blocks: [
          { kind: "tool_result", id: "call_1", isError: true, content: [{ kind: "text", text: "missing" }] },
          { kind: "image", mediaType: "image/png", data: "AAAA" },
        ],
      },
    ]);
  });

  it("replaces an image with a note that names the model when it has no vision", () => {
    const turns = normalizeMessages(conversation, textOnly);
    expect(turns[2]?.blocks[1]).toEqual({ kind: "text", text: "(image omitted: opencode-go/minimax-m2.7 has no image input)" });
  });

  it("drops a block type it does not model and a message left with nothing", () => {
    const turns = normalizeMessages(
      [
        { role: "assistant", content: [{ type: "thinking", thinking: "only thinking" }] },
        { role: "user", content: [{ type: "document", source: {} }] },
        { role: "user", content: [{ type: "text", text: "kept" }] },
      ],
      vision,
    );
    expect(turns).toEqual([{ role: "user", blocks: [{ kind: "text", text: "kept" }] }]);
  });
});
