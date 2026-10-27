import type { HostPort } from "../host.ts";

// Recent use per model, kept in `$.store` as `{ <switch argument>: epoch ms }`,
// the 50 newest. It holds model ids and times only, never a credential.

export const RECENT_KEY = "models.recent";
export const RECENT_LIMIT = 50;

export type RecentMap = Readonly<Record<string, number>>;

export function recentOf(current: unknown): RecentMap {
  if (typeof current !== "object" || current === null || Array.isArray(current)) return {};
  const kept: Record<string, number> = {};
  for (const [id, at] of Object.entries(current)) {
    if (typeof at === "number" && Number.isFinite(at)) kept[id] = at;
  }
  return kept;
}

// The map with `id` used at `now`, keeping only the newest RECENT_LIMIT entries.
export function withRecent(current: unknown, id: string, now: number): RecentMap {
  const merged = { ...recentOf(current), [id]: now };
  const newest = Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_LIMIT);
  return Object.fromEntries(newest);
}

export async function recordRecentUse(host: Pick<HostPort, "store">, id: string, now: number): Promise<void> {
  const current = await host.store.get(RECENT_KEY);
  await host.store.set(RECENT_KEY, withRecent(current, id, now));
}
