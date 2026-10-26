# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 4eeb0783-7f59-4745-9484-e0602918f909)
**Scope**: Implementation verification against spec
**Verification head**: dd1b256184f69e50dfb38b17e8adad622aca5244

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 3 (1 High, 1 Medium, 1 Low)

The registered gate is complete and green: typecheck, 393 Vitest tests in 54 files, and `claude plugin validate .`. The code for each acceptance criterion matches the design, and the unit tests cover it.

The live session fails. `.claude-plugin/plugin.json` declares `userConfig.routedAutoPermissions` with `"required": true` and no default. Claude Code refuses to load a hooks module when a required field has no value. With the row unset, a fresh `claude --plugin-dir .` session reports:

```text
⏺ nmg-router: hooks module did not load: options do not fit plugin.json userConfig:
  Routed auto-mode permissions is required but not provided (settings.json
  pluginConfigs["nmg-router" or "nmg-router@inline"].options)
```

No hook runs, so routed turns, `/login`, compaction, subagent routing and permissions are all missing from the session. That breaks every AC, and the regression also reaches #2 and #3. AC4's unset-row default also can't happen, because the host won't load the mod while the row is unset. Design and T004 both say the row has no default. Neither one calls for `required`.

**Diagnosis**: a disposable worktree at the same head had only the `"required": true` line removed. A fresh `--plugin-dir .` session there started with no hook or plugin load error. The fix is to drop `"required": true` from `.claude-plugin/plugin.json`. This worker's publication scope covers only this report, so the fix goes back to implementation.

---

## Issue Scope

- Active issue: #4
- Spec: `specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC7]; FR [FR1–FR6]; tasks [T001–T008]; scenarios [SCN001–SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":4,"specPath":"specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 4eeb0783-7f59-4745-9484-e0602918f909` wrote `.nmg-sdlc/verification/4.json`: `ok: true`, `ceiling: null`, coverage `declared 3 / recorded 3 / complete true`, with no missing, duplicate or unknown results. Identity: head `dd1b2561…`, steering `sha256:75b22afe…`, spec `sha256:79a2874b…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test`: 54 files, 393 tests passed |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .`: "Validation passed with warnings" (icon and README install-line advice only) |

The deterministic ceiling is none. The overall status is Fail because of the interactive finding H1.

---

## Acceptance Criteria Verification

"Code" is the static review plus the unit tests. "Live" is the herdr session that the project's interactive verification steering requires.

| AC | Description | Code | Live | Status | Evidence |
|----|-------------|------|------|--------|----------|
| AC1 | Routed compaction | Pass | Fail | Fail | `src/compaction/compact-hook.ts:44` routes summarizing through `router.complete`, returns one summary message and calls `next(e)` for Claude models; `src/compaction/summary-request.ts:35` appends `Additional focus:`. Live: `session.compact` is never registered because the module does not load |
| AC2 | Context window and failure | Pass | Fail | Fail | `src/compaction/threshold.ts:8` gives `thresholdTokens(128000)` = 108800; `src/compaction/auto-trigger.ts:25` schedules `$.session.compact()`; `compact-hook.ts:61` and `compactFailure` answer `{ skip }` naming the provider. Live: module not loaded |
| AC3 | Subagents by their own model | Pass | Fail | Fail | `src/routing/turn-step.ts:18` calls `router.observe` for every step; `router.ts` updates the status line only when `agentId` is undefined; `compact-hook.ts:25` resolves the agent's model through the tracker. Live: module not loaded |
| AC4 | Auto-mode permission setting | Pass | Fail | Fail | `src/permissions/mode.ts:20` (`effectiveMode`) and `createModeReader` read only `authorize()`'s nullness. Live: an unset row stops the load (H1), so the unset default never happens |
| AC5 | Claude classifier mode | Pass | Fail | Fail | `src/permissions/policy.ts:27` uses the label only as a decision and returns `ask` on rejection or a missing label. Live: module not loaded |
| AC6 | Server classifier off mode | Pass | Fail | Fail | `policy.ts:47` returns `ask` with the nmg-router reason. Live: module not loaded |
| AC7 | Rules and Claude steps unchanged | Pass | Fail | Fail | `src/permissions/tool-check.ts:42` returns `next(e)` for non-routed or non-auto calls and passes through verdicts with `rule`, `hook` or `setting` and any non-ask verdict. Live: module not loaded |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Session tracker and router updates | Complete | `src/routing/session-tracker.ts`, `src/routing/router.ts` (`observe`, `complete`, `describe`, shared `send`) |
| T002 | Summary request, prompt and threshold | Complete | `src/compaction/summary-request.ts`, `summary-prompt.ts`, `threshold.ts` |
| T003 | Compaction hook and auto trigger | Complete | `src/compaction/compact-hook.ts`, `auto-trigger.ts` |
| T004 | Permission mode, policies and tool check | Incomplete | The source files match the design. `plugin.json` adds `"required": true`, which T004 does not list (H1) |
| T005 | Hook wiring | Complete | `hooks/register.ts` registers `session.compact`/`.catch`, `turn.complete`, `tool.check`/`.catch` and the three classic observers |
| T006 | Fake engine extensions | Complete | `tests/support/fake-engine.ts`, `fake-turn.ts` |
| T007 | Compaction and subagent tests | Complete | `tests/compaction/*.test.ts`, `tests/routing/subagents.test.ts` |
| T008 | Permission tests | Complete | `tests/permissions/mode.test.ts`, `tool-check.test.ts` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Each new file has one job. `router.ts` grows to 518 lines, but its shared `send` removes the copy that #3 had |
| Open/Closed | 4 | `PermissionPolicy` is a strategy chosen by `policyFor`, so a new mode is a new policy |
| Liskov Substitution | 5 | Both policies honor the same `decide` contract |
| Interface Segregation | 4 | Deps types (`CompactDeps`, `TriggerDeps`, `ToolCheckDeps`, `PolicyHost`, `ModeHost`) take only what each needs. `RouterHost` keeps growing |
| Dependency Inversion | 4 | All `src/` code takes a host port and never `$`. `register.ts` stays a wiring layer |

### Layer Separation

`hooks/register.ts` only wires hooks and spells out host calls literally. Summary building and the threshold are pure functions. The tracker holds no credential.

### Dependency Flow

The compaction and permissions modules depend on `routing/` (tracker, router), and nothing depends back on them. `createRouter` takes the tracker as an optional parameter, which keeps #3's callers working.

---

## Security Assessment

- [x] Authentication: only `authorize()`'s nullness is read, and only once per session (`mode.ts:34`); tests check that the handle reaches no store, log, http or process surface.
- [x] Authorization: rule, hook and setting verdicts are never overridden; a failed check asks the person.
- [x] Input validation: classifier labels are checked against `allow|ask|deny`; anything else gives `ask`.
- [x] Injection prevention: model output and tool input go only into request bodies and classifier text, never into shell commands.
- [x] Data protection: `router.complete` runs through the same Anthropic guard (`checkRequest`, response gate, host check). No Claude fallback.

---

## Performance Assessment

- [x] Async patterns: the auto trigger defers `$.session.compact()` with `$.clock.after(0, …)`, and a `pending` flag keeps it to one compaction at a time.
- [x] Caching: the login presence is memoized; the tool-id set is limited to 1024 entries.
- [x] Resource management: a summary is one request with no tools and no reasoning, and `maxOutput` is capped at 13107.
- [ ] Minor: `readMode` calls `$.config.list()` on every routed auto-mode `ask`. This is acceptable, because it happens only on unsettled routed calls.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Vitest | Yes (unit) / No (live) |
| AC2 | Yes (SCN002) | Vitest | Yes (unit) / No (live) |
| AC3 | Yes (SCN003) | Vitest | Yes (unit) / No (live) |
| AC4 | Yes (SCN004) | Vitest | Yes (unit) / No (live) |
| AC5 | Yes (SCN005) | Vitest | Yes (unit) / No (live) |
| AC6 | Yes (SCN006) | Vitest | Yes (unit) / No (live) |
| AC7 | Yes (SCN007) | Vitest | Yes (unit) / No (live) |

### Coverage Summary

- Feature file: 7 scenarios (`feature.gherkin`), mapped to Vitest suites
- Unit tests: 393 tests in 54 files, all passing
- Gap: no test reads `plugin.json`'s `userConfig` against the host's load rule, so the unit suite passes while the live load fails (M1)

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Skill Exercised** | n/a: a mod's hooks module, driven by the project's herdr interactive procedure |
| **Test Project** | `/Volumes/Fast Brick/source/repos/nmg-router` at `dd1b256` |
| **Exercise Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir .` |
| **Interactive gate handling** | No folder-trust dialog appeared; no other dialogs |

### Scenario 1: Session start with the row unset

- **Prompt sent**: none (startup)
- **Observed**: the hooks module refused to load. Claude Code v2.1.310 started with auto mode on, and none of the mod's hooks were registered.
- **Excerpt** (`herdr agent read verify-4 --source recent-unwrapped`):

  ```text
  ⏺ nmg-router: hooks module did not load: options do not fit plugin.json userConfig:
    Routed auto-mode permissions is required but not provided (settings.json
    pluginConfigs["nmg-router" or "nmg-router@inline"].options)
  ```

- No `pluginConfigs` entry for nmg-router exists in user or local settings, so this is the AC4 unset case.

### Scenario 2: Diagnosis, with `required` removed in a disposable worktree

- **Setup**: detached worktree at `dd1b256`; the only change is deleting `"required": true` from `.claude-plugin/plugin.json`.
- **Observed**: the session started at the prompt with no hook or plugin load error.
- The worktree and tab were removed afterwards, and the shared checkout was not modified.

### AC Evaluation

All seven ACs have no passing interactive evidence, because the mod does not load in the configuration the spec defines as the default (row unset). Once the module loads, the routed-compaction, subagent, `/model`-switch and auto-mode scenarios need a fresh interactive run.

Both tabs (`verify-4`, `verify-4b`) were closed.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. This worker's publication scope allows writing only `verification-report.md` | — | — |

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Architecture / Configuration |
| **Location** | `.claude-plugin/plugin.json` (`userConfig.routedAutoPermissions.required`) |
| **Issue** | (H1) `"required": true` with no default makes Claude Code refuse to load the hooks module whenever the row is unset, which is every new install |
| **Impact** | The whole mod is inactive: no routed turns, `/login`, compaction, subagent routing or permissions. This regresses #2 and #3, and AC4's unset default can never happen |
| **Reason Not Fixed** | The verify publication scope allows only the report. Fix: remove `"required": true`, as the design and T004 specify ("no default") |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Testing |
| **Location** | `tests/manifest/` |
| **Issue** | (M1) No test checks that `plugin.json`'s `userConfig` lets the module load with every row unset (no `required` field without a `default`) |
| **Impact** | A load-blocking manifest passes the full registered gate |
| **Reason Not Fixed** | Outside the verify publication scope |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security |
| **Location** | `src/permissions/policy.ts:29` |
| **Issue** | (L1) The classifier text embeds the routed model's tool input verbatim, so crafted input can try to steer the classifier |
| **Impact** | Limited: labels are restricted to allow/ask/deny, rules still win, and the server classifier has the same exposure |
| **Reason Not Fixed** | Within the approved design; noted for follow-up hardening, such as fencing the input |

---

## Positive Observations

- `router.complete` reuses the guarded `send` pipeline, so the Anthropic guard, host check and error classification cover summaries just as they cover steps.
- Every routed failure path ends in `{ skip }` or `ask`. There is no silent fallback to Claude.
- Routed calls are recognized by the tool ids that routed steps emitted, which is exact for subagents too.
- Login presence is read as a boolean once per session, and tests check that it is never stored or sent.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Remove `"required": true` from `userConfig.routedAutoPermissions` in `.claude-plugin/plugin.json` (H1)
- [ ] Re-run the interactive herdr procedure covering AC1–AC7, including `/model` switches between Claude and a routed model in both directions

### Short Term (Should)
- [ ] Add a manifest test that rejects a `required` userConfig field without a `default` (M1)

### Long Term (Could)
- [ ] Fence the tool input in the classifier prompt (L1)

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `.claude-plugin/plugin.json` | 1 | H1 |
| `hooks/register.ts` | 0 | Thin wiring; literal host calls |
| `src/compaction/auto-trigger.ts` | 0 | |
| `src/compaction/compact-hook.ts` | 0 | |
| `src/compaction/summary-prompt.ts` | 0 | |
| `src/compaction/summary-request.ts` | 0 | |
| `src/compaction/threshold.ts` | 0 | |
| `src/permissions/mode.ts` | 0 | |
| `src/permissions/permission-mode.ts` | 0 | |
| `src/permissions/policy.ts` | 1 | L1 |
| `src/permissions/tool-check.ts` | 0 | |
| `src/routing/router.ts` | 0 | |
| `src/routing/session-tracker.ts` | 0 | |
| `src/routing/turn-step.ts` | 0 | |
| `tests/**` (new and changed suites) | 1 | M1 |

---

## Recommendation

**Needs fixes**

The implementation logic matches the approved design, and the registered gate is green. The manifest's `required` flag stops the mod from loading at all on a default install, so no acceptance criterion holds in a live session. Remove the flag, add a manifest load test, and re-verify with a full interactive run.
