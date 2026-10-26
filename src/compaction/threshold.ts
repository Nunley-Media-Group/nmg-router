// The mod's own compaction threshold for a routed model. The engine cannot read a
// non-Claude model's window, so the mod checks it after each main-loop turn. The
// reserve leaves room for the summary: 15% of the window, and at least 16384 tokens.

const RESERVE_FLOOR = 16384;

export function thresholdTokens(window: number): number {
  return window - Math.max(Math.floor((window * 15) / 100), RESERVE_FLOOR);
}

export function shouldCompact(tokens: number, window: number): boolean {
  return tokens >= thresholdTokens(window);
}
