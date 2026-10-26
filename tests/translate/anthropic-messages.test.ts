import { describe, expect, it } from "vitest";
import { anthropicAdapter, createAnthropicParser } from "../../src/translate/adapters/anthropic-messages.ts";
import type { RoutedRequest, Turn } from "../../src/translate/types.ts";
import { EXPECTED_CHUNKS, chunksOf, fixtureText, randomPieces, replay } from "../support/wire.ts";

describe("anthropic-messages wire", () => {
  it("maps every random split of its event stream to the shared chunks", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const events = replay(createAnthropicParser(), randomPieces(fixtureText("anthropic-messages"), seed));
      expect(events[0]).toEqual({ type: "model", id: "fixture-model-1" });
      expect(chunksOf(events)).toEqual(EXPECTED_CHUNKS);
    }
  });

  it("sends the key in x-api-key with the version header, and a budget that fits under max_tokens", () => {
    const request: RoutedRequest = {
      model: "minimax-m2.5",
      system: "Be brief.",
      turns: [{ role: "user", blocks: [{ kind: "text", text: "hi" }] }],
      tools: [{ name: "Read", description: "Read a file", schema: { type: "object" } }],
      reasoning: { effort: "high" },
      maxOutput: 8000,
    };
    const spec = anthropicAdapter.encode(request, { baseUrl: "https://example.test", headers: {}, token: "anthropic-key", sessionId: "s" });
    const body = JSON.parse(spec.body) as Record<string, unknown>;
    expect(spec.url).toBe("https://example.test/v1/messages");
    expect(spec.headers).toMatchObject({ "x-api-key": "anthropic-key", "anthropic-version": "2023-06-01" });
    expect(spec.headers).not.toHaveProperty("authorization");
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 16384 });
    expect(body.max_tokens).toBe(16384 + 4000);
    expect(body.system).toEqual([{ type: "text", text: "Be brief." }]);
  });

  it("merges consecutive tool results and adds Continue. between two assistant turns", () => {
    const turns: Turn[] = [
      { role: "user", blocks: [{ kind: "text", text: "go" }] },
      { role: "assistant", blocks: [{ kind: "tool_use", id: "a", name: "Read", input: {} }] },
      { role: "user", blocks: [{ kind: "tool_result", id: "a", isError: false, content: [{ kind: "text", text: "1" }] }] },
      { role: "user", blocks: [{ kind: "tool_result", id: "b", isError: false, content: [{ kind: "text", text: "2" }] }] },
      { role: "assistant", blocks: [{ kind: "text", text: "done" }] },
      { role: "assistant", blocks: [{ kind: "text", text: "again" }] },
    ];
    const spec = anthropicAdapter.encode(
      { model: "m", system: "", turns, tools: [] },
      { baseUrl: "https://example.test", headers: {}, token: "k", sessionId: "s" },
    );
    const messages = (JSON.parse(spec.body) as { messages: { role: string; content: unknown[] }[] }).messages;
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    expect(messages[2]?.content).toHaveLength(2);
    expect(messages[4]).toEqual({ role: "user", content: [{ type: "text", text: "Continue." }] });
  });
});
