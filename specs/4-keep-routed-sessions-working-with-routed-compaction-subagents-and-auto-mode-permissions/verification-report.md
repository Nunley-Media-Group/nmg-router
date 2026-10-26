# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 18ba375d-2a4d-434c-9c7f-831c62d550e8)
**Scope**: Implementation verification against the amended spec
**Verification head**: d1edb7ec361f4b91330e814d62677dffe8589780

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 3 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.3 |

### Implementation Status: Fail
**Total Issues**: 5 (4 High, 1 Medium)

`d1edb7e` amended the spec after the live run at `2efb704`. It added AC8, FR7, FR8 and tasks T009–T013 to fix H1 (a mod-started compaction goes to Anthropic), H2 (routed subagents can't call `SubagentHandback`) and H3 (a hook `ask` in auto mode is refused by the server classifier). `d1edb7e` changes only spec files. `git diff 2efb704 HEAD -- src hooks tests .claude-plugin` is empty, so none of the amended tasks is implemented:

- `src/compaction/routed-view.ts`, `src/tools/supplement-schemas.ts` and `src/permissions/person-approval.ts` don't exist.
- `src/compaction/auto-trigger.ts:34` still calls `deps.compact()`, which AC2 and FR2 forbid.
- `src/permissions/policy.ts:42,49` still return `ask`, which FR7 forbids.

The registered gate also fails. `repository.tests` exited 1 because `tests/tools/builtin-schemas.test.ts` reports that the committed `src/tools/builtin-schemas.ts` no longer matches a regeneration from the local declarations. The `claude-code-tools` declarations under `.claude-plugin/types/` (regenerated at 15:42 today, still labelled 2.1.310) now declare an `edits` property on the `Artifact` tool, and the committed registry lacks it. #4's diff doesn't cause this drift, but it is a required failure, so the ceiling is Fail.

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

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 18ba375d-2a4d-434c-9c7f-831c62d550e8` wrote `.nmg-sdlc/verification/4.json` with `ok: false` and `ceiling: Fail`. Coverage: declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `d1edb7ec…`, steering `sha256:75b22afe…`, spec `sha256:13340e31…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| repository.tests | builtin.command | yes | **failed** | `npm test`: 1 failed, 396 passed (55 files). `tests/tools/builtin-schemas.test.ts > matches a fresh regeneration from the installed declarations byte for byte`: the regeneration adds `Artifact.edits`, and the committed `src/tools/builtin-schemas.ts` lacks it |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` passed with warnings (no author, root CLAUDE.md, no icon) |

---

## Acceptance Criteria Verification

The implementation source hasn't changed since `2efb704`, so the live herdr evidence in the previous report still describes this code. This run started no new interactive session, because a required local validation failed and the amended tasks have no code to exercise. Re-run the full interactive procedure after T009–T013 land.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Routed compaction | Partial | `src/compaction/compact-hook.ts` handles `/compact` on the provider, with instructions, and `{ skip }` on failure. It was verified live at `2efb704`. The amended trigger list ("another plugin's `$.session.compact()`") needs no new code, but the path where the mod compacts the in-place summary (AC8) is missing |
| AC2 | Context window and in-place summary | **Fail** | `thresholdTokens(128000)` = 108800 (`src/compaction/threshold.ts`, unit). But `src/compaction/auto-trigger.ts:34` calls `deps.compact()`, and there is no `routed-view.ts` and no in-place summary. Live at `2efb704`, this sent the routed transcript to Anthropic (H1) |
| AC3 | Subagents by their own model | **Fail** | Per-agent routing and pass-through work (`src/routing/session-tracker.ts`, `router.ts`; live at `2efb704`). `SubagentHandback` and `ToolSearch`-loaded tools aren't offered: there is no `src/tools/supplement-schemas.ts` and no `tool_reference` handling in `src/tools/offered-tools.ts` (H2) |
| AC4 | Auto-mode permission setting | Pass | `src/permissions/mode.ts`; the free-text row in `.claude-plugin/plugin.json` has no `required`; `tests/permissions/mode.test.ts` and `tests/manifest/user-config.test.ts`. Verified live at `2efb704` |
| AC5 | Claude classifier mode | Partial | An allow or deny from the Claude classifier is the verdict (live at `2efb704`). An undecided label still returns hook `ask` (`policy.ts:42`) instead of going to the person as AC6 requires |
| AC6 | Person decides routed calls | **Fail** | No `src/permissions/person-approval.ts` and no `$.ui.ask` call anywhere in `src/`. `server-classifier-off` returns `ask` (`policy.ts:49`), and the server classifier refuses it (H3, live at `2efb704`) |
| AC7 | Rules and Claude steps unchanged | Pass | `src/permissions/tool-check.ts` returns `next(e)` for rule, core, Claude-model and non-auto calls. Verified live at `2efb704` |
| AC8 | In-place summary failure and later compaction | **Fail** | Not implemented: there is no in-place view to fail, retry or summarize at a later compaction |

---

## Task Verification

| Task | Status | Notes |
|------|--------|-------|
| T001–T002 | Done | Session tracker, router, summary request, prompt and threshold are present |
| T003 (amended) | Not done | `auto-trigger.ts` still starts compaction through `$.session.compact()` |
| T004 (amended) | Partial | Mode and free-text row done; the policies still answer `ask` |
| T005 | Done | `hooks/register.ts` wires `session.compact`, `turn.complete` and `tool.check` |
| T006–T008 (amended) | Not done | No fakes or tests for the amended behavior |
| T009 | Not done | `src/compaction/routed-view.ts` missing |
| T010 | Not done | `src/tools/supplement-schemas.ts` missing |
| T011 | Not done | `src/permissions/person-approval.ts` missing |
| T012 | Not done | Live probes depend on T009–T011 |
| T013 | Not done | `tests/compaction/routed-view.test.ts` and `tests/permissions/person-approval.test.ts` missing |

---

## Architecture Review

The code under review hasn't changed since `2efb704`, so the scores carry over from that review.

| Area | Score | Key findings |
|------|-------|--------------|
| SOLID | 4 | One concern per module, with `register.ts` kept thin. Policies are a strategy selected by mode |
| Security | 3 | Only the presence of the login handle is read (FR6). The routed transcript reaching Anthropic through the auto trigger (H1) breaks the core no-Anthropic rule |
| Performance | 4 | One subprocess per step; the threshold check is cheap |
| Testability | 3 | Pure functions are tested directly, but the fakes don't model `$.session.compact()` skipping the caller's hook, the classifier refusing a hook `ask`, or deferred handback tools |
| Error handling | 4 | `session.compact` and `tool.check` have `.catch`; failures answer `{ skip }` or `deny` with no Claude fallback |

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: **fail**, 396/397 (schema registry drift, below)
- `claude plugin validate .`: pass with warnings
- BDD: `feature.gherkin` SCN001–SCN008; no tests exist for SCN008 or the amended steps of SCN002, SCN003 and SCN006
- Interactive (herdr): not re-run at this head; see Acceptance Criteria Verification

---

## Fixes Applied

None. The verify publication scope allows writes only to this report, and every finding needs implementation changes.

## Remaining Issues

| Severity | Category | Location | Issue | Reason not fixed |
|----------|----------|----------|-------|------------------|
| High | Correctness / security | `src/compaction/auto-trigger.ts:34` | Threshold trigger calls `$.session.compact()`, which skips the mod's hook and sends the routed transcript to Anthropic (H1; AC2, FR2). Needs T009 | Outside verify scope; implementation task |
| High | Correctness | `src/tools/offered-tools.ts` | Routed subagents aren't offered `SubagentHandback` or `ToolSearch`-loaded tools, so their report never reaches the caller (H2; AC3, FR8). Needs T010 | Outside verify scope; implementation task |
| High | Correctness | `src/permissions/policy.ts:42,49` | Undecided and server-off calls return hook `ask`, and the server classifier refuses it in auto mode (H3; AC5, AC6, FR7). Needs T011 | Outside verify scope; implementation task |
| High | Gate | `src/tools/builtin-schemas.ts` | Required `repository.tests` fails: the committed registry lacks `Artifact.edits`, which the regenerated 2.1.310 declarations now carry. Run `npm run types:sync` and `npm run tools:schemas` and commit the result, or pin the declarations source | Outside verify scope; not caused by #4's diff |
| Medium | Tests | `tests/` | No tests for the amended behavior (T006–T008, T013) | Outside verify scope; implementation task |

## Recommendation

Needs implementation. Return to the implement step for T003, T004 and T006–T013, regenerate `src/tools/builtin-schemas.ts`, then rerun the full registered gate and the herdr interactive procedure, covering every AC including the T012 probes.
