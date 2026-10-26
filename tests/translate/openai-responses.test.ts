import { describe, expect, it } from "vitest";
import { createResponsesParser, responsesAdapter } from "../../src/translate/adapters/openai-responses.ts";
import type { RoutedRequest } from "../../src/translate/types.ts";
import { EXPECTED_CHUNKS, chunksOf, fixtureText, randomPieces, replay } from "../support/wire.ts";

const request: RoutedRequest = {
  model: "fixture-model-1",
  system: "Be brief.",
  turns: [{ role: "user", blocks: [{ kind: "text", text: "Read notes" }] }],
  tools: [{ name: "Read", description: "Read a file", schema: { type: "object" } }],
  reasoning: { effort: "high" },
};

describe("openai-responses wire", () => {
  it("maps every random split of its typed events to the shared chunks", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const events = replay(createResponsesParser(), randomPieces(fixtureText("openai-responses"), seed));
      expect(events[0]).toEqual({ type: "model", id: "fixture-model-1" });
      expect(chunksOf(events)).toEqual(EXPECTED_CHUNKS);
    }
  });

  it("encodes the responses endpoint with instructions, the effort and an automatic summary", () => {
    const spec = responsesAdapter.encode(request, { baseUrl: "https://example.test/v1", headers: {}, token: "t", sessionId: "s" });
    const body = JSON.parse(spec.body) as Record<string, unknown>;
    expect(spec.url).toBe("https://example.test/v1/responses");
    expect(body).toMatchObject({
      model: "fixture-model-1",
      instructions: "Be brief.",
      store: false,
      stream: true,
      reasoning: { effort: "high", summary: "auto" },
      tools: [{ type: "function", name: "Read", description: "Read a file", parameters: { type: "object" } }],
    });
    expect(body.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "Read notes" }] }]);
  });

  it("ends with an error, not a stop, when the response is cut off by a content filter", () => {
    const parser = createResponsesParser();
    const events = parser.push(
      'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"model":"m","incomplete_details":{"reason":"content_filter"}}}\n\n',
    );
    expect(events).toContainEqual({ type: "error", kind: "provider_error" });
    expect(events.some((event) => event.type === "stop")).toBe(false);
  });
});
