// `enabledModels` matching. A pattern is case-insensitive, `*` matches any run of
// characters and `?` one character, and a pattern with neither is an exact match.
// It is tested against `provider/model` and against the bare model.

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function globMatch(pattern: string, text: string): boolean {
  const source = escapeRegExp(pattern).replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${source}$`, "i").test(text);
}

// An absent or empty list allows every model. A non-empty list that matches
// nothing allows none.
export function modelEnabled(patterns: readonly string[], provider: string, model: string): boolean {
  if (patterns.length === 0) return true;
  const qualified = `${provider}/${model}`;
  return patterns.some((pattern) => globMatch(pattern, qualified) || globMatch(pattern, model));
}
