import { apiKeyLogin, keyCheck } from "../../auth/api-key-login.ts";
import { listedCapabilities } from "../../models/capability-sources.ts";
import { visionOf } from "../../models/modalities.ts";
import { toDiscovery } from "../../models/openai-models-list.ts";
import { getJson, requestHeaders } from "../http.ts";
import type { CapabilityIndex, DiscoveryOutcome, HttpDeps, ModelSource, ProviderContext, ProviderPlugin, RawModel } from "../types.ts";

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

// The service names some models by their id. That is no name: the catalog then
// falls back to the model's metadata name, else the bare model.
function nameOf(entry: unknown, id: string): string | undefined {
  const name = (entry as { name?: unknown }).name;
  return typeof name === "string" && name.trim() !== "" && name !== id ? name : undefined;
}

// The id without its `modelType/` prefix.
function bareOf(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
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
    if (id !== undefined && !models.has(id)) models.set(id, { id, name: nameOf(entry, id) });
  }
  for (const entry of free ?? []) {
    const id = idOf(entry);
    if (id !== undefined && !models.has(id)) models.set(id, { id, name: `${nameOf(entry, id) ?? bareOf(id)} (free)` });
  }
  return [...models.values()];
}

// The aliases' own prefixes, which name no vendor.
const ALIAS_PREFIXES = new Set(["cline-pass", "cline-free"]);

// `kimi-k3`, `kimi-k3-free` and `kimi-k3:free` name one model.
function modelKey(id: string): string {
  return bareOf(id).replace(/(?::|-)free$/, "");
}

function vendorOf(id: string): string | undefined {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : undefined;
}

type ModelData = { readonly id: string; readonly vision: boolean | undefined };

// ClinePass's model data lists vendor ids (`moonshotai/kimi-k3`), not the
// recommended list's aliases (`cline-pass/kimi-k3`). An alias takes an exact id
// first, else every entry for the same model, kept to the alias's own vendor when
// it names one that is listed. Image support is known only when all of them agree.
export function parseClineModelData(body: unknown): CapabilityIndex | undefined {
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return undefined;

  const byId = new Map<string, ModelData>();
  const byKey = new Map<string, ModelData[]>();
  for (const entry of data) {
    const id = idOf(entry);
    if (id === undefined || byId.has(id)) continue;
    const item = { id, vision: visionOf(entry) };
    byId.set(id, item);
    byKey.set(modelKey(id), [...(byKey.get(modelKey(id)) ?? []), item]);
  }

  function candidatesFor(rawId: string): readonly ModelData[] {
    const exact = byId.get(rawId);
    if (exact !== undefined) return [exact];
    const all = byKey.get(modelKey(rawId)) ?? [];
    const vendor = vendorOf(rawId);
    if (vendor === undefined || ALIAS_PREFIXES.has(vendor)) return all;
    const own = all.filter((item) => vendorOf(item.id) === vendor);
    return own.length > 0 ? own : all;
  }

  return (rawId) => {
    const [first, ...rest] = candidatesFor(rawId);
    if (first?.vision === undefined || rest.some((item) => item.vision !== first.vision)) return undefined;
    return { vision: first.vision };
  };
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
  capabilities: listedCapabilities({
    url: `${BASE_URL}/ai/cline/models`,
    headers: ({ platform }) => clientHeaders(platform),
    parse: parseClineModelData,
  }),
  wire: () => ({ wire: "openai-completions", baseUrl: BASE_URL }),
  requestModel: clinePassRequestModel,
};
