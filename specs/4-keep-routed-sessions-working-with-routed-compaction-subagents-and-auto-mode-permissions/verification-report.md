# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 18ba375d-2a4d-434c-9c7f-831c62d550e8)
**Scope**: Re-verification of the H1 fix (`7cec36a`) against the amended spec
**Verification head**: 7cec36a1453012182fdbb1a77494ded05bd4bb44

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 7 (1 High, 3 Medium, 3 Low)

`7cec36a` offers `SubagentHandback` to every routed subagent step by its agent id. The registered gate was fully green at this head: typecheck, `npm test` and `claude plugin validate .` all passed. The live herdr run on Claude Code v2.1.311 shows the routed subagent is now offered `SubagentHandback` (`handback=true`), and it calls the tool.

AC3 still **fails live**. In auto mode, the handback reaches `tool.check`, and nmg-router answers it with a plugin `allow`, from either the Claude classifier or the person. The host refuses every one of these: *"Only the auto-mode classifier can allow SubagentHandback: an allow of type 'hook' is not the classifier's verdict"*. The report never reaches the caller. The subagent loops through the host's `handback-send-enforce` nudges, and the person also gets an nmg-router question for an internal handback. Outside auto mode, the host has no `SubagentHandback` in the subagent loop, so the offered tool fails with "No such tool available". The caller then gets the subagent's plain final text.

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

`sdlc-verify-steering.mjs --base main --controller-run-id 18ba375d-2a4d-434c-9c7f-831c62d550e8` wrote `.nmg-sdlc/verification/4.json` with `ok: true` and `ceiling: null`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `7cec36a1…`, steering `sha256:75b22afe…`, spec `sha256:13340e31…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test` exited 0 (see M2: after the verify session started, one schema-registry test fails) |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` exited 0 |

There is no deterministic ceiling. The overall Fail comes from the interactive verification that the project's verification steering requires.

---

## Acceptance Criteria Verification

`7cec36a` changes only `src/tools/offered-tools.ts`, `src/tools/supplement-schemas.ts`, a one-line call in `src/routing/router.ts`, the regenerated `builtin-schemas.ts`, and tests. The compaction, mode and permission code paths are the same as at `da53ffe`, where AC1, AC2 and AC4–AC8 passed live. This run re-exercised AC3 only, since the result is Fail either way.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Routed compaction | Pass (carried) | `src/compaction/compact-hook.ts`; live at `da53ffe`. The code is unchanged since |
| AC2 | Context window and in-place summary | Pass (carried) | `src/compaction/auto-trigger.ts`, `routed-view.ts`; live at `da53ffe`. The code is unchanged since |
| AC3 | Subagents by their own model | **Fail** | `offeredToolNames` now adds `SubagentHandback` on `e.agentId` (`src/tools/offered-tools.ts:42-51`). Live: the fake provider saw `handback=true … toolNames=…\|SubagentHandback`, and the routed subagent called it. In auto mode, the host refused each plugin allow (`Only the auto-mode classifier can allow SubagentHandback: an allow of type 'hook' is not the classifier's verdict`, 8 of 8 calls), and the caller got no report (`agent_completion … turns=8 finalStopReason=end_turn`). In manual mode the tool doesn't exist in the subagent loop (`No such tool available: SubagentHandback`), and the caller got the plain final text. The Claude-subagent pass-through and the unchanged status line were confirmed at `da53ffe`. See H1 and M1 |
| AC4 | Auto-mode permission setting | Pass (carried) | `src/permissions/mode.ts`. This run: the module loaded with the row unset (`hooks module nmg-router@inline loaded`), and the routed calls used the Claude classifier (`Claude classifier verdict for a routed call`) |
| AC5 | Claude classifier mode | Pass (carried) | `src/permissions/policy.ts`. This run: the classifier left the first `SubagentHandback` undecided, so the call was put to the person, as specified |
| AC6 | Person decides routed calls | Pass (carried) | This run: the dialog read "nmg-router │ fakelocal/fake-small wants to run SubagentHandback: {…}. Allow it?", and Allow gave `allow by plugin nmg-router: … the person allowed this routed call`. The host then rejected that allow for this one tool (H1) |
| AC7 | Rules and Claude steps unchanged | Pass (carried) | `src/permissions/tool-check.ts`; live at `da53ffe`. The code is unchanged since |
| AC8 | In-place summary failure and later compaction | Pass (carried) | Live at `da53ffe`. The code is unchanged since |

---

## Task Verification

| Task | Status | Notes |
|------|--------|-------|
| T001–T005 | Complete | Unchanged since `da53ffe` |
| T006 | Partial | Fakes now follow the host listing (no `SubagentHandback`). They still don't model the host rejecting a hook allow for `SubagentHandback` in auto mode, or the tool being absent outside auto mode (M3) |
| T007–T009 | Complete | — |
| T010 | **Incomplete** | `SubagentHandback` is offered, but the report doesn't reach the caller in auto mode (H1). Outside auto mode it is offered when the host doesn't have it (M1) |
| T011 | Complete | `src/permissions/person-approval.ts` |
| T012 | Partial | The handback probe still fails |
| T013 | Complete | Tests exist and pass at the gate. The AC3 tests pass against a host contract that differs from 2.1.311 |

---

## Architecture Assessment

| Area | Score | Key findings |
|------|-------|--------------|
| SOLID | 4 | One concern per module. `SUPPLEMENT_TOOL_DESCRIPTIONS` sits beside the supplement schemas. `offeredToolNames` lost its unused `listed` parameter |
| Security | 4 | Nothing new reaches Anthropic. The `SubagentHandback` dialog shows the full report as tool input, which is data and is fine. The classifier text still embeds raw tool input (an out-of-scope follow-up) |
| Performance | 4 | No new cost. The failed-handback loop costs eight routed requests and seven Claude classifications per subagent run (H1) |
| Testability | 3 | The AC3 fake still diverges from the live host (M3). The byte-for-byte schema test depends on gitignored declarations the host rewrites at session start (M2) |
| Error handling | 3 | A refused handback is answered `allow` again on every retry, with no recognition that the host will never accept it. Outside auto mode, an unavailable tool is offered (M1) |

---

## Test Results

- `npm run typecheck`: pass (registered gate)
- `npm test`: pass (registered gate, before the verify session). A rerun after `claude --plugin-dir .` started: 438 passed and 1 failed (`tests/tools/builtin-schemas.test.ts` "matches a fresh regeneration … byte for byte"), because the host rewrote `.claude-plugin/types/claude-code-tools/index.d.ts` at 17:16:47 with an extra `Artifact.edits` parameter (M2)
- `claude plugin validate .`: pass
- BDD: SCN001–SCN008 map to Vitest suites and pass at unit level. SCN003 fails live

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Host** | Claude Code v2.1.311 (Claude Max login) |
| **Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir . --model haiku --permission-mode auto\|default --agents <json> --debug-file <log>` |
| **Provider** | Local scripted fake OpenAI-compatible HTTPS server (`fakelocal/fake-small`, no credentials). It calls `SubagentHandback` whenever that tool is offered |
| **Subagents** | `routed-helper` on `fakelocal/fake-small`, and `claude-helper` on `haiku` |
| **Dialogs** | No folder-trust or load errors; `hooks module nmg-router@inline loaded` |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | (harness) First start, without the curl CA bundle | The fake's TLS was untrusted (`curl ended (60)`). This was a harness error, so the run was restarted with `CURL_CA_BUNDLE` set. It isn't a finding | `$.process.spawn (nmg-router): curl ended (60)` |
| 2 | Auto mode, Haiku main: "Use the Agent tool with subagent_type routed-helper to ask it to say hi. Then repeat its report to me verbatim." | `SubagentHandback` was offered and called. The classifier left the first call undecided, so an nmg-router question appeared | `fakelocal/fake-small … toolNames=Agent\|Bash\|ListAgents\|ToolSearch\|SubagentHandback` / `☐ nmg-router │ fakelocal/fake-small wants to run SubagentHandback: {"message":"FAKE-HANDBACK-REPORT: …"}. Allow it? ❯ 1. Allow 2. Deny` |
| 3 | Allow | The host refused the plugin allow, and the later classifier allows were refused too. No report reached the caller | `tool.check SubagentHandback …: ask -> allow by plugin nmg-router: … the person allowed this routed call` → tool result `Only the auto-mode classifier can allow SubagentHandback: an allow of type 'hook' is not the classifier's verdict`; `[handback-send-enforce] Your report has not been delivered.`; main: "The routed-helper agent finished again without delivering a report" |
| 4 | Manual mode, same prompt | The host has no `SubagentHandback` in the loop, so the offered call fails. The plain final text was delivered instead | tool result `<tool_use_error>Error: No such tool available: SubagentHandback</tool_use_error>`; main: "The routed-helper agent reported back: FAKE-SUB done after handback" |

The tab was closed, the fake server was stopped, and the user's default `model` setting is unchanged (`opus`).

---

## Fixes Applied

None. The verify publication scope allows writes only to this report. During this run, a `--help` probe of `scripts/gen-tool-schemas.mjs` regenerated `src/tools/builtin-schemas.ts`. That change was reverted with `git checkout`, and the tree is clean at `7cec36a`.

## Remaining Issues

| ID | Severity | Category | Location | Issue | Reason not fixed |
|----|----------|----------|----------|-------|------------------|
| H1 | High | Correctness | `src/permissions/tool-check.ts`, `src/permissions/policy.ts`, `src/permissions/person-approval.ts` | In auto mode, a routed subagent's `SubagentHandback` is routed through the mod's policy and answered with a plugin `allow`. Claude Code 2.1.311 accepts only the auto-mode classifier's own verdict for this tool, so every handback is refused and the report never reaches the caller (AC3, FR8). The person also gets an nmg-router question for an internal call. Diagnose with a live probe of what the host does for a routed `SubagentHandback` when `tool.check` returns `next(e)` unchanged. Decide whether `SubagentHandback` must bypass the routed-call policy, and whether the server classifier then answers it | Outside verify scope; implementation change |
| M1 | Medium | Correctness | `src/tools/offered-tools.ts:42-51` | `SubagentHandback` is offered on `e.agentId` alone, but outside auto mode the host has no such tool in the subagent loop. Each routed subagent run then makes one failing call ("No such tool available") before its plain text is delivered. In auto mode, the subagent transcript carries the host's "Your final report is delivered through SubagentHandback" reminder. A host-sourced signal like that could gate the offer | Outside verify scope |
| M2 | Medium | Testability | `tests/tools/builtin-schemas.test.ts`, `.claude-plugin/types/claude-code-tools/index.d.ts` | The byte-for-byte registry test compares the committed `builtin-schemas.ts` with the gitignored declarations, which the host rewrites on every `claude --plugin-dir .` start using account- or session-gated tool parameters. After the verify session started, `npm test` failed 1 of 439 (`Artifact.edits`). The registered gate passed only because it ran first | Outside verify scope |
| M3 | Medium | Testability | `tests/support/fake-turn.ts`, `tests/routing/subagents.test.ts`, `tests/permissions/tool-check.test.ts` | The fakes deliver a handback whenever it is called. They don't model the host's refusal of a hook allow for `SubagentHandback` in auto mode, or the tool's absence outside auto mode, so the AC3 suite passes while the feature fails live | Outside verify scope |
| L1 | Low | Error handling | `src/compaction/auto-trigger.ts:53` | Carried: the in-place summary has no deadline of its own | Outside verify scope |
| L2 | Low | UX | status line | Carried: the routed status line stays after a `/model` switch to Claude (#3 behavior) | Outside verify scope |
| L3 | Low | Spec drift | `design.md` § offered tools item 3, `tasks.md` T010 | The spec still says `SubagentHandback` is offered "when the host's tool listing names it", but `7cec36a` offers it on the agent id alone. A routed subagent's requests also carry the latest main-loop render for its model, not its own definition prompt (`sysHelper=false`). This matches the design's per-model capture, but the subagent never sees its definition prompt. Amend the spec with the H1 fix | Spec files are read-only in verify scope |

## Recommendation

**Needs fixes.** Return to implementation for H1 and M1, with host-faithful fakes (M3), and make the schema test independent of the host's per-session declarations (M2). Then rerun the full registered gate and the herdr procedure. In auto mode and in manual mode, a Claude main loop's routed subagent must deliver its `SubagentHandback` report to the caller without an nmg-router question.
