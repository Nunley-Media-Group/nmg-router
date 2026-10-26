import { MAIN_LOOP, type SessionTracker } from "../routing/session-tracker.ts";
import { shouldCompact } from "./threshold.ts";

// After each main-loop turn, starts compaction when the routed context has reached
// the mod's threshold. The engine does not know a routed model's window, so this is
// the only trigger a routed session gets.

export type TriggerDeps = {
  readonly tracker: SessionTracker;
  // The routed model's catalog window, or undefined when none is known.
  readonly contextWindow: (model: string) => Promise<number | undefined>;
  readonly after: (ms: number, fn: () => void) => unknown;
  readonly compact: () => Promise<unknown>;
  readonly debug: (text: string) => void;
};

export type AutoTrigger = {
  onTurnComplete(): Promise<void>;
};

export function createAutoTrigger(deps: TriggerDeps): AutoTrigger {
  // Set while a scheduled compaction runs, so one turn end starts one compaction.
  let pending = false;
  return {
    async onTurnComplete() {
      try {
        const model = deps.tracker.model(MAIN_LOOP);
        if (pending || model === undefined) return;
        const window = await deps.contextWindow(model);
        if (window === undefined || !shouldCompact(deps.tracker.contextTokens(MAIN_LOOP), window)) return;
        pending = true;
        // The turn is still ending here, so the compaction waits for the clock.
        deps.after(0, () => {
          deps.compact().then(
            () => {
              pending = false;
            },
            () => {
              pending = false;
              // A failed start is retried at the next turn end, since the context is still over the threshold.
              deps.debug("nmg-router could not start compaction; it will be retried at the next turn end.");
            },
          );
        });
      } catch {
        deps.debug("nmg-router could not check the context threshold.");
      }
    },
  };
}
