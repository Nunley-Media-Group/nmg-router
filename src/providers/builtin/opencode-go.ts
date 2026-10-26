import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { openAiModelsList } from "../../models/openai-models-list.ts";
import type { ProviderPlugin, ResolvedWire, WireFormat } from "../types.ts";

// OpenCode Go serves each model over the wire its family uses, so the wire is
// resolved per model, in this order: a per-id override, the bundled metadata,
// the id's prefix, then the default.

const BASE_URL = "https://opencode.ai/inference/go";
const HEADERS = { "User-Agent": "nmg-router" };

const WIRE_OVERRIDES: ReadonlyMap<string, WireFormat> = new Map<string, WireFormat>([
  ["deepseek-v4-flash", "openai-responses"],
  ["minimax-m2.7", "openai-completions"],
  ["minimax-m3", "openai-completions"],
  ["minimax-m3-free", "openai-completions"],
  ["qwen3.5-plus", "openai-completions"],
  ["qwen3.6-plus", "openai-completions"],
]);

function wireByPrefix(model: string): WireFormat {
  if (model.startsWith("gpt-") || model.startsWith("grok-")) return "openai-responses";
  if (model.startsWith("minimax-") || model.startsWith("qwen")) return "anthropic-messages";
  return "openai-completions";
}

// Anthropic-messages models use the bare base; every other wire uses `<base>/v1`.
export function openCodeWire(model: string, metadataWire?: WireFormat): ResolvedWire {
  const wire = WIRE_OVERRIDES.get(model) ?? metadataWire ?? wireByPrefix(model);
  return { wire, baseUrl: wire === "anthropic-messages" ? BASE_URL : `${BASE_URL}/v1` };
}

export const openCodeGo: ProviderPlugin = {
  identity: { id: "opencode-go", name: "OpenCode Go", baseUrl: BASE_URL, headers: () => HEADERS },
  login: apiKeyLogin({ validate: keyCheck(`${BASE_URL}/v1/models`, () => HEADERS) }),
  models: openAiModelsList({ url: `${BASE_URL}/v1/models`, headers: () => HEADERS }),
  wire: openCodeWire,
};
