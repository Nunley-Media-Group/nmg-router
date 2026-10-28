# Tasks: List Claude's usage alongside the logged-in providers in /usage

**Issue**: #44
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `src/usage/report.ts`, `src/usage/usage-command.ts`, `src/usage/render.ts`, `src/routing/router.ts`, `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `claudeUsageReport` maps `five_hour` → `5h`, `seven_day` → `7d`, `spend_limit` → `spend`, other kinds by name, percents through `percentOf`, `resetsAt` through `epochOf`.
- AC1, FR2: with at least one logged-in provider, the logged rows are `Plan usage`, the `Claude` entry, then the provider entries in their existing order.
- AC2, FR3: an empty or throwing `claudeRateLimits` gives `Claude` / `  No usage reading available`, with provider entries unchanged.
- AC3: with no logged-in provider, `claudeRateLimits` is not called and nothing is logged.
- FR4: `hooks/register.ts` passes only `$.session.usage().rateLimits` through the host port; `claude plugin validate .` passes and no `$` reaches a nested function.

### T002: Add Behavioral Regression Coverage

**File(s)**: `tests/usage/usage-command.test.ts`, `tests/usage/render.test.ts`, `tests/usage/report.test.ts`, `tests/support/fake-engine.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: with fake rate limits `five_hour` 23.5% (resets 2h 10m after the test clock) and `seven_day` 41% and an OpenCode Go login, the logged rows are `Plan usage`, `Claude`, `  5h 24% · resets in 2h 10m`, `  7d 41%`, `OpenCode Go`, then its windows.
- AC2: empty rate limits, and a throwing read, each give `  No usage reading available` under `Claude` with the OpenCode Go entry intact.
- AC3: with no stored login nothing is logged and the fake records no `session.usage` call.
- FR1: `claudeUsageReport` unit cases for each kind, rounding and an unparseable `resetsAt`.
- Existing heading assertions updated to `Plan usage`; `npm test` and `npm run typecheck` pass.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #44 | 2026-10-28 | Initial defect tasks |
