// Time to first token and output speed, per model. Only the latest value per
// model is kept, in `metrics.speed`.

export type SpeedRecord = {
  readonly ttftMs?: number;
  readonly tokensPerSecond?: number;
  readonly at: number;
};

export type SpeedMap = Readonly<Record<string, SpeedRecord>>;

export type Timings = {
  readonly sentAt: number;
  // When the first text, thinking or tool event arrived.
  readonly firstAt?: number;
  readonly endedAt: number;
  readonly outputTokens?: number;
};

// Speed is measured only over a run of at least 100 ms, so a very short reply
// does not report a rate that means nothing.
export function speedOf(timings: Timings): SpeedRecord {
  const durationMs = timings.endedAt - timings.sentAt;
  const ttftMs = timings.firstAt === undefined ? undefined : timings.firstAt - timings.sentAt;
  const tokensPerSecond =
    timings.outputTokens !== undefined && durationMs >= 100 ? (timings.outputTokens * 1000) / durationMs : undefined;
  return { ttftMs, tokensPerSecond, at: timings.endedAt };
}

export function withSpeed(current: unknown, model: string, record: SpeedRecord): SpeedMap {
  const known = typeof current === "object" && current !== null ? (current as SpeedMap) : {};
  return { ...known, [model]: record };
}
