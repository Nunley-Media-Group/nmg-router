# Design: Show provider plan usage in the routed status line and /usage

**Issue**: #40
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## Overview

A new `src/usage/` concern holds the provider-agnostic usage report, the shared parsing helpers, an endpoint-read factory, an in-memory throttled monitor, the `/usage` entry renderer and the `/usage` command handler. `ProviderPlugin` gains an optional `usage` strategy next to `capabilities`; only `openai-codex` and `opencode-go` declare one. `src/routing/status.ts` replaces its two string builders with one `renderStatus(state)` over a structured `RoutedStatus` object, and the router keeps the shown object, starts usage reads after a step's answer without awaiting them, and re-renders when a reading arrives. `hooks/register.ts` gains one thin `command.run` hook for `usage`.

## Architecture

```text
turn.step (routed main loop) → router.routed()
  send() → Reply { tally, headers, ... }          (headers: lowercase, from TransportResponse)
  report = plugin.usage?.fromHeaders?.(headers)   → monitor.record(provider, account, report)
  shown = { provider, account, model, thinking, usage: monitor.latest(provider, account) }
  host.ui.status(renderStatus(shown))
  if no header report and plugin.usage:
    void monitor.read(provider, account, () => plugin.usage.read(host, { platform, auth }))
      .then(() => if shown still names this provider+account with no error → re-render)
      .catch(() => {})                              (never awaited on the answer path)

failure() → shown = { ..., error: kind } → renderStatus → "<model> · <provider> error: <kind>"
claudeStep() (main loop) → shown = undefined; host.ui.status(undefined)

command.run { command: "usage" } → handleUsage(deps, e, next)
  result = await next(e)
  rows = enabled providers with login.kind !== "none" and a stored login, by name (localeCompare)
  rows.length === 0 → return result
  per row (in parallel): no usage source → "none"; else resolve active account's credential
    → monitor.read(...)  (throttled; failure kinds from credential resolution too)
  return { text: join(result.text, renderUsageEntries(rows, now)) }
```

The router and the `/usage` hook share one monitor, created in `register` next to the session tracker and passed to `createRouter` and to the usage handler. The router keeps using the auth its step already resolved for the background read, so no extra credential read happens on the step path.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `src/usage/report.ts` types | — | `UsageWindow { id; label; usedPercent; resetsAt?: number }`, `UsageReport { windows: readonly UsageWindow[] }`, `UsageFailureKind = "unauthenticated" \| "unavailable" \| "offline" \| "malformed"`, `UsageOutcome = { kind: "ok"; report } \| { kind: UsageFailureKind }` | Provider-agnostic shapes. `resetsAt` is epoch milliseconds. |
| `percentOf(value)` | unknown | whole number 0–100 or undefined | Finite numbers only; `Math.round`, clamped. |
| `windowLabel(minutes)` | positive integer | `"<n>d"` / `"<n>h"` / `"<n>m"` | Whole days, else whole hours, else minutes. |
| `epochOf(value)` | unknown | epoch ms or undefined | Number: seconds, or milliseconds when above 1e12. String: `Date.parse` ISO. |
| `failureOf(outcome: HttpOutcome)` | `HttpOutcome` | `UsageFailureKind` | 401/403 → `unauthenticated`; other status → `unavailable`; `offline`; `malformed`. |
| `src/usage/sources.ts` `endpointUsage({ url, headers, parse })` | `parse(body) → UsageReport \| undefined` | `UsageSource` | `getJson(url, requestHeaders(headers(context), context.auth?.token))`; `ok` + parsed → `{ kind: "ok" }`, `ok` + undefined → `malformed`, else `failureOf`. |
| `ProviderPlugin.usage?: UsageSource` (`src/providers/types.ts`) | — | `UsageSource { read(deps: HttpDeps, context: ProviderContext): Promise<UsageOutcome>; fromHeaders?(headers: Readonly<Record<string, string>>): UsageReport \| undefined }` | Optional strategy next to `capabilities`. |
| `parseCodexUsage(body)` / `parseCodexUsageHeaders(headers)` (`openai-codex.ts`) | body / lowercase headers | `UsageReport \| undefined` | Window kept when `used_percent` and window length are valid; order primary, secondary; none → undefined. Headers: none present → undefined. |
| `parseOpenCodeGoUsage(body)` (`opencode-go.ts`) | body | `UsageReport \| undefined` | All three windows required (`percent` 0–100 number, `resetsAt` parseable); else undefined (→ `malformed`). |
| `src/usage/monitor.ts` `createUsageMonitor(now = Date.now)` | — | `UsageMonitor` | See State. |
| `monitor.read(provider, account, source)` | ids, `() => Promise<UsageOutcome>` | `Promise<UsageOutcome>` | In-flight read → same promise; last read started < 60 000 ms ago → kept outcome without calling `source`; else calls `source` (a throw is `unavailable`). |
| `monitor.record(provider, account, report)` | header report | void | Stores as latest good and latest outcome; counts as a read. |
| `monitor.latest(provider, account)` | ids | `UsageReport \| undefined` | Last good report. |
| `monitor.outcome(provider, account)` | ids | `UsageOutcome \| undefined` | Latest outcome. |
| `RoutedStatus` / `renderStatus(state)` (`src/routing/status.ts`) | `{ provider: { id; name }; account?; model; thinking: Thinking; usage?: UsageReport; error?: string }` | string | `error` set → `<model> · <provider name> error: <kind>`; else `<model> · thinking <level>` then ` · <label> <percent>%` per window. Replaces `statusText` / `errorStatusText`; `thinkingOf` stays. |
| `src/usage/render.ts` `windowText(window)` | `UsageWindow` | `"<label> <percent>%"` | Shared by both renderers. |
| `renderUsageEntries(entries, now)` | `{ name; reading: UsageOutcome \| "none" }[]`, epoch ms | string | First line `Provider plan usage`, then per provider its name and indented lines: per window `windowText` plus ` · resets in <d>` when `resetsAt` is set; `No usage reading available` for `"none"`; `Usage could not be read: <kind>` for a failure. |
| reset text `<d>` | ms until reset | `Xd Yh` (≥ 1 day), `Xh Ym` (≥ 1 hour), `Ym` (≥ 1 minute), `under 1m`; past → `resets now` replaces the whole suffix | Floors each unit. |
| `src/usage/usage-command.ts` `handleUsage(deps, e, next)` | `UsageCommandDeps { catalog; credentials; http; platform(); monitor; now() }`, `CommandRunInput`, `next` | `CommandRunResult` | See Architecture. Credential resolution: none / `undefined` → `unauthenticated`; `LoginError` `offline` → `offline`; other throw → `unauthenticated`. |
| `hooks/register.ts` | `command.run` `{ command: "usage" }` | — | `($, e, next) => handleUsage(usageDeps(hostPort($)), e, next)` with `.catch((_, e, next) => next(e))`, so a failed hook still runs the built-in command. |
| `createRouter(host, capture, tracker, view, usage = createUsageMonitor())` | added fifth parameter | — | `register` passes the shared monitor. |

## Data / Storage Changes

None persisted. The monitor is in-memory per engine, keyed by provider id and account name. No new `$.store` key, so the store switch in `hooks/register.ts` is unchanged. Model ids, names and picker rows are untouched.

## State and UI Behavior

- Router state `shown: RoutedStatus | undefined` replaces the `statusShown` boolean. A routed main-loop success sets it without `error`; a main-loop failure sets it with `error` (AC7); a Claude main-loop step clears it and the line (AC8). Subagent steps leave it and do no usage work.
- `routed()` returns `{ auth, account }` from `credentialFor` (account `undefined` for login-free providers) so the shown state and monitor key carry the active account.
- After a successful main-loop step: a `fromHeaders` report is recorded first (AC5); the line renders with `monitor.latest` (AC1, AC6); when there was no header report and the provider has a usage source, a background read starts. When it settles, the line re-renders only if `shown` still has the same provider id and account and no `error` (AC2, AC8). A failed read logs `<provider name> usage unavailable: <kind>` to the debug log only, with no body or header text (AC6, AC12).
- `/usage`: entries are provider name plus indented lines; each provider's reading is its latest outcome after a throttled read.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Await the usage read before setting the status line | Rejected | Non-`$` waits count against the `turn.step` hook's 10 s budget, and a slow endpoint would delay the answer. |
| Append `/usage` entries with `$.ui.log` | Rejected | Returning `{ text }` after `next(e)` is the documented way to add command output and is directly testable through `next`. |
| Persist readings in `$.store` | Rejected | Not needed by any AC and widens the credential-hygiene surface. |
| Keep string builders and add a third for usage | Rejected | FR5 requires one renderer of one structured object. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #40 | 2026-10-27 | Initial feature design |
