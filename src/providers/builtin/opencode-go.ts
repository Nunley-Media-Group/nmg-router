import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { staticCapabilities } from "../../models/capability-sources.ts";
import { openAiModelsList } from "../../models/openai-models-list.ts";
import type { HeaderContext, ModelCapabilities, ProviderPlugin, ResolvedWire, WireFormat } from "../types.ts";

// OpenCode Go serves each model over the wire its family uses, so the wire is
// resolved per model, in this order: a per-id override, the bundled metadata,
// the id's prefix, then the default.

const BASE_URL = "https://opencode.ai/inference/go";
const HEADERS = { "User-Agent": "nmg-router" };

// A routed request names the mod's version and carries one session id, so the
// service can tell the traffic apart. The listing and key check keep HEADERS.
function routedHeaders({ version, sessionId }: HeaderContext): Record<string, string> {
  return {
    ...HEADERS,
    ...(version === undefined ? {} : { "User-Agent": `nmg-router/${version}` }),
    ...(sessionId === undefined ? {} : { "x-opencode-session": sessionId }),
  };
}

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

// OpenCode Go publishes no modality data, so image support is bundled. The
// values come from oh-my-pi's bundled catalog data (pi-catalog models.json,
// `opencode-go`), used as reference data only.
const VISION_MODELS = [
  "gpt-5.6-luna", "grok-4.5", "kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code", "kimi-k3", "mimo-v2-omni",
  "mimo-v2.5", "minimax-m3", "qwen3.5-plus", "qwen3.6-plus", "qwen3.7-plus", "qwen3.8-max",
];
const TEXT_MODELS = [
  "deepseek-v4-flash", "deepseek-v4-pro", "glm-5", "glm-5.1", "glm-5.2", "glm-5.3", "hy3", "mimo-v2-pro",
  "mimo-v2.5-pro", "minimax-m2.5", "minimax-m2.7", "qwen3.7-max",
];

export const OPENCODE_GO_CAPABILITIES: Readonly<Record<string, ModelCapabilities>> = Object.freeze({
  ...Object.fromEntries(VISION_MODELS.map((model) => [model, { vision: true }])),
  ...Object.fromEntries(TEXT_MODELS.map((model) => [model, { vision: false }])),
});

export const openCodeGo: ProviderPlugin = {
  identity: { id: "opencode-go", name: "OpenCode Go", baseUrl: BASE_URL, headers: routedHeaders },
  login: apiKeyLogin({ validate: keyCheck(`${BASE_URL}/v1/models`, () => HEADERS) }),
  models: openAiModelsList({ url: `${BASE_URL}/v1/models`, headers: () => HEADERS }),
  capabilities: staticCapabilities(OPENCODE_GO_CAPABILITIES),
  wire: openCodeWire,
};
