// The order inside one provider: the newest version first (`claude-opus-5-5` is
// 5.5), then ids ending in `-latest` or a `-YYYYMMDD` date, then id A–Z.

// The first version-like number in an id: `3.1` in `kimi-k3.1-pro`, `5.5` in
// `claude-opus-5-5`, `5` in `glm-5`, and 0 when the id has none.
export function extractVersionNumber(id: string): number {
  const dotted = /(\d+\.\d+)/.exec(id)?.[1];
  if (dotted !== undefined) return Number(dotted);
  const dashed = /(\d{1,2})-(\d{1,2})/.exec(id);
  if (dashed?.[1] !== undefined && dashed[2] !== undefined) return Number(`${dashed[1]}.${dashed[2]}`);
  const leading = /(?:^|[-_])(\d+)/.exec(id)?.[1];
  return leading === undefined ? 0 : Number(leading);
}

const RECENCY_SUFFIX = /(?:-latest|-\d{8})$/;

// Negative when `a` sorts first: the newer version, then the recency suffix, then A–Z.
export function compareVersions(a: string, b: string): number {
  const byVersion = extractVersionNumber(b) - extractVersionNumber(a);
  if (byVersion !== 0) return byVersion;
  const bySuffix = Number(!RECENCY_SUFFIX.test(a)) - Number(!RECENCY_SUFFIX.test(b));
  if (bySuffix !== 0) return bySuffix;
  return a.localeCompare(b);
}
