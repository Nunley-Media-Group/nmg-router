import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { openAiModelsList } from "../../models/openai-models-list.ts";
import type { ProviderPlugin } from "../types.ts";

// xAI's OpenAI-compatible API, answered over the Responses wire.

const BASE_URL = "https://api.x.ai/v1";
const HEADERS = { "User-Agent": "nmg-router" };

export const xai: ProviderPlugin = {
  identity: { id: "xai", name: "xAI", baseUrl: BASE_URL, headers: () => HEADERS },
  login: apiKeyLogin({ validate: keyCheck(`${BASE_URL}/models`, () => HEADERS) }),
  models: openAiModelsList({ url: `${BASE_URL}/models`, headers: () => HEADERS }),
  wire: () => ({ wire: "openai-responses", baseUrl: BASE_URL }),
};
