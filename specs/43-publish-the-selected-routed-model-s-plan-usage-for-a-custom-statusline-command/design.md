# Design: Publish the selected routed model's plan usage for a custom statusLine command

**Issue**: #43
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## Overview

A new `src/usage/status-snapshot.ts` writes the routed status as a small JSON file per session. The router calls it from the same places it sets the status line (`show`, via `showStep`, `redraw` and `failure`) and clears it in `claudeStep`. `hooks/register.ts` builds one writer from the host port and passes it to `createRouter` as an optional sixth parameter. Nothing new is read from a provider and nothing is stored in `$.store`.

## Architecture

```text
router.show(state, sessionId)
  host.ui.status(renderStatus(state))                  (unchanged)
  snapshot.show(sessionId, provider.id, model, error ? undefined : usage)
router.redraw → show({ ...shown, usage }, shownSessionId)   (same guards as today)
router.failure (main loop) → sessionId = await host.session.id() (failure tolerated) → show(error state, sessionId)
router.claudeStep (main loop, shown set) → snapshot.clear(shownSessionId)
snapshot writer: queue → resolve path → mkdir/chmod (POSIX) → fs.write temp → chmod 600 → mv over path
```

`showStep` already receives the step's `SendContext`, whose `sessionId` comes from `host.session.id()`; the router keeps it in `shownSessionId` beside `shown`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `snapshotPath(configDir, sessionId, platform)` | strings | path or `undefined` | `undefined` unless `sessionId` matches `^[A-Za-z0-9_-]{1,128}$`; joins `nmg-router/status/<id>.json` with the platform separator. |
| `StatusSnapshot` | — | `{ version: 1; sessionId; provider; model; windows: { label; usedPercent; resetsAt? }[] }` | Only these fields; window `id` is dropped. |
| `createStatusSnapshotWriter(host: Pick<HostPort, "env" \| "fs" \| "process">, platform: () => Promise<string>)` | — | `{ show(sessionId, provider, model, usage?); clear(sessionId) }` | Each call is queued after the previous one; errors are caught. `clear` writes `{ version: 1, sessionId, windows: [] }`. |
| config dir | `CLAUDE_CONFIG_DIR`, `HOME`, `USERPROFILE` | path or none | `CLAUDE_CONFIG_DIR` when non-empty; else `<HOME>/.claude` (Windows: `<USERPROFILE>\.claude`, falling back to `HOME`); none → no write. |
| POSIX write | path | — | `mkdir -p -m 700 <dir>`, `chmod 700 <dir>`, `fs.write(<path>.<writer nonce>.<n>.tmp)`, `chmod 600 <tmp>`, `mv -f <tmp> <path>`; any non-zero exit stops that write. |
| Windows write | path | — | `fs.write(path)` (the host creates folders). |
| `createRouter(host, capture, tracker, view, monitor, snapshot?)` | optional sixth parameter | — | Absent → no snapshot work. |

## Data / Storage Changes

One JSON file per session under the Claude config directory. No `$.store` key, no settings change. Files are never deleted by this issue.

## State and UI Behavior

- `shownSessionId` is set with `shown` and cleared with it in `claudeStep`.
- A failed main-loop step publishes the routed model with no windows; `host.session.id()` failing there skips the snapshot only.
- Subagent steps never call `show` or `claudeStep`'s clearing branch, so they leave the snapshot (AC7).
- `$.ui.status` text and timing are unchanged (AC5).

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Supply `rate_limits` into Claude Code's status-line input | Rejected | Claude Code 2.1.312 has no mod API for it. |
| Keep the data in `$.store` | Rejected | An external command cannot read the mod's store. |
| One shared file for all sessions | Rejected | Two tabs would show each other's provider. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #43 | 2026-10-28 | Initial feature design |
