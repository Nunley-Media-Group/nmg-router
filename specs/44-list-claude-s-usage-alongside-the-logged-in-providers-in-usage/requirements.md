# Defect Report: List Claude's usage alongside the logged-in providers in /usage

**Issue**: #44
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## Reproduction

1. Log in to OpenCode Go or OpenAI Codex with `/login`, with a Claude subscription login whose rate-limit windows have a reading.
2. Run `/usage` and close the built-in panel.
3. Read the rows nmg-router adds to the transcript.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | nmg-router's `/usage` rows list Claude's usage windows and each logged-in provider's windows together, under one heading. |
| **Actual** | The rows list only the routed providers under `Provider plan usage`; Claude's windows appear only inside the built-in panel. |

## Acceptance Criteria

### AC1: Claude's usage is listed with the providers'

**Given** `$.session.usage()` reports Claude rate-limit windows `five_hour` at 23.5% resetting at a known time and `seven_day` at 41%, and OpenCode Go has a stored login with a usage reading
**When** the person runs `/usage`
**Then** after Claude Code's built-in command runs unchanged through `next(e)`, nmg-router's rows read `Plan usage`, then `Claude` with indented `5h 24% · resets in <d>` and `7d 41%` lines, then `OpenCode Go` with its windows, in that order

### AC2: Claude with no reading

**Given** `$.session.usage()` reports no rate-limit windows, or the call fails, and a provider has a stored login
**When** the person runs `/usage`
**Then** the `Claude` entry reads `No usage reading available` and the provider entries are unchanged

### AC3: Related behavior is preserved

**Given** no login-requiring provider has a stored login
**When** the person runs `/usage`
**Then** nmg-router adds no rows and does not call `$.session.usage()`, and the built-in command's result passes through unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The `/usage` hook reads `$.session.usage().rateLimits` and maps `five_hour` to label `5h`, `seven_day` to `7d` and `spend_limit` to `spend` (any other kind keeps its own name), with whole-number percents through `percentOf` and ISO `resetsAt` through `epochOf`, as a `UsageReport`. | Must |
| FR2 | The rows start with the heading `Plan usage`, then a `Claude` entry, then the logged-in provider entries in their existing order, all rendered by `renderUsageEntries`. | Must |
| FR3 | A failed or empty `$.session.usage()` read gives the `Claude` entry `No usage reading available` and never hides provider entries or the built-in command. | Must |
| FR4 | No Claude credential is read; only the figures `$.session.usage()` returns. | Must |

## Out of Scope

- Drawing inside Claude Code's built-in `/usage` panel.
- Showing Claude's usage in nmg-router's routed status line.
- Claude usage rows when no provider has a stored login.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #44 | 2026-10-28 | Initial defect report |
