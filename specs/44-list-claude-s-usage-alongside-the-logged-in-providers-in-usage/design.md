# Root Cause Analysis: List Claude's usage alongside the logged-in providers in /usage

**Issue**: #44
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## Root Cause

A mod cannot draw inside Claude Code's built-in `/usage` panel, and a panel command drops a hook's `{ text }` returned after `next(e)`. `handleUsage` (`src/usage/usage-command.ts`) therefore runs `next(e)` and then `logUsage` writes one transcript row per line of `renderUsageEntries` (`src/usage/render.ts`). `logUsage` builds entries only from enabled, logged-in routed providers, so Claude's rate-limit windows, which `$.session.usage().rateLimits` returns with no credential, never appear beside them.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/usage/usage-command.ts` | `UsageCommandDeps`, `logUsage` | Builds the entries; has no Claude source |
| `src/usage/render.ts` | `renderUsageEntries` | Heading `Provider plan usage` |
| `hooks/register.ts` | `hostPort`, `usageDeps` | The port has no `session.usage` for the hook |

## Fix Strategy

- Add `claudeUsageReport(rateLimits)` to `src/usage/report.ts`: maps each `{ kind, percentUsed, resetsAt? }` to a `UsageWindow` with `id` = kind, label `5h` / `7d` / `spend` for `five_hour` / `seven_day` / `spend_limit` (else the kind), `usedPercent` = `percentOf(percentUsed)` (rows whose percent is not a finite number are dropped), `resetsAt` = `epochOf(resetsAt)`.
- `UsageCommandDeps` gains `claudeRateLimits: () => Promise<readonly { kind: string; percentUsed: number; resetsAt?: string }[]>`.
- `logUsage`: after finding at least one logged-in provider, reads `claudeRateLimits()` (a throw → empty), and prepends `{ name: "Claude", reading: windows.length > 0 ? { kind: "ok", report } : "none" }` to the provider entries. With no logged-in provider it returns before calling it.
- `renderUsageEntries` heading becomes `Plan usage`.
- `hooks/register.ts`: `hostPort`'s `session` gains `usage: () => $.session.usage()`; `usageDeps` sets `claudeRateLimits: async () => (await host.session.usage()).rateLimits`. `RouterHost.session` gains the matching `usage()` type.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/usage/report.ts` | Add `claudeUsageReport` | FR1 |
| `src/usage/usage-command.ts` | Claude entry first; tolerate failure | AC1, AC2, AC3, FR2, FR3 |
| `src/usage/render.ts` | Heading `Plan usage` | FR2 |
| `src/routing/router.ts` | `RouterHost.session.usage()` type | Port for the hook |
| `hooks/register.ts` | Port and deps wiring | AC1 |
| `tests/support/fake-engine.ts` | `rateLimits` fake option, `session.usage()` answers it | Test seam |

## Blast Radius

Only the `/usage` rows. The built-in command, the routed status line, the monitor and the provider reads are unchanged. Tests asserting the old `Provider plan usage` heading change to `Plan usage`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Draw inside the built-in panel | Rejected | Claude Code 2.1.312 has no render site for it. |
| Answer `/usage` without `next(e)` | Rejected | Would drop Claude Code's own view. |
| Read Claude usage from an Anthropic endpoint | Rejected | Would need a Claude credential. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #44 | 2026-10-28 | Initial defect design |
