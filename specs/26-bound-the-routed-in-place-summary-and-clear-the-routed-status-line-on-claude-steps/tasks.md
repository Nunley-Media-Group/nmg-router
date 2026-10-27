# Tasks: Bound the routed in-place summary and clear the routed status line on Claude steps

**Issue**: #26
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions/

## Implementation Tasks

### T001: Abort the in-place summary at 120 seconds

**File(s)**: `src/compaction/auto-trigger.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `SUMMARY_TIMEOUT_MS` is exported and equals `120000`.
- `summarizeInPlace` schedules `deps.after(SUMMARY_TIMEOUT_MS, …)` once for each summary request. When the timer fires, the signal passed to `deps.complete` aborts.
- `summarizeInPlace` settles when the deadline fires even if `deps.complete` never settles.
- When the deadline has fired, the routed view and tracker are unchanged, and the only transcript line is `<provider> could not summarize this conversation (timed_out); it will be retried at the next turn end.`, whether `complete` resolved with partial text, threw, or never settled.
- A summary that returns before the deadline is kept exactly as before, and no `timed_out` line is logged.

### T002: Clear the routed status line on Claude main-loop steps

**File(s)**: `src/routing/router.ts`, `src/routing/turn-step.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `Router` has `claudeStep(e: TurnStepInput): void`. On a main-loop step, after a routed main-loop step set the status line, it calls `host.ui.status(undefined)` once.
- `routeStep` and `routeStepFailed` call `router.claudeStep(e)` on the Claude branch before `next(e)`, and the Claude step still passes through `next(e)` unchanged.
- Routed main-loop steps still set `statusText(...)` on success and `errorStatusText(...)` on failure. A subagent step, routed or Claude, never calls `host.ui.status`.

### T003: Regression tests for the summary deadline

**File(s)**: `tests/compaction/auto-trigger.test.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The trigger deps helper's `after` runs 0-ms timers on the next macrotask and keeps every other timer for the test to fire.
- AC1: with curl selected and a scripted child that sends `HEAD` and then hangs, a turn end over the threshold records a `120000` timer. Firing it ends the child (`child:killed`), logs exactly `OpenCode Go could not summarize this conversation (timed_out); it will be retried at the next turn end.`, leaves an earlier view entry and the context tokens unchanged, and leaves `h.view.pending(MAIN_LOOP)` undefined. A routed main-loop step through `routeStep` then answers.
- AC1: a `complete` override that never settles still logs the `timed_out` line and clears the pending summary once the deadline fires.
- AC2: after a timed-out summary, the next turn end over the threshold sends a second summary request and keeps its reply in the view.
- AC3: a summary that returns before the deadline fires is kept as `{ summary, model, cut }` with no log line. The existing in-place summary and failure tests still pass.
- Each new test fails on the code before T001.

### T004: Regression tests for the status line

**File(s)**: `tests/routing/switching.test.ts`, `tests/routing/subagents.test.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC4: a routed main-loop step and then a Claude main-loop step through `routeStep` leave `h.engine.recorded.status.at(-1)` as `""`. The same holds when the routed step failed and set the error status.
- AC4: a Claude main-loop step replayed through `routeStepFailed` also clears the line.
- AC5: a Claude step with no routed status before it records no status call. A Claude subagent step (`agentId` set) after a routed main-loop step leaves the routed status unchanged. The existing thinking-status, error-status and subagent status tests still pass.
- The AC4 tests fail on the code before T002.

### T005: Stop waiting for a running summary

**File(s)**: `src/routing/router.ts`, `src/compaction/auto-trigger.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `settled()` and the `await settled(view.pending(MAIN_LOOP), signal)` call are removed. A routed main-loop step never awaits `view.pending(MAIN_LOOP)`.
- `createAutoTrigger` still uses `view.pending(MAIN_LOOP)` to avoid starting a second summary. Its comment no longer says a step waits for the summary.
- `tsc` and the full suite pass.

### T006: Regression tests for steps during a running summary

**File(s)**: `tests/compaction/routed-view.test.ts`, `tests/compaction/auto-trigger.test.ts`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- AC6: the test "waits for a pending summary before it reads the transcript" is replaced. With `h.view.hold(MAIN_LOOP, <promise that never settles>)`, a routed main-loop step through `routeStep` answers and sends the transcript under the current view, with no summary added.
- AC6: when the held summary then calls `view.set` and settles, the next routed main-loop step's request contains the new summary.
- AC1: the auto-trigger deadline test also sends a routed main-loop step while the stalled summary is still pending, before the deadline timer fires, and that step answers.
- Each new AC6 test fails on the code before T005.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #26 | 2026-10-27 | Initial defect tasks |
| #26 | 2026-10-27 | Add T005 and T006: routed steps no longer wait for a running summary |
