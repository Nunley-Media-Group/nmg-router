import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { toDiscovery } from "../../models/openai-models-list.ts";
import { getJson, requestHeaders } from "../http.ts";
import type { DiscoveryOutcome, HttpDeps, ModelSource, ProviderContext, ProviderPlugin, RawModel } from "../types.ts";

// ClinePass answers its recommended models in two lists: `clinePass` (paid) and
// `free`. A free model is shown with " (free)" after its name. Its requests
// mirror the Cline client's headers, so the service accepts them.
//
// The API takes only `modelType/model` ids (`cline-pass/glm-5.3`,
// `nvidia/nemotron-3.5-lightning-free`) and answers a bare one with HTTP 400. A
// paid id loses its `cline-pass/` in the `provider/model` id, so a request puts it
// back on any id without a slash. A free id keeps its own prefix.

const BASE_URL = "https://api.cline.bot/api/v1";

function clientHeaders(platform: string): Record<string, string> {
  const hostPlatform = platform === "macos" ? "darwin" : platform === "windows" ? "win32" : "linux";
  return {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline",
    "X-IS-MULTIROOT": "false",
    "X-CLIENT-TYPE": "cline-sdk",
    "User-Agent": "Cline/3.0.58",
    "X-CLIENT-VERSION": "3.0.58",
    "X-PLATFORM": hostPlatform,
    "X-PLATFORM-VERSION": "3.0.54",
    "X-CORE-VERSION": "0.0.79",
  };
}

function idOf(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" && id.trim() !== "" ? id : undefined;
}

function nameOf(entry: unknown): string | undefined {
  const name = (entry as { name?: unknown }).name;
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

// Duplicates across the two lists keep their first entry: the paid one.
export function parseClinePassList(body: unknown): RawModel[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const paid = Array.isArray(record.clinePass) ? record.clinePass : undefined;
  const free = Array.isArray(record.free) ? record.free : undefined;
  if (paid === undefined && free === undefined) return undefined;

  const models = new Map<string, RawModel>();
  for (const entry of paid ?? []) {
    const id = idOf(entry);
    if (id !== undefined && !models.has(id)) models.set(id, { id, name: nameOf(entry) });
  }
  for (const entry of free ?? []) {
    const id = idOf(entry);
    if (id !== undefined && !models.has(id)) models.set(id, { id, name: `${nameOf(entry) ?? id} (free)` });
  }
  return [...models.values()];
}

const models: ModelSource = {
  async list(deps: HttpDeps, context: ProviderContext): Promise<DiscoveryOutcome> {
    const outcome = await getJson(
      deps,
      `${BASE_URL}/ai/cline/recommended-models`,
      requestHeaders(clientHeaders(context.platform), context.auth?.token),
    );
    return toDiscovery(outcome, parseClinePassList);
  },
};

export function clinePassRequestModel(model: string): string {
  return model.includes("/") ? model : `cline-pass/${model}`;
}

export const clinePass: ProviderPlugin = {
  identity: {
    id: "cline-pass",
    name: "ClinePass",
    baseUrl: BASE_URL,
    headers: ({ platform }) => clientHeaders(platform),
  },
  login: apiKeyLogin({ validate: keyCheck(`${BASE_URL}/users/me`, clientHeaders) }),
  models,
  wire: () => ({ wire: "openai-completions", baseUrl: BASE_URL }),
  requestModel: clinePassRequestModel,
};
