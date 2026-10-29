# Verification Report: List Claude's usage alongside the logged-in providers in /usage

**Date**: 2026-10-29
**Issue**: #44
**Reviewer**: Claude Code
**Scope**: Implementation verification against spec
**Verification head**: 267b00db03a279cdefa286eab92303da2385c2f2

---

## Executive Summary

The branch does not implement the defect fix. Its only change against `main` is a patch version bump (`VERSION`, `package.json`, `.claude-plugin/plugin.json` at 0.14.1) and a CHANGELOG entry that claims the fix. No `src/`, `hooks/` or `tests/` file changed. `/usage` still prints the `Provider plan usage` heading with provider entries only. Nothing reads `$.session.usage().rateLimits`, and `claudeUsageReport` does not exist.

The registered local gate is green (typecheck, tests, plugin validate). It passes because the existing code and tests are untouched, not because the spec's behavior is present.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 2 |
| Error Handling | 4 |
| **Overall** | 3.5 |

Architecture, security, performance and error-handling scores describe the existing, unchanged `/usage` code. No new code was added to review.

### Implementation Status: Fail
**Total Issues**: 3

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

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --base main --controller-run-id 5854bb93-4b25-4d7d-bd41-400ff450a19a`
- Artifact: `.nmg-sdlc/verification/44.json`, identity head `267b00db03a279cdefa286eab92303da2385c2f2`, tree clean
- Ceiling: none
- Coverage: declared 3, recorded 3, complete true; no missing, duplicate or unknown results
- Changed paths against `main`: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `VERSION`, `package.json`

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Rows read `Plan usage`, then `Claude` with `5h`/`7d` lines, then OpenCode Go | Fail | `src/usage/render.ts:37` still starts the rows with `"Provider plan usage"`. No code builds a `Claude` entry. `grep -rn "claudeUsageReport\|claudeRateLimits\|rateLimits" src hooks` finds nothing. |
| AC2 | No Claude reading gives `Claude` / `No usage reading available` | Fail | There is no `Claude` entry in any path, so this fallback does not exist. |
| AC3 | With no login, no rows and no `$.session.usage()` call | Fail (unimplemented) | The current code does log nothing with no login. The `claudeRateLimits` port this AC constrains was never added, and T002's no-call assertion was not written. |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Fail | `src/usage/report.ts` has no `claudeUsageReport` and no `five_hour`/`seven_day`/`spend_limit` mapping. |
| FR2 | Fail | Heading is `Provider plan usage` (`src/usage/render.ts:37`). No Claude entry. |
| FR3 | Fail | No Claude read, so there is no failure handling for one. |
| FR4 | N/A (no Claude read) | `hooks/register.ts:176` passes only `$.session.usage()` to the hub for context tokens. No credential is read. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause | Incomplete | None of `src/usage/report.ts`, `src/usage/usage-command.ts`, `src/usage/render.ts`, `src/routing/router.ts` or `hooks/register.ts` changed on the branch. |
| T002 | Behavioral regression coverage | Incomplete | Neither `tests/usage/*.test.ts` nor `tests/support/fake-engine.ts` changed. Tests still assert `Provider plan usage` (`tests/usage/render.test.ts:43`, `tests/usage/usage-command.test.ts:85`). |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Existing split between reports (`report.ts`), rendering (`render.ts`) and the hook body (`usage-command.ts`) is sound. The fix fits it without restructuring. |
| Open/Closed | 4 | `renderUsageEntries` takes a list of entries, so a Claude entry can be prepended without changing the renderer's loop. |
| Liskov Substitution | 4 | Not exercised by the change. |
| Interface Segregation | 4 | The host port is narrow. A `claudeRateLimits` port would keep it narrow. |
| Dependency Inversion | 4 | `$` stays in `hooks/register.ts`, as the hooks rule requires. |

### Layer Separation

Unchanged. No new layering to assess.

### Dependency Flow

Unchanged.

---

## Security Assessment

- [x] Authentication: no credential handling changed
- [x] Authorization: n/a
- [x] Input validation: n/a (no new input)
- [x] Injection prevention: no shell interpolation added
- [x] Data protection: no Claude credential read (FR4's constraint is held only because no read exists at all)

---

## Performance Assessment

- [x] Async patterns: unchanged
- [x] Caching: unchanged
- [x] Resource management: unchanged
- [x] Query optimization: n/a

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 (SCN001) | Yes | No | No |
| AC2 (SCN002) | Yes | No | No |
| AC3 (SCN003) | Yes | No | No (no `session.usage` no-call assertion) |

### Coverage Summary

- Feature files: 3 scenarios in `feature.gherkin`
- Step definitions: Missing. The project maps scenarios to Vitest cases, and none of the T002 cases exist.
- Unit tests: `npm test` passes on the unchanged suite
- Integration tests: none

---

## Interactive Verification

Not run. The steering's herdr procedure confirms runtime behavior, but every acceptance criterion already fails on static evidence: the code that would produce the `Plan usage` / `Claude` rows is not in the tree. A live run cannot change the Fail status. It is required again after the fix lands.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| repository.typecheck (`npm run typecheck`) | Pass | `effectiveStatus: passed` at `267b00d` |
| repository.tests (`npm test`) | Pass | `effectiveStatus: passed` at `267b00d` |
| repository.plugin-manifest (`claude plugin validate .`) | Pass | `effectiveStatus: passed` at `267b00d` |

**Gate Summary**: 3/3 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

None. The verify publication scope allows only this report to be written, and the missing work is the whole of T001 and T002, not a small local fix.

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Architecture |
| **Location** | `src/usage/render.ts:37`, `src/usage/report.ts`, `src/usage/usage-command.ts`, `hooks/register.ts` |
| **Issue** | T001 not implemented: no `claudeUsageReport`, no `claudeRateLimits` host port, heading still `Provider plan usage`, no `Claude` entry. |
| **Impact** | `/usage` still shows only routed providers, which is the defect #44 reports. |
| **Reason Not Fixed** | Outside the verify scope. Needs implementation. |

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Testing |
| **Location** | `tests/usage/usage-command.test.ts`, `tests/usage/render.test.ts`, `tests/usage/report.test.ts`, `tests/support/fake-engine.ts` |
| **Issue** | T002 not implemented: no AC1/AC2/AC3 or FR1 cases, and heading assertions not updated. |
| **Impact** | The green test gate does not cover this spec. |
| **Reason Not Fixed** | Outside the verify scope. Needs implementation. |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Architecture |
| **Location** | `CHANGELOG.md` (0.14.1), `VERSION`, `package.json`, `.claude-plugin/plugin.json` |
| **Issue** | The 0.14.1 release entry says the fix shipped ("List Claude's usage alongside the logged-in providers in /usage (#44)"), but no code changed. |
| **Impact** | Delivering this branch would publish a release that claims a fix it does not contain. |
| **Reason Not Fixed** | Correct once the implementation lands on the branch. |

### Medium Priority
None.

### Low Priority
None.

---

## Positive Observations

- The existing `/usage` design (pure `renderUsageEntries`, a hook body that keeps the built-in result, rows logged one per line) gives the fix a clear place to go.
- The deterministic gate runs cleanly with complete coverage.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Implement T001 per `design.md`: `claudeUsageReport` in `src/usage/report.ts`, a `claudeRateLimits` port passing only `$.session.usage().rateLimits` from `hooks/register.ts`, the `Plan usage` heading and a leading `Claude` entry. Call the port only when at least one provider has a stored login.
- [ ] Implement T002's cases and update the heading assertions.
- [ ] Re-run the full registered gate and the herdr interactive check.

### Short Term (Should)
- None.

### Long Term (Could)
- None.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/usage/render.ts` | 1 | Heading unchanged |
| `src/usage/usage-command.ts` | 1 | No Claude entry |
| `src/usage/report.ts` | 1 | No `claudeUsageReport` |
| `hooks/register.ts` | 0 | No `rateLimits` port |
| `tests/usage/*.test.ts` | 1 | No new cases |
| `CHANGELOG.md` | 1 | Claims an unshipped fix |

---

## Recommendation

**Major rework needed**

The branch contains only the release bump for #44, not the fix. Return to implementation for T001 and T002, then re-verify at the new head.
