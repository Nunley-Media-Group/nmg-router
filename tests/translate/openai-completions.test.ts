import { describe, expect, it } from "vitest";
import { completionsAdapter, createCompletionsParser } from "../../src/translate/adapters/openai-completions.ts";
import type { RoutedRequest } from "../../src/translate/types.ts";
import { EXPECTED_CHUNKS, chunksOf, fixtureText, randomPieces, replay } from "../support/wire.ts";

const request: RoutedRequest = {
  model: "fixture-model-1",
  system: "Be brief.",
  turns: [
    { role: "user", blocks: [{ kind: "text", text: "Read notes" }] },
    { role: "assistant", blocks: [{ kind: "tool_use", id: "call_0", name: "Read", input: { file_path: "notes.txt" } }] },
    { role: "user", blocks: [{ kind: "tool_result", id: "call_0", isError: false, content: [{ kind: "text", text: "hello" }] }] },
  ],
  tools: [{ name: "Read", description: "Read a file", schema: { type: "object" } }],
  reasoning: { effort: "medium" },
  maxOutput: 2048,
};

describe("openai-completions wire", () => {
  it("maps every random split of its stream to the shared chunks", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const events = replay(createCompletionsParser(), randomPieces(fixtureText("openai-completions"), seed));
      expect(events[0]).toEqual({ type: "model", id: "fixture-model-1" });
      expect(chunksOf(events)).toEqual(EXPECTED_CHUNKS);
    }
  });

  it("encodes the chat endpoint, the system, tool and tool-result messages, and the effort field", () => {
    const spec = completionsAdapter.encode(request, {
      baseUrl: "https://example.test/v1",
      headers: { "user-agent": "nmg-router/0.5.0" },
      token: "token-value",
      sessionId: "session-1",
    });
    const body = JSON.parse(spec.body) as Record<string, unknown>;
    expect(spec.url).toBe("https://example.test/v1/chat/completions");
    expect(spec.headers.authorization).toBe("Bearer token-value");
    expect(spec.headers["user-agent"]).toBe("nmg-router/0.5.0");
    expect(body).toMatchObject({ model: "fixture-model-1", stream: true, reasoning_effort: "medium", max_tokens: 2048 });
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Read notes" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_0", type: "function", function: { name: "Read", arguments: '{"file_path":"notes.txt"}' } }],
      },
      { role: "tool", tool_call_id: "call_0", content: "hello" },
    ]);
  });

  it("keeps the credential out of the body", () => {
    const spec = completionsAdapter.encode(request, { baseUrl: "https://example.test/v1", headers: {}, token: "token-value", sessionId: "s" });
    expect(spec.body).not.toContain("token-value");
  });
});
