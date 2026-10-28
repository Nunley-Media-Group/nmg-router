# Tasks: Publish the selected routed model's plan usage for a custom statusLine command

**Issue**: #43
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## Implementation Tasks

### T001: Add the status snapshot writer

**File(s)**: `src/usage/status-snapshot.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- FR1, AC1: exports `StatusSnapshot`, `StatusSnapshotWriter`, `snapshotPath` and `createStatusSnapshotWriter` as design.md states; the written JSON has exactly `version`, `sessionId`, `provider`, `model` and `windows` with `label`, `usedPercent` and optional `resetsAt`.
- AC6: `snapshotPath` returns `undefined` for a session id outside `[A-Za-z0-9_-]{1,128}`; the snapshot carries no account, token or key field.
- FR3, AC5: writes are queued in call order and every failure is caught.
- FR4, AC6: on POSIX the directory is `0700`, a unique temporary file is set `0600` and moved over the snapshot; on Windows the file is written in place.

### T002: Publish the snapshot from the router and wire it in register

**File(s)**: `src/routing/router.ts`, `hooks/register.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR2, AC1, AC2: `show` publishes the snapshot with the shown provider, model and usage; `redraw` republishes with the same guards it already applies.
- AC3: a late reading for an earlier provider never publishes.
- AC4: a main-loop failure publishes the routed model with no windows; `claudeStep` clears the snapshot for the shown session.
- AC7: subagent steps never publish or clear.
- `createRouter` takes the writer as an optional sixth parameter; `hooks/register.ts` builds it from the host port and the shared services' platform, passing no `$` to a nested function.

### T003: Document the snapshot contract

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR5: the README gives the snapshot path on macOS/Linux and Windows, the version-1 fields, and the rule to read it only when `sessionId` and `model` match the status-line input's `session_id` and `model.id`.
- `tests/docs/readme-sections.test.ts` and `tests/docs/readme-security.test.ts` pass.

### T004: Test the snapshot writer

**File(s)**: `tests/usage/status-snapshot.test.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- AC1: with a faked engine on Linux, `show` writes the version-1 JSON to `/home/tester/.claude/nmg-router/status/<id>.json` through a temp file and `mv`; with `CLAUDE_CONFIG_DIR` set the path is under it; on Windows the path is `C:\Users\tester\.claude\nmg-router\status\<id>.json` with no process calls.
- AC6: `mkdir -p -m 700`, `chmod 700` and `chmod 600` are run; `../x` and an empty id write nothing; the JSON has no account, token or key.
- AC4: `clear` writes `{ version: 1, sessionId, windows: [] }` after an earlier `show`, in order.
- AC5: a failing `mkdir` writes nothing and does not throw.
- `npm test` passes.

### T005: Test the router's snapshot publishing

**File(s)**: `tests/routing/usage-status.test.ts`, `tests/support/routing.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC1, AC2: an `opencode-go` step publishes its model, then its three windows once the read settles.
- AC1: an `openai-codex` step with `x-codex-*` headers publishes `5h` and `7d` and sends no `wham/usage` request.
- AC3: after an `opencode-go` step with its read held, an `xai` step publishes the xAI model with no windows, and the released read publishes nothing more.
- AC4: a failed step publishes no windows; a Claude step clears.
- AC7: a subagent step leaves the publish calls unchanged.
- AC5: a writer whose calls throw leaves the step's chunks, result and status line unchanged.
- `npm test`, `npm run typecheck` and `claude plugin validate .` pass.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #43 | 2026-10-28 | Initial feature tasks |
