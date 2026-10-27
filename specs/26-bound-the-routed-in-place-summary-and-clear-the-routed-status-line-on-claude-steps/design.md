# Root Cause Analysis: Bound the routed in-place summary and clear the routed status line on Claude steps

**Issue**: #26
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions/

## Root Cause

1. `summarizeInPlace` in `src/compaction/auto-trigger.ts` calls `deps.complete(model, request, new AbortController().signal)`. Nothing can abort that signal. `createAutoTrigger` holds the summary as the main loop's pending work (`view.hold`), and a routed main-loop step waits on `view.pending(MAIN_LOOP)` before it reads the transcript (`src/routing/router.ts`, `routed`). The curl transport's `--connect-timeout 30` only bounds connecting. A provider that accepts the request and then stalls keeps the summary, and so the next routed step, waiting until the person interrupts. The fetch transport cannot be aborted at all, so a signal alone would not bound it.
2. Waiting for a summary at all is also a defect. `turn.step` hooks run under Claude Code's `HookBudget`: 10,000 ms of the hook's own time, where only `$` calls are free. `settled()` in `src/routing/router.ts` waits on the pending summary as a plain promise, so the wait counts against the budget. A summary longer than about 10 seconds makes the waiting step fail closed with `HooksError`, and the person sees `internal`. No deadline above 10 seconds can keep that step alive. The unit-test fake host does not model the budget, so the tests did not catch this; verify found it in a live run.
3. The router calls `host.ui.status(...)` only on routed main-loop steps: `statusText` after a successful reply and `errorStatusText` in `failure`. A Claude step goes from `routeStep` straight to `next(e)` (`src/routing/turn-step.ts`), and nothing clears the line, so the last routed text stays.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/compaction/auto-trigger.ts` | `summarizeInPlace` | Sends the summary with a signal that never aborts |
| `src/routing/router.ts` | `routed`, `failure`, `Router`, `settled` | Sets the status line on routed main-loop steps only; waits on the pending summary |
| `src/routing/turn-step.ts` | `routeStep`, `routeStepFailed` | Passes Claude steps to `next` without touching the status line |
| `hooks/register.ts` | `triggerDeps` | Supplies `after` from `$.clock.after` (unchanged) |

## Fix Strategy

Summary deadline (`src/compaction/auto-trigger.ts`):

- Add `export const SUMMARY_TIMEOUT_MS = 120_000`.
- In `summarizeInPlace`, create an `AbortController` before calling `complete`. Schedule `deps.after(SUMMARY_TIMEOUT_MS, () => controller.abort())`.
- Race `deps.complete(model, request, controller.signal)` against a promise that settles when the signal aborts. That way the summary settles at the deadline even on the fetch transport, which cannot abort `$.http.fetch`. A reply that arrives later is ignored, and its rejection is swallowed so it never surfaces as unhandled.
- After the race, and also in the `catch` path, check `controller.signal.aborted` first. If it aborted, call `notSummarized("timed_out")` and return without touching the view or the tracker. This discards partial text that `send` returns on abort, and a `TransportFailure` that the curl transport throws on abort is reported as `timed_out`, not `network`.
- The deadline timer is not cancelled when the summary finishes first. Aborting a request that has already settled does nothing, and the `aborted` check runs only before the result is used.
- `createAutoTrigger` keeps its behavior. The held promise settles when `summarizeInPlace` returns and `view.hold` drops the pending entry. The next turn end, still over the threshold, retries as with any other failure. `view.pending` stays the trigger's guard against starting a second summary. Its comment that a step starting first waits for the summary is corrected.

No wait for the summary (`src/routing/router.ts`):

- Remove `settled()` and the `await settled(view.pending(MAIN_LOOP), signal)` line in `routed`. A routed main-loop step reads the transcript and applies the view as it is at that moment.
- A summary that finishes during or after the step calls `view.set` with the cut it read at the turn end. The next routed main-loop step applies it as usual, and `view.apply` already drops a view whose cut is beyond the transcript.
- This replaces spec #4's rule that "a routed main-loop `turn.step` first awaits a pending summary, bounded by the step's abort signal".

Status line (`src/routing/router.ts`, `src/routing/turn-step.ts`):

- In `createRouter`, keep a `statusShown` flag. Set it wherever a main-loop step calls `host.ui.status(...)`: in `failure` and after a successful routed reply.
- Add `Router.claudeStep(e: TurnStepInput): void`. When `e.agentId === undefined` and `statusShown` is set, it calls `host.ui.status(undefined)` and resets the flag. A subagent step does nothing.
- In `routeStep` and `routeStepFailed`, call `router.claudeStep(e)` on the Claude branch before `next(e)`.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/compaction/auto-trigger.ts` | Add `SUMMARY_TIMEOUT_MS`; abort and race the summary at the deadline; report `timed_out` and keep the view when aborted | AC1, AC2, AC3, FR1, FR2 |
| `src/routing/router.ts` | Track `statusShown`; add `claudeStep` to `Router` | AC4, AC5, FR3 |
| `src/routing/router.ts` | Remove `settled()` and the wait for the pending summary | AC1, AC6, FR4 |
| `src/compaction/auto-trigger.ts` | Correct the `createAutoTrigger` comment about steps waiting | FR4 |
| `tests/compaction/routed-view.test.ts` | Replace "waits for a pending summary before it reads the transcript" with the AC6 tests | AC6, FR4 |
| `src/routing/turn-step.ts` | Call `router.claudeStep(e)` before passing a Claude step to `next` | AC4, FR3 |

## Blast Radius

- Only the auto-triggered in-place summary gets a deadline. `/compact` summaries through `compactSession` keep following the host's signal.
- Any test double that implements `Router` must provide `claudeStep`.
- A routed step taken while a summary runs sends the longer, unsummarized context once. With the trigger at 85% of the window, that step still fits. A summary that finishes after the step reaches the step after it.
- Claude steps still go to `next(e)` unchanged. The only new effect is one `status(undefined)` call after routed status was shown, on main-loop steps only.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Abort signal plus a race against the deadline in `summarizeInPlace` | Selected | Bounds both transports and keeps the change inside the summary path |
| Pass a timer signal and rely on the transport to abort | Rejected | `fetchTransport` cannot abort `$.http.fetch`, so a stall there would still hold the routed step |
| Add `--max-time` to the curl arguments | Rejected | It would also bound routed turn steps, which the issue does not change, and it does not cover fetch |
| Never wait for a running summary | Selected | Any wait on a plain promise counts against the 10-second hook budget, so only no wait is safe |
| Wait for the summary up to a few seconds, then answer without it | Rejected | Still spends the step's hook budget, and the other work in the step shares the same 10 seconds |
| Clear the status line on every Claude main-loop step | Rejected | Repeats a call on every Claude step even when nmg-router never set a status |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #26 | 2026-10-27 | Initial defect design |
| #26 | 2026-10-27 | Routed steps no longer wait for a running summary (hook budget); replaces spec #4's wait rule |
