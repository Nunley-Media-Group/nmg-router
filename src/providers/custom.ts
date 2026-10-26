import { ConfigProblem } from "../errors/errors.ts";
import { keyCheck, apiKeyLogin } from "../auth/api-key-login.ts";
import { openAiModelsList } from "../models/openai-models-list.ts";
import type { RawProviderEntry } from "../config/user-config.ts";
import type {
  DiscoveryOutcome,
  Effort,
  LoginMethod,
  ModelSource,
  Price,
  ProviderPlugin,
  RawModel,
  WireFormat,
} from "./types.ts";

// A custom provider from config.json, adapted to the same ProviderPlugin shape as a
// built-in. Its headers are non-secret by construction: the loader refuses any
// entry that holds a credential before it reaches here.

const EFFORTS: readonly Effort[] = ["minimal", "low", "medium", "high", "xhigh", "max"];
const WIRES: readonly WireFormat[] = ["openai-completions", "openai-responses", "anthropic-messages"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function priceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function priceOf(value: unknown): Price | undefined {
  const input = priceNumber(isRecord(value) ? value.input : undefined);
  const output = priceNumber(isRecord(value) ? value.output : undefined);
  if (!isRecord(value) || input === undefined || output === undefined) return undefined;
  return {
    input,
    output,
    cacheRead: priceNumber(value.cacheRead),
    cacheWrite: priceNumber(value.cacheWrite),
  };
}

function modelOf(value: unknown): RawModel | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.trim() === "") return undefined;
  const efforts = Array.isArray(value.reasoningEfforts)
    ? value.reasoningEfforts.filter((item): item is Effort => EFFORTS.includes(item as Effort))
    : undefined;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : undefined,
    contextWindow: numberOrUndefined(value.contextWindow),
    maxOutput: numberOrUndefined(value.maxOutput),
    reasoningEfforts: efforts,
    vision: typeof value.vision === "boolean" ? value.vision : undefined,
    price: priceOf(value.price),
  };
}

function staticSource(models: readonly RawModel[]): ModelSource {
  return {
    async list(): Promise<DiscoveryOutcome> {
      return models.length === 0 ? { kind: "empty" } : { kind: "ok", models };
    },
  };
}

// Returns the provider, or the problem that keeps it out of the catalog. The
// problem names the entry path and never a value.
export function customProvider(id: string, entry: RawProviderEntry): ProviderPlugin | ConfigProblem {
  const path = `providers.${id}`;
  const { baseUrl, api, auth, headers, models } = entry;
  if (typeof baseUrl !== "string" || !/^https?:\/\//i.test(baseUrl)) return new ConfigProblem("invalid_entry", path);
  if (typeof api !== "string" || !WIRES.includes(api as WireFormat)) return new ConfigProblem("invalid_entry", path);
  if (auth !== undefined && auth !== "api-key" && auth !== "none") return new ConfigProblem("invalid_entry", path);

  const fixedHeaders: Record<string, string> = {};
  if (isRecord(headers)) {
    for (const [name, value] of Object.entries(headers)) {
      if (typeof value === "string") fixedHeaders[name] = value;
    }
  }
  const name = typeof entry.name === "string" && entry.name !== "" ? entry.name : id;
  const wire = api as WireFormat;
  const listedModels = Array.isArray(models) ? models.map(modelOf).filter((model): model is RawModel => model !== undefined) : undefined;
  const headersFor = () => fixedHeaders;
  const login: LoginMethod =
    auth === "none"
      ? { kind: "none" }
      : apiKeyLogin({ validate: keyCheck(`${baseUrl}/models`, headersFor) });

  return {
    identity: { id, name, baseUrl, headers: headersFor },
    login,
    models:
      listedModels !== undefined
        ? staticSource(listedModels)
        : openAiModelsList({ url: `${baseUrl}/models`, headers: headersFor }),
    wire: () => ({ wire, baseUrl }),
  };
}
