# Tasks: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

T001–T008 are implemented on the branch. T003, T004, T006, T007 and T008 carry amended acceptance. T009–T013 are new.

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

### T003: Compaction hook and auto trigger (amended)

**File(s)**: `src/compaction/compact-hook.ts`, `src/compaction/auto-trigger.ts`
**Type**: Modify
**Depends**: T001, T002, T009
**Acceptance**:
- Routed compaction answers one summary message from the routed model; Claude models call `next(e)` unchanged; `precompute` on a routed model is skipped; failures answer `{ skip }` naming the provider (AC1, AC8, FR1)
- The main loop uses the session's selected model; a subagent uses its own tracked model (AC3)
- With a view, compaction summarizes the view's summary plus the messages after its cut, and a standing result drops the view (AC8)
- A main-loop turn ending at or above the threshold starts `summarizeInPlace`; below it, nothing happens; nothing in `src/` calls `$.session.compact()` (AC2, FR2)

### T004: Permission mode, policies and tool check (amended)

**File(s)**: `src/permissions/mode.ts`, `src/permissions/policy.ts`, `src/permissions/tool-check.ts`, `src/permissions/permission-mode.ts`, `.claude-plugin/plugin.json`
**Type**: Modify
**Depends**: T001, T011
**Acceptance**:
- `plugin.json` declares `routedAutoPermissions` as a free-text row with no `options`, no default and no `required`, and its description names both modes; `claude plugin validate .` passes (AC4, FR4)
- `effectiveMode` follows the design: either mode name wins, any other value reads as unset; only `authorize()`'s nullness is read (AC4, FR4, FR6)
- `checkRoutedTool` acts only on routed tool ids in auto mode whose core verdict is an unsettled `ask`; rule, hook and setting verdicts and Claude calls are returned unchanged (AC7, FR5)
- The Claude classifier policy returns its `allow` or `deny` and hands `ask`, failure and no label to `askPerson`; the server-off policy always hands to `askPerson`; neither returns `ask` (AC5, AC6, FR7)

### T005: Hook wiring

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T003, T004
**Acceptance**:
- Registers `session.compact` with its `.catch`, `turn.complete`, `tool.check` with its `.catch` (routed auto-mode calls → `deny`), and the classic permission-mode observers, all delegating to `src/` (FR1, FR5)

### T006: Fake engine extensions (amended)

**File(s)**: `tests/support/fake-engine.ts`, `tests/support/fake-turn.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Fakes for `session.compact` dispatch, `$.session.compact`, `$.session.model`, `$.session.authorize` (handle or null), `$.model.classify` (label, undefined or rejection), `$.config.list`, `$.clock.after` and classic event inputs, all recording their calls
- Host fidelity for 2.1.310: `$.session.compact()` skips the calling plugin's own `session.compact` hook and runs a recorded core summarizer; a hook's `ask` on a routed call in auto mode is refused as the server classifier's block; `$.ui.ask` answers a label or rejects; `tool.check` inputs carry `approver`; the tool listing can name `SubagentHandback`, and transcripts can hold `ToolSearch` results with `tool_reference` blocks

### T007: Compaction and subagent tests (amended)

**File(s)**: `tests/compaction/compact-hook.test.ts`, `tests/compaction/summary-request.test.ts`, `tests/compaction/auto-trigger.test.ts`, `tests/routing/subagents.test.ts`
**Type**: Modify
**Depends**: T005, T006
**Acceptance**:
- AC1: manual and auto compaction on `opencode-go/glm-5.1` send one request to the OpenCode Go host carrying the instructions, return one summary message, and make no Anthropic call; a Claude model returns the `next(e)` result unchanged
- AC2: `thresholdTokens(128000)` = 108800; a turn ending at 108800 starts an in-place summary and at 108799 does not; no test path records a `$.session.compact()` call or a core summarizer run
- AC3: a routed subagent step reads `messages({ agentId })` and the captured prompt for its model; a Claude subagent step yields `next(e)`; a subagent compaction uses the agent's model; subagent steps leave the status line unchanged
- AC8: a 500, a network failure and an empty summary during compaction each answer `{ skip }` naming OpenCode Go with no `next` call; a throwing hook is answered by `.catch` with `{ skip }`

### T008: Permission tests (amended)

**File(s)**: `tests/permissions/mode.test.ts`, `tests/permissions/tool-check.test.ts`, `tests/manifest/user-config.test.ts`
**Type**: Modify
**Depends**: T005, T006
**Acceptance**:
- AC4: unset row with a handle → `claude-classifier`; unset row with `null` → `server-classifier-off`; a set mode name wins; an unknown value reads as unset; the manifest has no row that is `required` without a default or has `options` without a default among them; the handle is absent from every recorded store, log, http and process surface
- AC5: a routed Bash call with core verdict `ask` returns the classifier's `allow` or `deny`; an `ask` label, a rejection and `undefined` reach `askPerson`; the label and classification text do not appear in any routed request
- AC6: covered by T013
- AC7: verdicts carrying `rule` (allow and deny), non-ask core verdicts, non-routed tool ids and non-auto modes are returned unchanged

### T009: In-place summary

**File(s)**: `src/compaction/routed-view.ts`, `src/compaction/auto-trigger.ts`, `src/compaction/summary-request.ts`, `src/routing/router.ts`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- `summarizeInPlace` cuts at the turn-end length of the main loop's API transcript, summarizes the messages after the current cut with the current summary carried in as `prior`, and on success sets the view and resets the main context tokens (AC2, FR2)
- A routed main-loop step awaits a pending summary and sends the summary message followed by `messages.slice(cut)`, merging a leading user message; a transcript shorter than `cut` drops the view; Claude steps and subagent steps never see the view (AC2)
- A failed in-place summary leaves the view unchanged, logs one line naming the provider, retries at the next turn end, and makes no Claude request (AC8)
- `buildSummaryRequest` accepts both the `SessionMessage` and API message shapes with the same serialization (AC1, AC2)

### T010: Offered tools for routed subagents

**File(s)**: `src/tools/supplement-schemas.ts`, `src/tools/offered-tools.ts`, `src/routing/router.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `SUPPLEMENT_TOOL_SCHEMAS` holds `SubagentHandback`'s schema, copied from Claude Code 2.1.310's own tool definition as a live session sends it, with its source version recorded; the generated registry and the supplement merge, and the generated entry wins on a clash (AC3, FR8)
- The offered names are the captured names, then tools named by `tool_reference` blocks in the loop's `ToolSearch` results, then `SubagentHandback` when `e.agentId` is set and the tool listing names it, deduplicated; a name without a schema is still skipped and debug-logged (AC3, FR8)

### T011: Person approval

**File(s)**: `src/permissions/person-approval.ts`, `src/permissions/policy.ts`, `src/permissions/tool-check.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- With `approver` `person`, `askPerson` asks through `$.ui.ask` with the model, tool and an input summary cut to 300 characters; `Allow` → `allow`, anything else or a rejection → `deny`, each with the design's nmg-router reason (AC6, FR7)
- With a `host` approver or none, `askPerson` denies with the reason that says how to allow the call, without asking (AC6)
- Questions run one at a time; a call aborted while it waits is denied without a question; the question and answer never enter a routed request (AC6)

### T012: Live probes on the current host

**File(s)**: `specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions/verification-report.md`
**Type**: Verify
**Depends**: T009, T010, T011
**Acceptance**:
- A live routed session on the fake provider crosses the mod threshold: the debug log shows no `source=compact` request to Anthropic, the next routed request carries the summary and only the newer messages, and a later `/compact` summarizes on the provider (AC2, AC8)
- A routed subagent calls `SubagentHandback`, and its report reaches the Claude main loop (AC3)
- In auto mode with `server-classifier-off`, a routed Bash call shows nmg-router's question; Allow runs it and Deny refuses it, with no "classifier gave no verdict" error (AC6)

### T013: Tests for the amended behavior

**File(s)**: `tests/compaction/routed-view.test.ts`, `tests/compaction/auto-trigger.test.ts`, `tests/tools/offered-tools.test.ts`, `tests/routing/subagents.test.ts`, `tests/permissions/person-approval.test.ts`, `tests/permissions/tool-check.test.ts`
**Type**: Create
**Depends**: T006, T009, T010, T011
**Acceptance**:
- AC2/AC8: crossing the threshold sends one summarization request to the provider and none to Anthropic; the next routed request starts with the summary and carries only the messages after the cut; a second crossing carries the earlier summary as `prior`; a shortened transcript drops the view; compaction after a view summarizes the view plus the newer messages and drops it; a failed in-place summary logs one line and retries at the next turn end
- AC3: a routed subagent step offers `SubagentHandback` and a tool loaded through `ToolSearch`; the main loop is not offered `SubagentHandback`; the fake handback delivers the report to the caller
- AC6: server-off and an undecided classifier each ask the person; Allow → `allow`, Deny and dismissal → `deny`; a host approver and no approver deny without a question; parallel calls are asked one at a time; no routed auto-mode path returns `ask`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature tasks |
| #4 | 2026-10-26 | Amended T003, T004, T006, T007 and T008; added T009–T013 for the in-place summary (H1), routed subagent tools (H2), person approval (H3) and the free-text row (M1) |
