# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 18ba375d-2a4d-434c-9c7f-831c62d550e8)
**Scope**: Re-verification of the H1/M1/M2/M3 fix (`29c2963`) against the amended spec
**Verification head**: 29c296307f37e0bbc7f99d3d5b4caed5e82fadc8

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.8 |

### Implementation Status: Partial
**Total Issues**: 4 (0 High, 1 Medium, 3 Low)

`29c2963` fixes the previous High finding. In auto mode, `tool.check` now hands a routed `SubagentHandback` to core unchanged. The live herdr run on Claude Code v2.1.311 shows a routed subagent's report reaching the Claude main loop in a single provider request, with no nmg-router question. The host logged `Auto mode classifier gave no verdict for SubagentHandback (unavailable); delivering flagged`, so it accepted the handback rather than refusing it. A routed subagent's Bash call still gets the Claude classifier verdict (AC5). M2 is also fixed: `npm test` passes 447/447 after a host session rewrote the gitignored declarations.

The M1 fix doesn't hold live. `hostOffersHandback` treats any top-level user text that contains the string `SubagentHandback` as the host's reminder. A subagent's first user message carries the session's gitStatus context, and in this repository its recent commit subjects name the tool. So in manual mode, the routed subagent was still offered `SubagentHandback`. Its call failed (`Unknown tool unknown_tool`), and the caller got the plain final text. AC3 is therefore Partial: the report reaches the caller in both modes, but the routed subagent is still offered a tool the host doesn't run, contrary to design § offered tools item 3.

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

- Local verification: Not complete (AC3 Partial in the required interactive run)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 18ba375d-2a4d-434c-9c7f-831c62d550e8` wrote `.nmg-sdlc/verification/4.json` with `ok: true` and `ceiling: null`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `29c29630…`, steering `sha256:75b22afe…`, spec `sha256:13340e31…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test` exited 0. A rerun after the host sessions started passed too: 57 files, 447 tests |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` exited 0 |

There is no deterministic ceiling. The Partial comes from the interactive verification that the project's verification steering requires.

---

## Acceptance Criteria Verification

`29c2963` changes `src/permissions/tool-check.ts` (one early return for `SubagentHandback`), `src/tools/offered-tools.ts` (`hostOffersHandback`), and tests. The compaction and mode code is the same as at `da53ffe`, where AC1, AC2, AC4 and AC8 passed live. This run re-exercised AC3, AC5 and AC6/AC7's `tool.check` path, because the change touches them.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Routed compaction | Pass (carried) | `src/compaction/compact-hook.ts`; live at `da53ffe`. The code is unchanged since |
| AC2 | Context window and in-place summary | Pass (carried) | `src/compaction/auto-trigger.ts`, `routed-view.ts`; live at `da53ffe`. The code is unchanged since |
| AC3 | Subagents by their own model | **Partial** | Auto mode: one provider request, `SubagentHandback` called and delivered (`tool_dispatch_end tool=SubagentHandback … outcome=ok`), with no nmg-router question. The caller printed `FAKE-HANDBACK-REPORT: the routed subagent finished`. Claude subagent: passed through (`CLAUDE-SUB: Hi, …`, and the fake provider saw no request). The status line stayed `Haiku`. Manual mode: `SubagentHandback` was still offered (`handback=true`), and the call failed (`Unknown tool unknown_tool: call_1793053914494`). The plain text `FAKE-SUB done after handback` reached the caller. See M1 |
| AC4 | Auto-mode permission setting | Pass | `src/permissions/mode.ts`. Live: `hooks module nmg-router@inline loaded … events: …tool.check…` with the row unset (`every option is its default`) |
| AC5 | Claude classifier mode | Pass | Live: a routed subagent's Bash call got `tool.check Bash call_1793053886035: ask -> allow by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call` |
| AC6 | Person decides routed calls | Pass (carried) | `src/permissions/person-approval.ts`, unchanged; live at `7cec36a`. Live now, `SubagentHandback` is correctly no longer put to the person |
| AC7 | Rules and Claude steps unchanged | Pass | Live: the Claude main loop's own Bash call (`toolu_013Kkt…`) ran on core's verdict, with no nmg-router decision logged. Unit: `tests/permissions/tool-check.test.ts` |
| AC8 | In-place summary failure and later compaction | Pass (carried) | Live at `da53ffe`. The code is unchanged since |

---

## Task Verification

| Task | Status | Notes |
|------|--------|-------|
| T001–T005 | Complete | Unchanged since `da53ffe` |
| T006 | Complete | The fake now models the host refusing a hook allow for `SubagentHandback`, and the tool's absence outside auto mode (`tests/support/fake-turn.ts`) |
| T007–T009 | Complete | — |
| T010 | **Partial** | The offer depends on a substring match that a gitStatus/CLAUDE.md context or a delegation prompt can trigger (M1) |
| T011 | Complete | — |
| T012 | Complete | The handback probe passes in auto mode |
| T013 | Complete | Tests pass. The `hostOffersHandback` tests cover only the exact reminder and assistant/tool-result echoes, not an unrelated user text naming the tool |

---

## Architecture Assessment

| Area | Score | Key findings |
|------|-------|--------------|
| SOLID | 4 | `isRoutedAuto` keeps the handback exception in one place. `hostOffersHandback` is a pure function beside `offeredToolNames` |
| Security | 4 | Nothing reaches Anthropic from a routed step. The host flags the unclassified handback (`delivering flagged`), which is the host's own safety path. The classifier text still embeds raw tool input (an out-of-scope follow-up) |
| Performance | 4 | The auto-mode handback is now one request, not eight. Manual mode costs one extra failing tool round trip whenever M1 triggers |
| Testability | 3 | The fakes follow the host. The detection test doesn't cover a false positive from user context (M1) |
| Error handling | 4 | Manual mode degrades to plain-text delivery after the failed call. The router never retries the absent tool |

---

## Test Results

- `npm run typecheck`: pass (registered gate)
- `npm test`: pass (registered gate). After the host sessions started, a rerun also passed (447/447), so M2 is fixed
- `claude plugin validate .`: pass
- BDD: SCN001–SCN008 map to Vitest suites and pass at unit level. SCN003 is Partial live (manual mode)

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Host** | Claude Code v2.1.311 (first-party login; the account is not recorded) |
| **Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir . --model haiku --permission-mode auto\|default --agents <json> --debug-file <log>` |
| **Provider** | Local scripted fake OpenAI-compatible HTTPS server (`fakelocal/fake-small`, no credentials). It runs a Bash call on a first `RUNBASH:` user message, and otherwise calls `SubagentHandback` whenever that tool is offered. It also logs any user text that names `SubagentHandback` |
| **Subagents** | `routed-helper` on `fakelocal/fake-small`, and `claude-helper` on `haiku` |
| **Dialogs** | No folder-trust or load errors; `hooks module nmg-router@inline loaded` |

| # | Mode | Prompt | Observed | Excerpt |
|---|------|--------|----------|---------|
| 1 | auto | "Use the Agent tool with subagent_type routed-helper to ask it to say hi. Then repeat its report to me verbatim." | One provider request. Handback delivered, no nmg-router question | `Auto mode classifier gave no verdict for SubagentHandback (unavailable); delivering flagged` / main: `▎ FAKE-HANDBACK-REPORT: the routed subagent finished` |
| 2 | auto | Same, with `claude-helper` | Passed through to Claude, and the fake got no request | `▎ CLAUDE-SUB: Hi, I'm ready to help with the nmg-router repo.` |
| 3 | auto | `/model fakelocal/fake-small`, then `RUNBASH: echo AC5-ROUTED-OK` | `/model` reported `Model 'fakelocal/fake-small' not found`, a harness limitation: the fake isn't a picker row. Haiku ran the Bash call on core's verdict (AC7) | `AC5-ROUTED-OK` |
| 4 | auto | routed-helper with the prompt `RUNBASH: echo AC5-SUB-OK` | The routed Bash call was decided by the Claude classifier, then the handback was delivered | `tool.check Bash call_1793053886035: ask -> allow by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call` |
| 5 | manual | routed-helper "say hi" (twice) | `SubagentHandback` was still offered, and the call failed. The plain text was delivered | `handback=true … toolNames=…\|SubagentHandback`; `Unknown tool unknown_tool: call_1793053914494`; main: `▎ FAKE-SUB done after handback` |
| 6 | manual | (fake log) | The user text that matched was gitStatus context, not a host reminder | `HB-MENTION role=user ctx="…Recent commits:\n29c2963 fix: leave routed SubagentHandback to the auto-mode classifier…"` |
| 7 | auto | routed-helper "say hello again" | The real host reminder text in auto mode | `HB-MENTION role=user ctx="…Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>})…"` |

The tab was closed, the fake server was stopped, the tree is clean, and the user's default `model` setting is unchanged (`opus`).

---

## Fixes Applied

None. The verify publication scope allows writes only to this report.

## Remaining Issues

| ID | Severity | Category | Location | Issue | Reason not fixed |
|----|----------|----------|----------|-------|------------------|
| M1 | Medium | Correctness | `src/tools/offered-tools.ts:41-47` (`hostOffersHandback`) | Any top-level user text containing `SubagentHandback` counts as the host's reminder. That includes the gitStatus/CLAUDE.md context the host puts in a subagent's first message, and a delegation prompt that names the tool. Live in manual mode, this repo's commit subjects triggered the match, so a tool the host doesn't run was offered and its call failed. Match the host's own reminder sentence instead, `Your final report is delivered through SubagentHandback`, as observed live (#7). Add a test where user context names the tool without that sentence | Outside verify scope; implementation change |
| L1 | Low | Error handling | `src/compaction/auto-trigger.ts:53` | Carried: the in-place summary has no deadline of its own | Outside verify scope |
| L2 | Low | UX | status line | Carried: the routed status line stays after a `/model` switch to Claude (#3 behavior) | Outside verify scope |
| L3 | Low | Spec drift | `design.md:140`, `tasks.md:110` | The spec says `SubagentHandback` is offered "when the host's tool listing names it", but the host never lists it. The implementation reads the host's reminder instead. Amend the spec to describe the reminder signal, and the classifier-only handling of the handback in auto mode | Spec files are read-only in verify scope |

## Recommendation

**Needs fixes.** Return to implementation for M1: tighten `hostOffersHandback` to the host's reminder sentence and add the false-positive test. Amend the spec for L3. Then rerun the full registered gate and the herdr procedure in manual mode, where a routed subagent must not be offered `SubagentHandback`, and in auto mode, where its report must still be delivered.
