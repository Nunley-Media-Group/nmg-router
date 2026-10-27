# Verification Report: Bound the routed in-place summary and clear the routed status line on Claude steps

**Date**: 2026-10-27
**Issue**: #26
**Reviewer**: Claude Code (nmg-sdlc verify worker, run eb5d1c5b-6ab0-410a-912b-f3b334d86785)
**Scope**: Defect fix, including the AC6/FR4 amendment (`c16bab9`, `1584c64`)
**Verification head**: 1584c649251ffc2db02cedd48dba680b9fcd54bd

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| SOLID Principles | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 1 informational

The in-place summary now races its provider call against a 120-second deadline (`SUMMARY_TIMEOUT_MS`) and aborts the request through its `AbortController` when the deadline fires. A routed main-loop step no longer awaits a pending summary, so it cannot use up the 10-second `turn.step` budget. A Claude main-loop step clears a status line that a routed main-loop step set. In the live herdr session, a step sent while the summary hung answered in about 1 s. The stalled summary's connection was closed exactly 120.0 s after the request, and one `timed_out` line was logged. The next turn end retried the summary and kept it. A Claude turn after `/model haiku` removed the `⚠ nmg-router:` line, and switching back to the routed model brought it back. The registered gate is green: typecheck, 550/550 tests, and `claude plugin validate .`.

<!-- nmg-sdlc-issue-scope: {"issueNumber":26,"specPath":"specs/26-bound-the-routed-in-place-summary-and-clear-the-routed-status-line-on-claude-steps","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Issue Scope

- Active issue: #26
- Spec: `specs/26-bound-the-routed-in-place-summary-and-clear-the-routed-status-line-on-claude-steps`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC1–AC6; FR1–FR4; T001–T006; SCN001–SCN006
- Regression: none declared

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id eb5d1c5b-6ab0-410a-912b-f3b334d86785` wrote `.nmg-sdlc/verification/26.json` with `ok: true` and `ceiling: null`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `1584c649…`, steering `sha256:75b22afe…`, spec `sha256:b8943a7b…`, tree clean.

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `npm run typecheck` exited 0 (`tsc --noEmit`) |
| `repository.tests` | yes | passed | `npm test` exited 0: 65 files, 550 tests passed |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .`: `✔ Validation passed with warnings` (only the existing `ICON_MISSING` directory warning) |

**Gate Summary**: 3/3 passed, 0 failed, 0 incomplete

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A stalled summary times out | Pass | `src/compaction/auto-trigger.ts` `summarizeInPlace`: `deps.after(SUMMARY_TIMEOUT_MS, () => controller.abort())`, then `Promise.race` against `expired`. Live: the summary request was sent at `15:59:51.840Z`, and the fake logged `SUMMARY-HANG connection closed by client` at `16:01:51.855Z`. The transcript showed `nmg-router: Fake Local could not summarize this conversation (timed_out); it will be retried at the next turn end.`, logged once. The next routed step answered without waiting (`MARK-3 … FAKE-REPLY msgs=5 viewed=false`). Unit: the curl-child deadline test (`child:killed`) and the "never settles" / partial-text / throw cases in `tests/compaction/auto-trigger.test.ts` |
| AC2 | A timed-out summary retries | Pass | Live: after the timeout, the `MARK-3` turn end sent a new summary request (`16:02:03.504Z summary=true`). Unit: "sends a second summary at the next turn end after a timed-out one, and keeps its reply" |
| AC3 | A summary within the deadline is unaffected | Pass | Live: the retried summary was kept. The next step was sent under the view (`MARK-4 … msgs=1 viewed=true`), and no further timeout line was logged (`timed_out` count 1 in the debug log). Unit: "keeps a summary that returns before the deadline, and logs no timeout line" |
| AC4 | Claude steps clear the routed status line | Pass | `src/routing/router.ts` `claudeStep`; `src/routing/turn-step.ts` calls it on the Claude branch of `routeStep` and `routeStepFailed`. Live: after `/model haiku`, the line `⚠ nmg-router: fakelocal/fake-small · thinking unsupported` was still shown until the Claude turn ran (`⏺ CLAUDE-TURN-OK`, 0 new fake requests). After that turn the line was gone. Unit: the three clearing tests in `tests/routing/switching.test.ts` |
| AC5 | Routed and subagent status behavior is preserved | Pass | Live: after `/model fakelocal/fake-small`, the routed turn `MARK-5` brought back `⚠ nmg-router: fakelocal/fake-small …`. An `Explore` subagent ran on the routed model (`handback=true`, `agent_completion agentType=Explore exitPath=completed`), and the status line stayed the same. The Claude-subagent case is covered by unit tests only: "leaves the routed status line as it is for a Claude subagent step after a routed main-loop step" (`tests/routing/subagents.test.ts`) and "records no status call … when no routed step set the line" |
| AC6 | A routed step does not wait for a running summary | Pass | `settled()` and its call were removed from `router.ts`. Live: while the summary hung, `MARK-2 during summary` answered in about 1 s (`elapsed=1s`, `FAKE-REPLY msgs=3 viewed=false`), with no `internal` error and no second summary request. Unit: "answers at once while a summary is still running, with the view as it is" and "sends a summary that finishes during a step from the next routed main-loop step" (`tests/compaction/routed-view.test.ts`) |

## Implementation Tasks

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Complete | `SUMMARY_TIMEOUT_MS = 120_000` is exported. One `deps.after` call per request, and the abort signal is passed to `complete`. The race settles without `complete`. Partial text and post-abort errors map to `timed_out` |
| T002 | Complete | `Router.claudeStep`, the `statusShown` flag, and calls on both Claude branches before `next(e)` |
| T003 | Complete | `describe("the summary deadline")` in `auto-trigger.test.ts` |
| T004 | Complete | `describe("the routed status line on Claude steps")` in `switching.test.ts`, plus the subagent case in `subagents.test.ts` |
| T005 | Complete | `settled()` removed. `createAutoTrigger` still checks `view.pending(MAIN_LOOP)`, and its comment was updated |
| T006 | Complete | The routed-view tests replace the old "waits for a pending summary" test. The deadline test sends a step before the timer fires |

## Architecture Review

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | Deadline logic stays in `summarizeInPlace`. Status ownership stays in the router behind one new `claudeStep` method. `turn-step.ts` stays a thin dispatcher |
| Security | 5 | No credential handling changed. The abort ends the curl child, and nothing is interpolated into commands |
| Performance | 5 | Removing the wait means a routed step never blocks on a summary. One timer per summary |
| Testability | 5 | The deadline uses the injected `deps.after` clock, so tests fire it on demand. The tests cover a scripted curl child and a `complete` that never settles |
| Error Handling | 5 | Every post-deadline outcome (resolve, reject, hang) goes through the single `notSummarized("timed_out")` path. The view and tracker are left unchanged |

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Host** | Claude Code v2.1.311 (first-party login; the account is not recorded) |
| **Method** | `herdr tab create --cwd <repo> --label verify-26 --no-focus`; `herdr agent start verify-26 --kind claude --pane <pane> -- --plugin-dir . --model fakelocal/fake-small --debug-file <log>` |
| **Provider** | Local scripted fake OpenAI-compatible HTTPS server (`fakelocal/fake-small`, 20k window, no credentials). It reports 5000 prompt tokens, so every turn end passes the 3616-token threshold. A `MODE` file switches summaries between `hang` (headers sent, then nothing) and `ok` |
| **Dialogs** | No folder-trust prompt, and the plugin loaded with `Errors: 0`. The two model-switch confirmations were planned. Marketplace refresh warnings and the `obsidian` MCP failure are unrelated |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | `MARK-1 hello` (MODE=hang) | Answered. The turn end started a summary, which hung | `FAKE-REPLY msgs=1 viewed=false`; `summary=true … SUMMARY-HANG headers sent, body withheld` |
| 2 | `MARK-2 during summary` | Answered in about 1 s with the view as it was. No error, and no second summary | `elapsed=1s`; `FAKE-REPLY msgs=3 viewed=false` |
| 3 | (wait) | The deadline fired at 120.0 s | `16:01:51.855Z SUMMARY-HANG connection closed by client`; `⏺ nmg-router: Fake Local could not summarize this conversation (timed_out); it will be retried at the next turn end.` |
| 4 | `MARK-3 after timeout` (MODE=ok) | Answered. The turn end retried the summary | `FAKE-REPLY msgs=5 viewed=false`; `16:02:03.504Z … summary=true` |
| 5 | `MARK-4 after summary` | Sent under the new summary | `FAKE-REPLY msgs=1 viewed=true` |
| 6 | `/model haiku`, then "Reply with exactly the word CLAUDE-TURN-OK…" | The routed line was cleared by the Claude turn. The fake got 0 requests | before: `⚠ nmg-router: fakelocal/fake-small · thinking unsupported` / `🧠 model: Haiku`; after: `⏺ CLAUDE-TURN-OK`, with no `nmg-router` status line |
| 7 | `/model fakelocal/fake-small`, then `MARK-5 back on routed` | The routed status line came back | `⚠ nmg-router: fakelocal/fake-small …` |
| 8 | `RUNAGENT: Explore Reply with exactly SUBAGENT-OK…` | A routed subagent ran and handed back. The status line was unchanged | `agent_completion … agentType=Explore exitPath=completed`; `⚠ nmg-router: fakelocal/fake-small …` |

The session was exited, the tab was closed, and the fake server was stopped (no listener on 18765). The tree is clean. The `/model` switches persisted the user's default `model` setting. The last switch left it as `fakelocal/fake-small`, so it was restored to its previously recorded value, `opus`. The `fakelocal` entry in the user's nmg-router `config.json` was there before this run and was left in place.

## Test Coverage

- BDD scenarios: 6/6 acceptance criteria covered by Vitest regression tests mapped to SCN001–SCN006
- Test execution: Pass (550/550)

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Info | performance | `src/compaction/auto-trigger.ts:63` | The deadline timer is not cancelled when a summary returns early. Its later `abort()` has no effect on a finished request | `TriggerDeps.after` has no cancel handle. The effect is harmless and outside the spec |

## Recommendation

Ready for PR.
