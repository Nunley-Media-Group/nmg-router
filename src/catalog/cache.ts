import type { HostPort } from "../host.ts";
import type { CatalogModel } from "../providers/types.ts";

// The catalog cache in $.store: each provider's last status and models. It holds
// no credential, and a stored value that does not match the shape is ignored.

export type CatalogStatus = "ok" | "unauthenticated" | "unavailable" | "empty" | "offline" | "not-logged-in";

export type ProviderCache = {
  readonly fetchedAt: number;
  readonly status: CatalogStatus;
  readonly models: readonly CatalogModel[];
};

export type CatalogCache = {
  readonly version: 1;
  readonly providers: Readonly<Record<string, ProviderCache>>;
};

export type CacheDeps = Pick<HostPort, "store">;

const KEY = "catalog.cache";
const STATUSES: readonly string[] = ["ok", "unauthenticated", "unavailable", "empty", "offline", "not-logged-in"];

export const EMPTY_CACHE: CatalogCache = { version: 1, providers: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModel(value: unknown): value is CatalogModel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.name === "string" &&
    typeof value.wire === "string" &&
    typeof value.baseUrl === "string"
  );
}

function providerOf(value: unknown): ProviderCache | undefined {
  if (!isRecord(value) || typeof value.fetchedAt !== "number") return undefined;
  if (typeof value.status !== "string" || !STATUSES.includes(value.status)) return undefined;
  if (!Array.isArray(value.models) || !value.models.every(isModel)) return undefined;
  return { fetchedAt: value.fetchedAt, status: value.status as CatalogStatus, models: value.models };
}

export async function readCache(deps: CacheDeps): Promise<CatalogCache> {
  const raw = await deps.store.get(KEY);
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.providers)) return EMPTY_CACHE;
  const providers: Record<string, ProviderCache> = {};
  for (const [id, value] of Object.entries(raw.providers)) {
    const entry = providerOf(value);
    if (entry !== undefined) providers[id] = entry;
  }
  return { version: 1, providers };
}

export async function writeCache(deps: CacheDeps, cache: CatalogCache): Promise<void> {
  await deps.store.set(KEY, cache);
}
