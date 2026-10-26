import { createResponsesParser, responsesBody } from "./openai-responses.ts";
import type { WireAdapter } from "../types.ts";
import { bearer, requestSpec } from "./shared.ts";

// The Codex dialect: the Responses body rewritten for the Codex backend, with its
// session headers. Its parser is the Responses parser.

export const codexAdapter: WireAdapter = {
  wire: "openai-codex-responses",
  encode(request, context) {
    const body = responsesBody(request);
    delete body.max_output_tokens;
    body.store = false;
    body.stream = true;
    body.include = ["reasoning.encrypted_content"];
    body.prompt_cache_key = context.sessionId;
    return requestSpec(`${context.baseUrl}/codex/responses`, body, context, bearer(context.token), {
      session_id: context.sessionId,
      conversation_id: context.sessionId,
    });
  },
  parser: createResponsesParser,
};
