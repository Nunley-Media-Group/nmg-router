import { getJson, requestHeaders, type HttpOutcome } from "../providers/http.ts";
import type { DiscoveryOutcome, HttpDeps, ModelSource, ProviderContext, RawModel } from "../providers/types.ts";

// The list shapes a provider answers with: an object holding an array under one
// of four keys, or a bare array. Each entry needs an id; the limits are read
// when present.

const LIST_KEYS = ["data", "models", "result", "items"] as const;

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function arrayOf(body: unknown): unknown[] | undefined {
  if (Array.isArray(body)) return body;
  if (typeof body !== "object" || body === null) return undefined;
  for (const key of LIST_KEYS) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

export function parseOpenAiModelList(body: unknown): RawModel[] | undefined {
  const entries = arrayOf(body);
  if (entries === undefined) return undefined;
  const models: RawModel[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.trim() === "") continue;
    models.push({
      id: record.id,
      contextWindow: numberOf(record.context_length) ?? numberOf(record.context_window),
      maxOutput: numberOf(record.max_completion_tokens),
    });
  }
  return models;
}

// Maps a host outcome to the discovery outcome the catalog records. A 401 or a
// 403 means the stored credential is not accepted; any other failure is an
// unavailable service. An empty list is distinct from both.
export function toDiscovery(outcome: HttpOutcome, parse: (body: unknown) => RawModel[] | undefined): DiscoveryOutcome {
  if (outcome.kind === "offline") return { kind: "offline" };
  if (outcome.kind === "status") {
    return outcome.status === 401 || outcome.status === 403 ? { kind: "unauthenticated" } : { kind: "unavailable" };
  }
  if (outcome.kind === "malformed") return { kind: "unavailable" };
  const models = parse(outcome.body);
  if (models === undefined) return { kind: "unavailable" };
  return models.length === 0 ? { kind: "empty" } : { kind: "ok", models };
}

export function openAiModelsList(options: {
  readonly url: string;
  readonly headers: (context: ProviderContext) => Record<string, string>;
}): ModelSource {
  return {
    async list(deps: HttpDeps, context: ProviderContext): Promise<DiscoveryOutcome> {
      const outcome = await getJson(
        deps,
        options.url,
        requestHeaders(options.headers(context), context.auth?.token),
      );
      return toDiscovery(outcome, parseOpenAiModelList);
    },
  };
}
