// Case-insensitive subsequence search for the login and logout pickers. Each
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

export function fuzzyFilter<T>(rows: readonly T[], query: string, textOf: (row: T) => string): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) return [...rows];

  const scored: { readonly row: T; readonly score: number }[] = [];
  for (const row of rows) {
    const text = textOf(row).toLowerCase();
    let score = 0;
    let matches = true;
    for (const token of tokens) {
      const span = subsequenceSpan(text, token);
      if (span === undefined) {
        matches = false;
        break;
      }
      score += span;
    }
    if (matches) scored.push({ row, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.row);
}
