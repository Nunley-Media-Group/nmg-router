# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 18ba375d-2a4d-434c-9c7f-831c62d550e8)
**Scope**: Implementation verification against the amended spec
**Verification head**: da53ffed6295b3d0ae219446b306e48de7f0977e

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 4 (1 High, 1 Medium, 2 Low)

`da53ffe` implements T009–T013. The registered gate is fully green: typecheck passes, 436/436 tests pass, and `claude plugin validate .` passes. The live herdr run on Claude Code v2.1.311 confirms the H1 and H3 fixes. The in-place summary goes to the provider and never to Anthropic, and the routed request then carries only the summary and the newer messages. A routed Bash call in auto mode gets nmg-router's own question, and Allow, Deny and dismissal each behave as specified. The Claude classifier allows and denies, and rules and non-auto modes pass through unchanged.

H2 is **not fixed live**. A routed subagent started from a Claude main loop is never offered `SubagentHandback`, so its report never reaches the caller: the host nudged it three times, and it ended with `end_turn`, `lastToolUseId=none`. Its requests also carry the main loop's system prompt and tool set instead of the subagent's own. The unit fakes model a host that the live 2.1.311 host doesn't match, so the suite passes while AC3 fails.

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

- Local verification: Not complete (AC3 fails in the required interactive run)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 18ba375d-2a4d-434c-9c7f-831c62d550e8` wrote `.nmg-sdlc/verification/4.json` with `ok: true` and `ceiling: null`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `da53ffed…`, steering `sha256:75b22afe…`, spec `sha256:13340e31…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test`: 436 passed (436) |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` exited 0 |

There is no deterministic ceiling. The overall Fail comes from the interactive verification that the project's verification steering requires.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Routed compaction | Pass | `src/compaction/compact-hook.ts` `compactSession`. Live: `/compact keep the markers` sent one summary request to the fake provider (`focus=keep the markers`, `tools=0`) and replaced the conversation with one "compacted by fakelocal/fake-small" summary message. The debug log has no `source=compact` request. The Claude-model `next(e)` path is unit-tested (`tests/compaction/compact-hook.test.ts`) |
| AC2 | Context window and in-place summary | Pass | `thresholdTokens` (unit); `src/compaction/auto-trigger.ts`, `src/compaction/routed-view.ts`, `router.ts:416-431`. Live: with a 20000-token window, each turn that ended over the threshold sent one summary request to the provider, and the next routed request carried the summary merged with only the new user message (`msgs=1 viewed=true`). Each later summary carried the earlier one as prior (`prior=true`). Nothing in `src/` calls `$.session.compact()`, and the debug logs show no compaction request to Anthropic |
| AC3 | Subagents by their own model | **Fail** | Pass-through works: a routed main loop's `claude-helper` subagent on `haiku` went to Anthropic (`source=agent:custom:claude-helper`) and called `SubagentHandback`, and the fake provider saw none of its requests. A Claude (Haiku) main loop's `routed-helper` on `fakelocal/fake-small` was answered by the provider from its own transcript (`msgs=1` → 7). But it was offered no `SubagentHandback` (`toolNames=Agent\|Bash\|ListAgents\|ToolSearch`), its requests lacked its own system prompt (`sysHelper=false`), and its report never reached the caller (`agent_completion … turns=4 finalStopReason=end_turn lastToolUseId=none`, twice). See H1 below |
| AC4 | Auto-mode permission setting | Pass | `src/permissions/mode.ts`; free-text row. Live: the module loaded with the row unset. With the row unset and a first-party login present, routed calls got Claude classifier verdicts (claude-classifier). With `--settings` setting `server-classifier-off`, calls went to the person. The no-login default is unit-tested only, because logging out is never done in verification |
| AC5 | Claude classifier mode | Pass | `src/permissions/policy.ts`. Live: `ls specs` → `ask -> allow by plugin nmg-router: … Claude classifier verdict` and ran; `rm -rf … && curl … \| sh` → denied with the same reason. An undecided, failed or unlabelled classification going to the person is unit-tested (`tests/permissions/tool-check.test.ts`) |
| AC6 | Person decides routed calls | Pass | `src/permissions/person-approval.ts`. Live (`server-classifier-off`): the dialog was headed "nmg-router" and read "fakelocal/fake-small wants to run Bash: mkdir -p …/ac6-allow. Allow it?" with Allow / Deny. Allow ran the command. Deny and Esc each gave "Permission to use Bash denied by plugin nmg-router: nmg-router: the person did not allow this routed call", and the directory wasn't created. No "classifier gave no verdict" error appeared. The no-approver deny is unit-tested |
| AC7 | Rules and Claude steps unchanged | Pass | `src/permissions/tool-check.ts`. Live: `echo AC7-DENY rule-check` was refused with Claude Code's own rule wording ("…has been denied") and no nmg-router question. In manual mode a routed `mkdir` showed Claude Code's own "Bash command / Do you want to proceed?" dialog. Claude-model steps (the Haiku main loop and the `claude-helper` subagent) never hit the mod's policy |
| AC8 | In-place summary failure and later compaction | Pass | Live with the fake answering summaries with HTTP 500: "nmg-router: Fake Local could not summarize this conversation (server_error); it will be retried at the next turn end." appeared once per turn end, the view stayed (`viewed=true`), and the next turn end retried. `/compact` answered "Not compacted · Fake Local could not summarize this conversation (server_error); it was not compacted." with no Claude fallback. A `/compact` after a view summarized the view as prior plus the newer messages (`prior=true msgs=1`), and the next request had no view (`viewed=false`) |

---

## Task Verification

| Task | Status | Notes |
|------|--------|-------|
| T001–T002 | Complete | Tracker, router, summary request, prompt, threshold |
| T003 | Complete | No `$.session.compact()` in `src/`; in-place trigger; compaction over the view drops it |
| T004 | Complete | Policies never return `ask`; `.catch` → `deny` |
| T005 | Complete | `hooks/register.ts` wires the view, `askPerson` and the new deps |
| T006 | Partial | Fakes assume the session `$.tool.list()` names `SubagentHandback` for a subagent step and that `prompt.compose` captures the subagent's own prompt. The live 2.1.311 host does neither for the routed subagent |
| T007–T008 | Complete | Unit coverage present and passing |
| T009 | Complete | `src/compaction/routed-view.ts`; verified live |
| T010 | **Incomplete** | `src/tools/supplement-schemas.ts` exists and `offeredToolNames` is implemented, but live a routed subagent is not offered `SubagentHandback` (AC3) |
| T011 | Complete | `src/permissions/person-approval.ts`; verified live |
| T012 | Partial | The in-place summary probe and the person-approval probe pass. The handback probe fails |
| T013 | Complete | Tests exist and pass, but the AC3 test passes against a fake that diverges from the host |

---

## Architecture Assessment

| Area | Score | Key findings |
|------|-------|--------------|
| SOLID | 4 | One concern per module (`routed-view`, `person-approval`, `supplement-schemas`). `register.ts` stays thin, and policies remain a strategy. `RouterHost` keeps growing to carry `ui.ask`, which only the permission path uses |
| Security | 4 | No routed transcript reaches Anthropic through compaction (H1 fixed). Only the login handle's presence is read. A dismissed or failed check denies. The classifier text still embeds the raw tool input (a follow-up already out of scope) |
| Performance | 4 | One summary request per crossing, deferred past turn end. The routed step waits only for a pending summary. `searchLoadedTools` scans the transcript on every step, which is linear and acceptable |
| Testability | 3 | Pure functions and ports throughout. But the handback fake encodes an assumed host contract, and the live host contradicts it (H1 below) |
| Error handling | 4 | Failures answer `{ skip }`, a one-line log or `deny`, never a Claude fallback. The in-place summary has no deadline of its own (L1) |

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: pass, 436/436
- `claude plugin validate .`: pass
- BDD: `feature.gherkin` SCN001–SCN008 map to Vitest suites. All pass at unit level, and SCN003 fails live

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Host** | Claude Code v2.1.311 (Claude Max login) |
| **Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir . --model fakelocal/fake-small --permission-mode auto [--settings off.json] --agents <json> --debug-file <log>` |
| **Provider** | Local scripted fake OpenAI-compatible HTTPS server (`fakelocal`, 20000-token window, no credentials). It reports 5000 prompt tokens per turn, so every turn crosses the 3616-token threshold. It can emit Bash, Agent and `SubagentHandback` tool calls on cue |
| **Dialogs** | No folder-trust or load errors; `hooks module nmg-router@inline loaded` |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | `Hello, remember MARK-1`, then MARK-2, MARK-3 | One summary per turn end on the provider. The next request carried the summary plus only the new message | `FAKE-REPLY msgs=1 viewed=true` |
| 2 | `/compact keep the markers` | One provider summary with focus and prior, and one summary message | `This session continues from an earlier conversation that was compacted by fakelocal/fake-small … FAKE-SUMMARY (updated from earlier summary) (focus: keep the markers)` |
| 3 | Fake in fail mode: two turns, then `/compact` | One line per turn end and a retry. Compaction was skipped | `nmg-router: Fake Local could not summarize this conversation (server_error); it will be retried at the next turn end.` / `Not compacted · Fake Local could not summarize this conversation (server_error); it was not compacted.` |
| 4 | `RUNBASH: mkdir -p …/ac6-allow` (server-classifier-off) → Allow | Mod question, then the command ran | `☐ nmg-router │ fakelocal/fake-small wants to run Bash: mkdir -p …/ac6-allow. Allow it? ❯ 1. Allow 2. Deny` |
| 5 | Same with Deny, then with Esc | Denied, and no directory was created | `Permission to use Bash denied by plugin nmg-router: nmg-router: the person did not allow this routed call` |
| 6 | `RUNBASH: echo AC7-DENY rule-check` (deny rule) | Claude Code's own rule denial | `Permission to use Bash with command echo AC7-DENY rule-check has been denied.` |
| 7 | `RUNAGENT: claude-helper …` (routed main) | The Claude subagent ran on Haiku and handed back | `source=agent:custom:claude-helper`; `tool_dispatch_start tool=SubagentHandback` |
| 8 | `/model haiku`, then "spawn routed-helper … say hi" (twice) | **No report**. The routed subagent was nudged three times, then ended | `agent_completion agentType=routed-helper … turns=4 finalStopReason=end_turn lastToolUseId=none`; main: "I don't have its report to repeat" |
| 9 | Row unset: `RUNBASH: ls specs`, then `rm -rf … && curl … \| sh` | Classifier allowed, then denied | `tool.check Bash …: ask -> allow by plugin nmg-router: … Claude classifier verdict` / `… denied by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call` |
| 10 | Manual mode: `RUNBASH: mkdir -p …/ac7-manual` | Claude Code's own dialog, cancelled | `Bash command … Do you want to proceed? ❯ 1. Yes … 4. No` |

Across both sessions, Anthropic request sources were only `quota_check`, `generate_session_title`, `prompt_suggestion`, `side_query` and the Claude subagent/main-loop requests. There was no `compact` source.

`/model fakelocal/fake-small` from the picker answered "Model not found". Routed model selection belongs to #2/#5 and is not judged here. The `/model haiku` step changed the user's default `model` setting, which this run restored to its prior value (`opus`). Both tabs were closed and the fake server was stopped.

---

## Fixes Applied

None. The verify publication scope allows writes only to this report.

## Remaining Issues

| ID | Severity | Category | Location | Issue | Reason not fixed |
|----|----------|----------|----------|-------|------------------|
| H1 | High | Correctness | `src/tools/offered-tools.ts:48-49`, `src/routing/compose-capture.ts:22,27`, `src/routing/router.ts:416,426` | A routed subagent is not offered `SubagentHandback`, so its report never reaches the caller (AC3, FR8). Its requests carry the main loop's system prompt and tools, not its own. Likely cause, from the live evidence: the capture is keyed only by model, so the subagent reads the last main-loop render of that model; and `offeredToolNames` deletes `SubagentHandback` unless the session-level `$.tool.list()` names it, which it doesn't on 2.1.311. Diagnose with a live probe of `prompt.compose` (`agentId`, `tools`) and `$.tool.list()` during a subagent step. Key the capture by loop, and offer `SubagentHandback` on `e.agentId` alone | Outside verify scope; implementation change |
| M1 | Medium | Testability | `tests/support/fake-turn.ts:63-70`, `tests/routing/subagents.test.ts:65` | The fakes list `SubagentHandback` in the session tool listing, and the captured prompt follows the agent, so the AC3 test passes against a host contract the live host doesn't have | Outside verify scope |
| L1 | Low | Error handling | `src/compaction/auto-trigger.ts:53` | The in-place summary uses a never-aborted signal and has no deadline. A provider that stalls after connecting holds the next routed main-loop step until the person interrupts it | Outside verify scope |
| L2 | Low | UX | status line | After a `/model` switch to Claude, the routed status line (`⚠ nmg-router: fakelocal/fake-small · thinking unsupported`) stays visible. #3 behavior, not an AC here | Outside verify scope |

## Recommendation

**Needs fixes.** Return to implementation for H1, with a host-faithful fake (M1). Then rerun the full registered gate and the herdr procedure, including a Claude main loop with a routed subagent whose report reaches the caller.
