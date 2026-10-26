# Tasks: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## Implementation Tasks

### T001: Session tracker and router updates

**File(s)**: `src/routing/session-tracker.ts`, `src/routing/router.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- The tracker records the model per loop key, the routed context tokens from the last stop usage, and routed tool ids (the most recent 1024), as the design states (FR3)
- The router records every step's model, routed usage and emitted tool ids; it updates the status line only for the main loop; `complete()` runs the guarded pipeline once and returns joined text or throws a `RoutedError` (AC3, FR1)

### T002: Summary request, prompt and threshold

**File(s)**: `src/compaction/summary-request.ts`, `src/compaction/summary-prompt.ts`, `src/compaction/threshold.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `buildSummaryRequest` serializes messages, cuts tool results at 2000 characters, drops images and thinking, adds `Additional focus:` instructions, and sets no tools, no reasoning and the design's max output (AC1)
- `thresholdTokens(128000)` is 108800 (AC2, FR2)

### T003: Compaction hook and auto trigger

**File(s)**: `src/compaction/compact-hook.ts`, `src/compaction/auto-trigger.ts`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- Routed compaction answers one summary message from the routed model; Claude models call `next(e)` unchanged; `precompute` on a routed model is skipped; failures answer `{ skip }` naming the provider (AC1, AC2, FR1)
- The agent's own model is used when `agentId` is set (AC3)
- A main-loop turn ending at or above the threshold schedules `$.session.compact()`; below it, nothing happens (AC2, FR2)

### T004: Permission mode, policies and tool check

**File(s)**: `src/permissions/mode.ts`, `src/permissions/policy.ts`, `src/permissions/tool-check.ts`, `src/permissions/permission-mode.ts`, `.claude-plugin/plugin.json`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `plugin.json` declares the `routedAutoPermissions` userConfig row with the two options and no default; `effectiveMode` follows the design, and only `authorize()`'s nullness is read (AC4, FR4, FR6)
- `checkRoutedTool` acts only on routed tool ids in auto mode whose core verdict is an unsettled `ask`; rule, hook and setting verdicts and Claude calls are returned unchanged (AC7, FR5)
- The Claude classifier policy maps labels to decisions and gives `ask` on failure; the server-off policy answers `ask` with its reason (AC5, AC6)

### T005: Hook wiring

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T003, T004
**Acceptance**:
- Registers `session.compact` with its `.catch`, `turn.complete`, `tool.check` with its `.catch`, and the classic permission-mode observers, all delegating to `src/` (FR1, FR5)

### T006: Fake engine extensions

**File(s)**: `tests/support/fake-engine.ts`, `tests/support/fake-turn.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Fakes for `session.compact` dispatch, `$.session.compact`, `$.session.model`, `$.session.authorize` (handle or null), `$.model.classify` (label, undefined or rejection), `$.config.list`, `$.clock.after` and classic event inputs, all recording their calls

### T007: Compaction and subagent tests

**File(s)**: `tests/compaction/compact-hook.test.ts`, `tests/compaction/summary-request.test.ts`, `tests/compaction/auto-trigger.test.ts`, `tests/routing/subagents.test.ts`
**Type**: Create
**Depends**: T005, T006
**Acceptance**:
- AC1: manual and auto compaction on `opencode-go/glm-5.1` send one request to the OpenCode Go host carrying the instructions, return one summary message, and make no Anthropic call; a Claude model returns the `next(e)` result unchanged
- AC2: `thresholdTokens(128000)` = 108800; a turn ending at 108800 schedules `$.session.compact()` and at 108799 does not; a 500, a network failure and an empty summary each answer `{ skip }` naming OpenCode Go with no `next` call; a throwing hook is answered by `.catch` with `{ skip }`
- AC3: a routed subagent step reads `messages({ agentId })` and the captured prompt for its model; a Claude subagent step yields `next(e)`; a subagent compaction uses the agent's model; subagent steps leave the status line unchanged

### T008: Permission tests

**File(s)**: `tests/permissions/mode.test.ts`, `tests/permissions/tool-check.test.ts`
**Type**: Create
**Depends**: T005, T006
**Acceptance**:
- AC4: unset row with a handle → `claude-classifier`; unset row with `null` → `server-classifier-off`; a set row wins; the handle is absent from every recorded store, log, http and process surface
- AC5: a routed Bash call with core verdict `ask` returns the classifier's label as the decision; rejection and `undefined` give `ask`; the label and classification text do not appear in any routed request
- AC6: server-off mode returns `ask` with the nmg-router reason
- AC7: verdicts carrying `rule` (allow and deny), non-ask core verdicts, non-routed tool ids and non-auto modes are returned unchanged

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature tasks |
