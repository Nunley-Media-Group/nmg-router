# Verification Report: List Claude's usage alongside the logged-in providers in /usage

**Date**: 2026-10-29
**Issue**: #44
**Reviewer**: Claude Code
**Scope**: Implementation verification against spec
**Verification head**: d4fb8c0a4f92f14a0ea46c651d14be9609f992a2

---

## Executive Summary

The fix is implemented and works in a live session. `/usage` runs Claude Code's built-in panel unchanged through `next(e)`. nmg-router then logs `Plan usage`, a `Claude` entry built from `$.session.usage().rateLimits`, and each logged-in provider in its existing order. A failed or empty Claude read shows `No usage reading available` and leaves the provider entries intact. With no provider login, nothing is logged and Claude's usage is not read.

All three registered validations pass at the verification head (typecheck, 670/670 tests, `claude plugin validate .`). Interactive herdr runs confirmed AC1, AC2 and AC3.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #44
- Spec: `specs/44-list-claude-s-usage-alongside-the-logged-in-providers-in-usage`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":44,"specPath":"specs/44-list-claude-s-usage-alongside-the-logged-in-providers-in-usage","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/44.json`, identity head `d4fb8c0a4f92f14a0ea46c651d14be9609f992a2`, tree clean
- Ceiling: none
- Coverage: declared 3, recorded 3, complete `true`; no missing, duplicate or unknown results

| Validation | Provider | Required | Status | Summary |
|------------|----------|----------|--------|---------|
| `repository.typecheck` | builtin.command | yes | passed | command exited 0 |
| `repository.tests` | builtin.command | yes | passed | command exited 0 |
| `repository.plugin-manifest` | builtin.command | yes | passed | command exited 0 |

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Claude's usage is listed with the providers' | Pass | `src/usage/usage-command.ts` `logUsage` renders `[claude, ...providers]`; `src/usage/render.ts` heading `Plan usage`; `src/usage/report.ts` `claudeUsageReport`. Unit: `tests/usage/usage-command.test.ts` "lists Claude's windows first under Plan usage…" asserts `Plan usage`, `Claude`, `  5h 24% · resets in 2h 10m`, `  7d 41%`, then OpenCode Go rows. Live: see Interactive Verification run 1 |
| AC2 | Claude with no reading | Pass | `claudeEntry` catches a throwing read and maps zero windows to `"none"`. Unit: empty-windows and throwing-read cases in `tests/usage/usage-command.test.ts`. Live: run 3 (simulated read failure) |
| AC3 | Related behavior is preserved | Pass | `logUsage` returns before `claudeEntry` when no provider is logged in. Unit: existing no-login case now also asserts `engine.recorded.usages === 0`. Live: run 2 |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `CLAUDE_WINDOW_LABELS` maps `five_hour`→`5h`, `seven_day`→`7d`, `spend_limit`→`spend`; other kinds keep their name; `percentOf` and `epochOf` reused. `tests/usage/report.test.ts` covers each kind, rounding/clamping, NaN drop and an unparseable `resetsAt` |
| FR2 | Pass | `renderUsageEntries` heading is `Plan usage`; the Claude entry precedes the provider entries, whose order is unchanged |
| FR3 | Pass | `claudeEntry` has its own try/catch and runs beside the provider reads in `Promise.all`; the built-in result is returned unchanged |
| FR4 | Pass | `hooks/register.ts` passes only `(await host.session.usage()).rateLimits`; `RouterHost.session.usage` is typed to the rate-limit figures; no credential path touched |

## Task Completion

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Complete | `src/usage/report.ts`, `src/usage/usage-command.ts`, `src/usage/render.ts`, `src/routing/router.ts`, `hooks/register.ts` modified as listed |
| T002 | Complete | `tests/usage/usage-command.test.ts`, `tests/usage/render.test.ts`, `tests/usage/report.test.ts`, `tests/support/fake-engine.ts` modified; fake `$.session.usage` records calls and supports rate limits or a rejection |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Mapping in pure `claudeUsageReport`; entry building in `claudeEntry`; rendering unchanged in `renderUsageEntries` |
| Open/Closed | 5 | Claude is one more `UsageEntry`; the renderer needed only its heading text changed |
| Liskov Substitution | 5 | The Claude entry uses the same `UsageOutcome` shape as providers |
| Interface Segregation | 5 | `UsageCommandDeps.claudeRateLimits` exposes only the rate-limit figures, not the full session usage |
| Dependency Inversion | 5 | The command depends on an injected port; `hooks/register.ts` binds it to `$` |

### Layer Separation

`hooks/register.ts` stays thin: it adds one port binding and one deps field. `$` reaches only the top-level `hostPort` helper, and `claude plugin validate .` passes.

### Dependency Flow

`hooks` → `src/usage` → `src/usage/report.ts` (pure). No new cross-directory imports beyond the `ClaudeRateLimit` type in `src/routing/router.ts`.

## Security Assessment

- [x] No Claude credential, OAuth token or provider key is read, logged or stored. Only `rateLimits` figures leave the session usage.
- [x] No model output or external data is interpolated into a shell command.
- [x] No change to the Anthropic guard or routed request path.

## Performance Assessment

- [x] The Claude read runs concurrently with the provider reads (`Promise.all`), so `/usage` waits no longer than before.
- [x] With no provider login, `$.session.usage()` is not called.

## Test Coverage

### BDD Scenarios

The project keeps Gherkin in the spec and runs the scenarios as Vitest cases (no `tests/features/` directory, same as earlier issues).

| Scenario | Vitest case | Status |
|----------|-------------|--------|
| SCN001 | `tests/usage/usage-command.test.ts` "lists Claude's windows first under Plan usage, then the logged-in provider's" | Pass |
| SCN002 | `tests/usage/usage-command.test.ts` "says Claude has no reading… when Claude reports no windows" and "…when Claude's usage cannot be read" | Pass |
| SCN003 | `tests/usage/usage-command.test.ts` no-login case, now asserting `usages === 0` | Pass |

### Coverage Summary

- Full suite: 75 files, 670 tests passed
- `tests/usage`: 5 files, 55 tests passed
- Type-check: passed
- Plugin manifest validation: passed

## Interactive Verification

herdr answered `herdr tab list`. Each run used a fresh `claude` session in a new `verify-44` tab with the installed copy disabled (`--settings '{"enabledPlugins":{"nmg-router@nmg-plugins":false}}'`), so the branch code answered the hooks. No credential was typed. No startup dialog or hook/plugin load error appeared. Each tab was closed after its run. `~/.claude/plugins/store/` was unchanged afterwards.

**Run 1: AC1 / SCN001** (worktree, `--plugin-dir .`, existing OpenCode Go login in the inline index)
- Prompt: `/usage`, then Esc to close the panel
- Outcome: the built-in panel opened first (Current session, Current week sections), then nmg-router logged rows in the expected order.
- Excerpt:
  ```
  ⏺ nmg-router: Plan usage
  ⏺ nmg-router: Claude
  ⏺ nmg-router:   5h 4% · resets in 1h 33m
  ⏺ nmg-router:   7d 37% · resets in 1d 19h
  ⏺ nmg-router: Fake Local
  ⏺ nmg-router:   No usage reading available
  ⏺ nmg-router: OpenCode Go
  ⏺ nmg-router:   5h 3% · resets in 4h 43m
  ⏺ nmg-router:   weekly 31% · resets in 3d 1h
  ⏺ nmg-router:   monthly 16% · resets in 18d 6h
  ```
  The Claude figures match the status line (`5hr: 4.0%`, `7day: 37.0%`).

**Run 2: AC3 / SCN003** (scratch copy of the branch with `plugin.json` renamed, so its login index is empty)
- Prompt: `/usage`, then Esc; then `/login` to confirm the mod was loaded
- Outcome: the built-in panel opened and closed normally, and no nmg-router rows were logged. `/login` showed the mod's provider picker with every provider `— not logged in`, which confirms the hook was active.
- Excerpt (`/login`): `OpenCode Go — not logged in` · `OpenAI Codex — not logged in` · `Fake Local — not logged in`

**Run 3: AC2 / SCN002** (scratch copy with the plugin name restored and the `claudeRateLimits` port in `hooks/register.ts` patched to reject, which simulates a failed `$.session.usage()`)
- Prompt: `/usage`, then Esc
- Outcome: the panel ran unchanged; the Claude entry fell back and provider entries were intact.
- Excerpt:
  ```
  ⏺ nmg-router: Plan usage
  ⏺ nmg-router: Claude
  ⏺ nmg-router:   No usage reading available
  ⏺ nmg-router: Fake Local
  ⏺ nmg-router:   No usage reading available
  ⏺ nmg-router: OpenCode Go
  ⏺ nmg-router:   5h 3% · resets in 4h 41m
  ```
  The empty-windows branch of AC2 cannot be produced live on a Claude Max login that reports windows. It is covered by the unit case with `rateLimits: []`.

Routing, the model picker and `/login` were not changed, so no `/model` switch scenarios were required.

## Steering Doc Verification Gates

Gates come from `steering/manifest.json` validations (see the Deterministic Steering Artifact section). Gate summary: 3/3 passed, 0 failed, 0 incomplete.

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority
None.

## Positive Observations

- The Claude read is isolated in its own try/catch, so it can never hide provider entries or the built-in panel.
- The fake `$.session.usage` now counts calls, which makes the "not read with no login" guarantee testable.
- Reusing `percentOf`, `epochOf` and `renderUsageEntries` keeps Claude and provider formatting identical.

## Recommendations Summary

### Before PR (Must)
None.

### Short Term (Should)
None.

### Long Term (Could)
- Consider a fake-engine helper that drives a panel command end to end, so panel-specific host behavior is modeled in unit tests as well as live.

## Files Reviewed

- `hooks/register.ts`
- `src/routing/router.ts`
- `src/usage/render.ts`
- `src/usage/report.ts`
- `src/usage/usage-command.ts`
- `tests/support/fake-engine.ts`
- `tests/usage/render.test.ts`
- `tests/usage/report.test.ts`
- `tests/usage/usage-command.test.ts`

## Recommendation

Ready for PR.
