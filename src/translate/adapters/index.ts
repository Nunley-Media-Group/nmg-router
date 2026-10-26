import type { WireFormat } from "../../providers/types.ts";
import type { WireAdapter } from "../types.ts";
import { anthropicAdapter } from "./anthropic-messages.ts";
import { codexAdapter } from "./codex-responses.ts";
import { completionsAdapter } from "./openai-completions.ts";
import { responsesAdapter } from "./openai-responses.ts";

// The one map to extend. A wire format is one adapter module plus one entry here.
export const WIRE_ADAPTERS: Readonly<Record<WireFormat, WireAdapter>> = {
  "openai-completions": completionsAdapter,
  "openai-responses": responsesAdapter,
  "openai-codex-responses": codexAdapter,
  "anthropic-messages": anthropicAdapter,
};
