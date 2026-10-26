import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/translate/adapters/codex-responses.ts";
import { createResponsesParser } from "../../src/translate/adapters/openai-responses.ts";
import type { RoutedRequest } from "../../src/translate/types.ts";
import { EXPECTED_CHUNKS, chunksOf, fixtureText, randomPieces, replay } from "../support/wire.ts";

const request: RoutedRequest = {
  model: "gpt-5.5",
  system: "Be brief.",
  turns: [{ role: "user", blocks: [{ kind: "text", text: "Read notes" }] }],
  tools: [],
  reasoning: { effort: "low" },
  maxOutput: 4096,
};

describe("codex dialect", () => {
  it("parses its stream with the Responses parser into the shared chunks", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const events = replay(createResponsesParser(), randomPieces(fixtureText("codex-responses"), seed));
      expect(chunksOf(events)).toEqual(EXPECTED_CHUNKS);
    }
  });

  it("rewrites the body for the Codex backend and adds its session headers", () => {
    const spec = codexAdapter.encode(request, {
      baseUrl: "https://chatgpt.com/backend-api",
      headers: { originator: "codex_cli_rs" },
      token: "codex-token",
      sessionId: "session-42",
    });
    const body = JSON.parse(spec.body) as Record<string, unknown>;
    expect(spec.url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(body).toMatchObject({
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "session-42",
    });
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(spec.headers).toMatchObject({
      authorization: "Bearer codex-token",
      originator: "codex_cli_rs",
      session_id: "session-42",
      conversation_id: "session-42",
    });
  });
});
