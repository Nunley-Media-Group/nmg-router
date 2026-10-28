import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { listedCapabilities } from "../../models/capability-sources.ts";
import { visionOf } from "../../models/modalities.ts";
import { openAiModelsList } from "../../models/openai-models-list.ts";
import type { CapabilityIndex, ModelCapabilities, ProviderPlugin } from "../types.ts";

// xAI's OpenAI-compatible API, answered over the Responses wire. Its model list
// carries ids only; its language-model list carries each model's modalities.

const BASE_URL = "https://api.x.ai/v1";
const HEADERS = { "User-Agent": "nmg-router" };

// Each entry is found by its id and by each of its aliases.
export function parseXaiLanguageModels(body: unknown): CapabilityIndex | undefined {
  const record = typeof body === "object" && body !== null ? (body as { models?: unknown; data?: unknown }) : undefined;
  const entries = Array.isArray(record?.models) ? record.models : Array.isArray(record?.data) ? record.data : undefined;
  if (entries === undefined) return undefined;

  const index = new Map<string, ModelCapabilities>();
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, aliases } = entry as { id?: unknown; aliases?: unknown };
    const vision = visionOf(entry);
    if (typeof id !== "string" || vision === undefined) continue;
    const names = [id, ...(Array.isArray(aliases) ? aliases.filter((alias): alias is string => typeof alias === "string") : [])];
    for (const name of names) if (!index.has(name)) index.set(name, { vision });
  }
  return (rawId) => index.get(rawId);
}

export const xai: ProviderPlugin = {
  identity: { id: "xai", name: "xAI", baseUrl: BASE_URL, headers: () => HEADERS },
  login: apiKeyLogin({ validate: keyCheck(`${BASE_URL}/models`, () => HEADERS) }),
  models: openAiModelsList({ url: `${BASE_URL}/models`, headers: () => HEADERS }),
  capabilities: listedCapabilities({ url: `${BASE_URL}/language-models`, headers: () => HEADERS, parse: parseXaiLanguageModels }),
  wire: () => ({ wire: "openai-responses", baseUrl: BASE_URL }),
};
