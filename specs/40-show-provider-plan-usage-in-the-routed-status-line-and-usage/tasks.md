# Tasks: Show provider plan usage in the routed status line and /usage

**Issue**: #40
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## Implementation Tasks

### T001: Add the usage report, shared parsing, endpoint source and renderers

**File(s)**: `src/usage/report.ts`, `src/usage/sources.ts`, `src/usage/render.ts`, `src/providers/types.ts`
**Type**: Create | Modify
**Depends**: none
**Acceptance**:
- FR1: `src/usage/report.ts` exports `UsageWindow`, `UsageReport`, `UsageFailureKind`, `UsageOutcome`, `percentOf`, `windowLabel`, `epochOf` and `failureOf` with the behavior in design.md; it holds no provider-specific code.
- FR1: `ProviderPlugin` has an optional `usage?: UsageSource` with `read(deps, context)` and optional `fromHeaders(headers)`, next to `capabilities`.
- FR1, FR8: `endpointUsage({ url, headers, parse })` reads through `getJson` with `requestHeaders`, sending only the context's own token to the given URL, and maps outcomes as design.md states.
- FR5: `src/usage/render.ts` exports `windowText` and `renderUsageEntries` producing the `/usage` text in design.md, including reset text and the `No usage reading available` and `Usage could not be read: <kind>` lines.

### T002: Declare usage sources for OpenAI Codex and OpenCode Go

**File(s)**: `src/providers/builtin/openai-codex.ts`, `src/providers/builtin/opencode-go.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR2: `openaiCodex.usage.read` reads `https://chatgpt.com/backend-api/wham/usage` with the Codex headers (including `chatgpt-account-id`) and bearer token; `parseCodexUsage` and `parseCodexUsageHeaders` are exported and map windows `primary` then `secondary` with labels from `windowLabel`.
- FR3: `openCodeGo.usage.read` reads `https://opencode.ai/zen/go/v1/usage` with the API key as bearer; `parseOpenCodeGoUsage` is exported and returns windows `rolling`/`5h`, `weekly`/`weekly`, `monthly`/`monthly`, or undefined when any is missing or mis-shaped.
- FR4: `xai` and `clinePass` declare no `usage`.

### T003: Add the throttled usage monitor

**File(s)**: `src/usage/monitor.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- FR6: `createUsageMonitor(now)` returns `read`, `record`, `latest` and `outcome` keyed by provider and account; a read started less than 60 000 ms ago returns the kept outcome without calling the source; an in-flight read is shared; `record` counts as a read; a throwing source yields `unavailable`; a failed read keeps the last good report.
- FR8: the monitor holds reports and outcomes only and never touches `$.store`.

### T004: Render the routed status line from one structured object with usage

**File(s)**: `src/routing/status.ts`, `src/routing/router.ts`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- FR5: `statusText` and `errorStatusText` are replaced by `RoutedStatus` and `renderStatus(state)`; `router.ts` sets the line only through `renderStatus`.
- AC7: a main-loop failure renders `<model> · <provider> error: <kind>` exactly as before, with no windows.
- AC1, AC5, FR6: after a successful main-loop step, a `fromHeaders` report is recorded, the line renders with the provider's latest good report, and a background `monitor.read` starts only when there was no header report and the provider has a usage source; the read is not awaited in `routed()`.
- AC2, AC8, FR6: a settled read re-renders only while the shown state names the same provider and account with no error; `claudeStep` clears the shown state and the line.
- AC6, AC12: a failed or throwing read never changes the step's result and logs only `<provider name> usage unavailable: <kind>` to the debug log.
- `createRouter` takes the monitor as an optional fifth parameter.

### T005: Hook /usage and list each logged-in provider's usage after the built-in command

**File(s)**: `src/usage/usage-command.ts`, `hooks/register.ts`
**Type**: Create | Modify
**Depends**: T003, T004
**Acceptance**:
- FR7, AC9: `handleUsage` awaits `next(e)`, then lists enabled providers with login kind other than `none` and a stored login, ordered by name with `localeCompare`, reading each through the shared monitor with the active account's resolved credential, and returns `{ text }` with the built-in text (when present) followed by `renderUsageEntries` output.
- AC11: with no such provider it returns `next(e)`'s result unchanged.
- AC10: credential-resolution and read failures become that provider's failure kind without affecting other entries.
- `hooks/register.ts` creates one monitor shared by `createRouter` and the `usage` hook, registers `command.run` `{ command: "usage" }` delegating to `handleUsage` with a port built by `hostPort($)` (no `$` passed to a nested function), and `.catch((_, e, next) => next(e))`.
- `npm run typecheck` passes and `claude plugin validate .` accepts the manifest.

### T006: Test the report helpers, renderers and provider usage parsers

**File(s)**: `tests/usage/report.test.ts`, `tests/usage/render.test.ts`, `tests/providers/usage-sources.test.ts`, `tests/fixtures/codex-usage.json`, `tests/fixtures/opencode-go-usage.json`
**Type**: Create
**Depends**: T002
**Acceptance**:
- FR1: `percentOf`, `windowLabel` (300 → `5h`, 10080 → `7d`, 90 → `90m`), `epochOf` and `failureOf` cases.
- FR2, AC5: `parseCodexUsage` maps the recorded fixture; `parseCodexUsageHeaders` maps `x-codex-*` headers to `5h` and `7d` windows and returns undefined without them.
- FR3: `parseOpenCodeGoUsage` maps the recorded fixture to `5h`, `weekly`, `monthly` in order; a body missing `monthly` is `malformed` through `openCodeGo.usage.read` against a faked `$.http`.
- FR4: `xai` and `clinePass` have no `usage`.
- FR8: the read sends `authorization: Bearer <token>` only to the provider's own usage URL.
- AC9 rendering: `renderUsageEntries` produces `5h 23% · resets in 2h 10m`, `No usage reading available` and `Usage could not be read: offline` lines.
- Fixtures contain no token, key or account id and pass `tests/hygiene/fixtures.test.ts`; `npm test` passes.

### T007: Test the monitor and the routed status line with usage

**File(s)**: `tests/usage/monitor.test.ts`, `tests/routing/usage-status.test.ts`, `tests/routing/thinking-status.test.ts`, `tests/routing/errors.test.ts`, `tests/support/routing.ts`
**Type**: Create | Modify
**Depends**: T004, T006
**Acceptance**:
- FR6: monitor tests for the 60 s window (59 999 ms no call, 60 000 ms one call), shared in-flight reads, `record` counting as a read, and the last good report surviving a failure.
- AC1: an `opencode-go` main-loop step with a recorded usage response ends with the status line `<model> · thinking <level> · 5h <n>% · weekly <n>% · monthly <n>%` after the read settles.
- AC2: a step on provider A, then a step on provider B while A's read is still pending, ends with a line that has none of A's windows.
- AC3: `xai` and `cline-pass` steps send no request to any usage URL and show model and thinking only.
- AC4: a second step within 60 s sends no usage request and shows the kept windows; a step at 60 s or later sends exactly one.
- AC5: an `openai-codex` response with `x-codex-*` headers shows `5h` and `7d` windows and sends no request to the `wham/usage` URL.
- AC6: usage reads answering 500, offline and a mis-shaped body leave the step's chunks and result unchanged and show the last good windows or none.
- AC7: existing error-line expectations in `tests/routing/errors.test.ts` still pass unchanged.
- AC8: a Claude main-loop step clears the line, sends no usage request, and a pending read settling afterwards sets no status.
- AC12: with a sentinel credential, `assertNoSentinel` passes and no recorded status text contains it.
- `npm test` passes.

### T008: Test the /usage hook

**File(s)**: `tests/usage/usage-command.test.ts`, `tests/hooks/register.test.ts`
**Type**: Create | Modify
**Depends**: T005, T006
**Acceptance**:
- AC9: with stored logins for `opencode-go`, `openai-codex` and `xai` and none for `cline-pass`, `next` is called once with the unchanged event, and the returned text has the built-in text then entries for OpenAI Codex, OpenCode Go and xAI in that order, with window lines and reset text, `No usage reading available` for xAI, and no ClinePass entry.
- AC10: with one provider's usage URL answering 500, its entry reads `Usage could not be read: unavailable` and the other shows its windows.
- AC11: with no stored logins the hook resolves to the exact object `next` resolved and sends no usage request.
- FR7: a hook whose handler throws still runs the built-in command through the `.catch` path; `tests/hooks/register.test.ts` lists the `command.run` `{ command: "usage" }` hook.
- AC12: with a sentinel credential, the returned text, ui log lines and store writes do not contain it.
- `npm test` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #40 | 2026-10-27 | Initial feature tasks |
