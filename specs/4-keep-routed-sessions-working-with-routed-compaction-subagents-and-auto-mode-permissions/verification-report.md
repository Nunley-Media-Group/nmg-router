# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 18ba375d-2a4d-434c-9c7f-831c62d550e8)
**Scope**: Re-verification of the M1 fix (`3e27045`) against the amended spec
**Verification head**: 3e270450f773e1ad755f741a33294a5e93e4e1ab

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.2 |

### Implementation Status: Pass
**Total Issues**: 4 (0 High, 0 Medium, 4 Low)

`3e27045` fixes M1. `hostOffersHandback` now matches only the host's own reminder sentence, `Your final report is delivered through SubagentHandback`. A user text that merely names the tool no longer counts. In the live herdr run in manual mode, this repository's gitStatus commit subjects still named `SubagentHandback` in the routed subagent's first message. The provider request carried `handback=false`, and the subagent's plain report reached the caller. In auto mode the host's reminder was present, `SubagentHandback` was offered, and the call was delivered (`outcome=ok`). A routed subagent's Bash call was still decided by the Claude classifier (AC5). The registered gate is green: typecheck, 448/448 tests, and `claude plugin validate .`.

---

## Issue Scope

- Active issue: #4
- Spec: `specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC8]; FR [FR1–FR8]; tasks [T001–T013]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":4,"specPath":"specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 18ba375d-2a4d-434c-9c7f-831c62d550e8` wrote `.nmg-sdlc/verification/4.json` with `ok: true` and `ceiling: null`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `3e270450…`, steering `sha256:75b22afe…`, spec `sha256:13340e31…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test` exited 0: 57 files, 448 tests |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` exited 0. Warnings only: no author, no icon, CLAUDE.md at the plugin root |

---

## Acceptance Criteria Verification

`3e27045` changes only `src/tools/offered-tools.ts` (`HANDBACK_REMINDER` and `hostOffersHandback`) and its test. The compaction, mode and permission code is the same as at `29c2963`. At `29c2963` and `da53ffe`, AC1, AC2, AC4, AC6, AC7 and AC8 passed live. This run re-exercised AC3 in both permission modes, AC4's module load and AC5's routed `tool.check` path.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Routed compaction | Pass (carried) | `src/compaction/compact-hook.ts`; live at `da53ffe`. Code unchanged since. Unit: `tests/compaction/compact-hook.test.ts` (14) |
| AC2 | Context window and in-place summary | Pass (carried) | `src/compaction/auto-trigger.ts`, `routed-view.ts`, `threshold.ts`; live at `da53ffe`. Code unchanged since. Unit: `auto-trigger.test.ts` (14), `routed-view.test.ts` (6) |
| AC3 | Subagents by their own model | Pass | Manual mode: gitStatus named the tool, but the request had `handback=false`, and the plain report `FAKE-REPLY msgs=1 viewed=false` reached the caller. Auto mode: the host's reminder sentence was present, and the request had `handback=true`. The host logged `tool_dispatch_end tool=SubagentHandback … outcome=ok`. Claude subagent: passed through (`CLAUDE-SUB: Hi there, …`), and the fake got no request. The status line stayed `Haiku`. Unit: `tests/tools/offered-tools.test.ts` adds the false-positive case, and `tests/routing/subagents.test.ts` (7) passes |
| AC4 | Auto-mode permission setting | Pass | `src/permissions/mode.ts`. Live: `hooks module nmg-router@inline loaded … tool.check …` with the row unset (`every option is its default`). Unit: `tests/permissions/mode.test.ts` (11) |
| AC5 | Claude classifier mode | Pass | Live: `tool.check Bash call_1793054502320: ask -> allow by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call`, then the Bash call ran (`outcome=ok`) |
| AC6 | Person decides routed calls | Pass (carried) | `src/permissions/person-approval.ts`, unchanged since a live pass at `7cec36a`. Unit: `person-approval.test.ts` (10) |
| AC7 | Rules and Claude steps unchanged | Pass (carried) | `src/permissions/tool-check.ts`, unchanged since a live pass at `29c2963`. Unit: `tool-check.test.ts` (25) |
| AC8 | In-place summary failure and later compaction | Pass (carried) | Live at `da53ffe`. Code unchanged since. Unit: `auto-trigger.test.ts`, `compact-hook.test.ts` |

---

## Task Verification

| Task | Status | Notes |
|------|--------|-------|
| T001–T009 | Complete | Unchanged since `29c2963` |
| T010 | Complete | The offer now keys on the host's reminder sentence, so gitStatus or a delegation prompt that names the tool does not trigger it |
| T011–T012 | Complete | — |
| T013 | Complete | Adds a test where user context names the tool without the reminder (`offered-tools.test.ts`) |

---

## Architecture Assessment

| Area | Score | Key findings |
|------|-------|--------------|
| SOLID | 4 | `hostOffersHandback` is a pure function next to `offeredToolNames`, and the reminder sentence is one named constant. `router.ts` is still the largest module (+286 lines) |
| Security | 4 | No routed step reaches Anthropic. Credentials are never read; only the presence of the login handle is checked. The classifier text still embeds raw tool input (an out-of-scope follow-up) |
| Performance | 4 | One provider request per handback. Manual mode no longer pays a failing tool round trip |
| Testability | 4 | Pure detection, with positive and false-positive tests. The fakes model the host's handback refusal |
| Error handling | 4 | Compaction failures answer `{ skip }` with the provider named. The in-place summary has no deadline of its own (L1) |

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: pass, 448/448
- `claude plugin validate .`: pass, with warnings
- BDD: SCN001–SCN008 map to Vitest suites and pass. SCN003 also passes live in both modes

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Host** | Claude Code v2.1.311 (first-party login; the account is not recorded) |
| **Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir . --model haiku --permission-mode default\|auto --agents <json> --debug-file <log>` |
| **Provider** | Local scripted fake OpenAI-compatible HTTPS server (`fakelocal/fake-small`, no credentials). It runs Bash on a `RUNBASH:` message, and otherwise calls `SubagentHandback` when that tool is offered. It logs any user text that names the tool |
| **Subagents** | `routed-helper` on `fakelocal/fake-small`, and `claude-helper` on `haiku` |
| **Dialogs** | No folder-trust prompt and no load errors. The `obsidian` MCP server failed to connect, which is unrelated |

| # | Mode | Prompt | Observed | Excerpt |
|---|------|--------|----------|---------|
| 1 | manual | "Use the Agent tool with subagent_type routed-helper to ask it to say hi. Then repeat its report to me verbatim." | `SubagentHandback` was not offered, even though gitStatus named it. The plain report reached the caller | fake: `handback=false … toolNames=Agent\|Bash\|ListAgents\|ToolSearch`; `HB-MENTION role=user ctx="…29c2963 fix: leave routed SubagentHandback…"`; main: `FAKE-REPLY msgs=1 viewed=false` |
| 2 | manual | Same, with `claude-helper` | Passed through to Claude, and the fake got 0 new requests | `CLAUDE-SUB: Hi there, how can I help you today?` |
| 3 | auto | Same as #1 | The host reminder was present, the tool was offered, and the handback was delivered | `HB-MENTION … "Your final report is delivered through SubagentHandback: …"`; `Auto mode classifier gave no verdict for SubagentHandback (unavailable); delivering flagged`; `tool_dispatch_end tool=SubagentHandback … outcome=ok` |
| 4 | auto | routed-helper with the prompt `RUNBASH: echo AC5-SUB-OK` | The Claude classifier decided the routed Bash call, then the handback was delivered | `tool.check Bash call_1793054502320: ask -> allow by plugin nmg-router: … Claude classifier verdict for a routed call`; `tool_dispatch_end tool=Bash … outcome=ok` |

Both sessions were exited, the tab was closed, the fake server was stopped (no listener on 18765), the tree is clean, and the user's default `model` setting is unchanged (`opus`). The `fakelocal` entry in the user's nmg-router `config.json` was there before this run and was left in place.

---

## Fixes Applied

None. The verify publication scope allows writes only to this report.

## Remaining Issues

| ID | Severity | Category | Location | Issue | Reason not fixed |
|----|----------|----------|----------|-------|------------------|
| L1 | Low | Error handling | `src/compaction/auto-trigger.ts` | Carried: the in-place summary has no deadline of its own | Outside verify scope |
| L2 | Low | UX | status line | Carried: the routed status line stays after a `/model` switch to Claude (#3 behavior) | Outside verify scope |
| L3 | Low | Spec drift | `design.md:140` | Carried: the design says `SubagentHandback` is offered "when the host's tool listing names it". The implementation reads the host's reminder sentence, and in auto mode it leaves the handback to the host classifier | Spec files are read-only in verify scope |
| L4 | Low | Host behavior | host auto-mode classifier | In auto mode the host delivers a routed handback "flagged" because its server classifier has no verdict. In runs #3 and #4 the Haiku main loop received the report but called it unverified. The mod can't clear the flag, because the host refuses a hook `allow` for `SubagentHandback` (design H2) | Host-side; no mod change available |

## Recommendation

**Ready.** All eight ACs pass, the registered gate is green at `3e27045`, and the live run confirms the M1 fix in both permission modes. L3 is a wording fix for a later spec amendment.
