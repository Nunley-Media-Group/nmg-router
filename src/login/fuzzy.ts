// Case-insensitive subsequence search for the login, logout and model hub pickers. Each
// whitespace-separated word of the query must appear, in order, in the row's
// text. Rows rank by how tightly their letters sit together, and ties keep the
// order they came in.

// The shortest span in `text` that holds `token` as a subsequence, or undefined.
function subsequenceSpan(text: string, token: string): number | undefined {
  let best: number | undefined;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== token[0]) continue;
    let matched = 0;
    let end = start;
    for (let index = start; index < text.length && matched < token.length; index += 1) {
      if (text[index] === token[matched]) {
        matched += 1;
        end = index;
      }
    }
    if (matched === token.length) {
      const span = end - start;
      best = best === undefined ? span : Math.min(best, span);
      if (best === 0) break;
    }
  }
  return best;
}

// The score of `text` for `query`: the sum over the query's words of the tightest
// span each word covers, so lower is better. Undefined when a word is missing.
export function fuzzyScore(text: string, query: string): number | undefined {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const token of query.trim().toLowerCase().split(/\s+/)) {
    if (token === "") continue;
    const span = subsequenceSpan(haystack, token);
    if (span === undefined) return undefined;
    score += span;
  }
  return score;
}

export function fuzzyFilter<T>(rows: readonly T[], query: string, textOf: (row: T) => string): T[] {
  if (query.trim() === "") return [...rows];

  const scored: { readonly row: T; readonly score: number }[] = [];
  for (const row of rows) {
    const score = fuzzyScore(textOf(row), query);
    if (score !== undefined) scored.push({ row, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.row);
}
