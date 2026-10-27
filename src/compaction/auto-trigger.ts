import { RoutedError } from "../errors/routed-errors.ts";
import type { RoutedModelInfo } from "../routing/router.ts";
import { MAIN_LOOP, type SessionTracker } from "../routing/session-tracker.ts";
import type { ApiMessageInput } from "../translate/messages.ts";
import type { RoutedRequest } from "../translate/types.ts";
import type { RoutedView } from "./routed-view.ts";
import { buildSummaryRequest } from "./summary-request.ts";
import { shouldCompact } from "./threshold.ts";

// After each main-loop turn, summarizes a routed conversation in place when its
// context has reached the mod's threshold. The engine does not know a routed
// model's window, so this is the only trigger a routed session gets. It never
// starts a Claude Code compaction: on 2.1.310 `$.session.compact()` skips the
// calling plugin's own hook, so core would summarize the routed transcript on
// Anthropic. The summary is kept in the routed view, for the provider alone.

export type TriggerDeps = {
  readonly tracker: SessionTracker;
  readonly view: RoutedView;
  // The routed model's provider, window and output limit; a Claude model has no window.
  readonly describe: (model: string) => Promise<RoutedModelInfo>;
  readonly complete: (model: string, request: RoutedRequest, signal: AbortSignal) => Promise<string>;
  // The main loop's transcript in Messages API form, or a deny.
  readonly messages: () => Promise<readonly ApiMessageInput[] | { readonly deny: string }>;
  readonly after: (ms: number, fn: () => void) => unknown;
  // One line in the transcript.
  readonly log: (text: string) => void;
  readonly debug: (text: string) => void;
};

export type AutoTrigger = {
  onTurnComplete(): Promise<void>;
};

function kindOf(error: unknown): string {
  return error instanceof RoutedError ? error.kind : "internal";
}

// The longest an in-place summary waits for its provider. At the deadline the request
// is aborted and the summary dropped, so a stalled provider cannot hold the next routed step.
export const SUMMARY_TIMEOUT_MS = 120_000;

// Summarizes the main loop's messages after the current cut, with the current
// summary carried in, and keeps the result as the new view. A failure, or a summary
// still running at the deadline, leaves the view as it was; the next turn end, still
// over the threshold, retries.
export async function summarizeInPlace(deps: TriggerDeps, model: string, info: RoutedModelInfo): Promise<void> {
  const notSummarized = (kind: string): void =>
    deps.log(`${info.provider} could not summarize this conversation (${kind}); it will be retried at the next turn end.`);
  const controller = new AbortController();
  // Settles when the deadline aborts the request, even on a transport that cannot abort it.
  const expired = new Promise<undefined>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve(undefined), { once: true });
  });
  try {
    const messages = await deps.messages();
    if (!Array.isArray(messages)) return notSummarized("unreadable_context");
    const current = deps.view.get(MAIN_LOOP);
    // The turn has ended, so the cut leaves no tool use without its result.
    const cut = messages.length;
    const from = current !== undefined && current.cut <= cut ? current : undefined;
    const request = buildSummaryRequest(messages.slice(from?.cut ?? 0), undefined, { id: model, maxOutput: info.maxOutput }, from?.summary);
    deps.after(SUMMARY_TIMEOUT_MS, () => controller.abort());
    // A reply after the deadline loses the race, and its late rejection is handled by the race too.
    const reply = await Promise.race([deps.complete(model, request, controller.signal), expired]);
    // Text received before the deadline is discarded.
    if (controller.signal.aborted || reply === undefined) return notSummarized("timed_out");
    const summary = reply.trim();
    if (summary === "") return notSummarized("malformed");
    deps.view.set(MAIN_LOOP, { summary, model, cut });
    deps.tracker.resetContext(MAIN_LOOP);
  } catch (error) {
    if (controller.signal.aborted) return notSummarized("timed_out");
    notSummarized(kindOf(error));
  }
}

export function createAutoTrigger(deps: TriggerDeps): AutoTrigger {
  return {
    async onTurnComplete() {
      try {
        const model = deps.tracker.model(MAIN_LOOP);
        if (model === undefined || deps.view.pending(MAIN_LOOP) !== undefined) return;
        const info = await deps.describe(model);
        if (info.contextWindow === undefined || !shouldCompact(deps.tracker.contextTokens(MAIN_LOOP), info.contextWindow)) return;
        // The turn is still ending here, so the summary waits for the clock. It is
        // pending from now, so a step that starts first waits for it.
        deps.view.hold(
          MAIN_LOOP,
          new Promise<void>((resolve) => {
            deps.after(0, () => {
              void summarizeInPlace(deps, model, info).finally(resolve);
            });
          }),
        );
      } catch {
        deps.debug("nmg-router could not check the context threshold.");
      }
    },
  };
}
