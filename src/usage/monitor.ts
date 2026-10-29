import type { UsageOutcome, UsageReport } from "./report.ts";

// The usage readings the session keeps, per provider and active account, in memory
// only. A provider's endpoint is read at most once per interval, a read in flight is
// shared, and a failed read keeps the last good report. It holds reports and
// outcomes, never a credential, and it never touches the store.

export const READ_INTERVAL_MS = 60_000;

export type UsageMonitor = {
  // Reads through `source` unless a read started less than the interval ago. Never rejects.
  read(provider: string, account: string | undefined, source: () => Promise<UsageOutcome>): Promise<UsageOutcome>;
  // A report from a routed response's headers. It counts as a read.
  record(provider: string, account: string | undefined, report: UsageReport): void;
  // The last good report.
  latest(provider: string, account: string | undefined): UsageReport | undefined;
  // The latest outcome, good or failed.
  outcome(provider: string, account: string | undefined): UsageOutcome | undefined;
};

type Entry = {
  startedAt?: number;
  inFlight?: Promise<UsageOutcome>;
  good?: UsageReport;
  outcome?: UsageOutcome;
};

const UNAVAILABLE: UsageOutcome = { kind: "unavailable" };

export function createUsageMonitor(now: () => number = Date.now): UsageMonitor {
  const entries = new Map<string, Entry>();

  const keyOf = (provider: string, account: string | undefined): string => JSON.stringify([provider, account ?? null]);

  function entryFor(provider: string, account: string | undefined): Entry {
    const key = keyOf(provider, account);
    const existing = entries.get(key);
    if (existing !== undefined) return existing;
    const created: Entry = {};
    entries.set(key, created);
    return created;
  }

  return {
    read(provider, account, source) {
      const entry = entryFor(provider, account);
      if (entry.inFlight !== undefined) return entry.inFlight;
      const started = now();
      if (entry.startedAt !== undefined && started - entry.startedAt < READ_INTERVAL_MS) {
        return Promise.resolve(entry.outcome ?? UNAVAILABLE);
      }
      entry.startedAt = started;
      const pending = (async (): Promise<UsageOutcome> => {
        try {
          return await source();
        } catch {
          return UNAVAILABLE;
        }
      })().then((outcome) => {
        entry.inFlight = undefined;
        entry.outcome = outcome;
        if (outcome.kind === "ok") entry.good = outcome.report;
        return outcome;
      });
      entry.inFlight = pending;
      return pending;
    },

    record(provider, account, report) {
      const entry = entryFor(provider, account);
      entry.startedAt = now();
      entry.good = report;
      entry.outcome = { kind: "ok", report };
    },

    latest(provider, account) {
      return entries.get(keyOf(provider, account))?.good;
    },

    outcome(provider, account) {
      return entries.get(keyOf(provider, account))?.outcome;
    },
  };
}
