# Requirements: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## User Story

**As a** developer running long, agentic sessions on routed models
**I want** compaction, subagents and auto-mode permissions to work when a routed model is involved
**So that** routed sessions behave like Claude sessions without falling back to Claude

## Background

**Compaction:**
- Compaction goes to Claude even while a routed model is selected.
- The `session.compact` hook receives the trigger, any `/compact` instructions, the optional `agentId` and the messages. It can answer a summary of its own as `{ messages }`, or `{ skip }` to leave the conversation unchanged with a one-line notice.
- A `session.compact` hook that throws is skipped and Claude's summarizer runs, so routed failures are caught and answered with `{ skip }`.
- Each routed model's context window is in the provider catalog. No documented setting gives a non-Claude model id its window, so the mod checks the threshold itself after each main-loop turn and starts compaction with `$.session.compact()`.

**Subagents:** `turn.step` fires for subagent requests with `agentId` and the step's `model`, and `$.session.messages({ as: "api", agentId })` reads that agent's transcript.

**Auto mode:**
- Bash calls from a routed model got no verdict from the server-side permission classifier and were blocked.
- The `tool.check` hook can return allow, ask or deny. Its `next(e)` returns Claude Code's own verdict, naming the settings rule when one decided. A hook's `ask` goes to the person rather than to the classifier.
- `tool.check` names the call's `tool_use_id` but not its model, so routed calls are recognised by the tool ids the routed `turn.step` emitted.
- `$.model.classify` classifies on a Claude model. `$.session.authorize()` reports whether a first-party Anthropic login is present, as an opaque handle, without exposing the credential.

Compaction reuses the routed exchange from #3, and the permission policy is a strategy selected by a `/config` row. oh-my-pi's sources are the reference for each part, and none of its code is copied.

Routed turns work for the main loop. Compaction goes to Claude, subagent steps lack per-agent model tracking, and routed Bash calls are blocked in auto mode.

## Acceptance Criteria

### AC1: Routed compaction

**Given** a routed model is selected and compaction triggers (`/compact`, the engine's threshold, or the mod's own threshold)
**When** `session.compact` fires
**Then**:
- the summary is produced by the selected routed model through its provider, with any `/compact` instructions included;
- the conversation is replaced by one summary message;
- no request goes to Anthropic;
- with a Claude model selected, the hook calls `next(e)` unchanged.

### AC2: Context window and failure

**Given** a routed model whose catalog context window is 128000 tokens
**When** a main-loop turn ends with the routed context at or above the threshold, or the provider fails while summarizing
**Then**:
- the threshold is `128000 - max(floor(0.15 × 128000), 16384)` = 108800 tokens, and reaching it starts compaction;
- on failure, compaction answers `{ skip }` with a notice naming the provider, leaves the conversation unchanged, and does not fall back to Claude.

### AC3: Subagents by their own model

**Given** the main loop on Claude with a subagent on `opencode-go/glm-5.3`, and the main loop on a routed model with a subagent on Claude
**When** each subagent's steps fire
**Then**:
- the routed subagent is answered by its provider from its own transcript and captured system prompt;
- the Claude subagent passes through with `next(e)`;
- a routed subagent's compaction uses its own model;
- subagent steps do not change the main status line.

### AC4: Auto-mode permission setting

**Given** the mod's `/config` row for routed auto-mode permissions is unset
**When** the session holds a first-party Anthropic login
**Then** the effective mode is `claude-classifier`, and without such a login it is `server-classifier-off`; a set row value always wins

### AC5: Claude classifier mode

**Given** mode `claude-classifier`, auto mode on, and a routed model's Bash call that no rule settles
**When** `tool.check` fires
**Then** the verdict comes from a classification on a Claude model and is used only as allow, ask or deny, never as text or tool output in the routed conversation; a failed or unlabelled classification gives `ask`

### AC6: Server classifier off mode

**Given** mode `server-classifier-off` and auto mode on
**When** a routed model's Bash call needs a verdict
**Then** the hook answers `ask` with a reason naming nmg-router, so Claude Code's own permission dialog decides it instead of a missing server verdict

### AC7: Rules and Claude steps unchanged

**Given** either mode
**When** a call matches an allow or deny rule, is settled by Claude Code's own check, comes from a Claude model, or runs outside auto mode
**Then** the hook returns Claude Code's own verdict unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A `session.compact` hook, with a `.catch` handler, that summarizes on the selected (or the agent's) routed model, with no Claude fallback | Must |
| FR2 | The routed model's catalog context window drives a mod-side compaction threshold checked after each main-loop turn | Must |
| FR3 | Per-step routing by `model` and `agentId`, with per-agent transcripts, per-agent model tracking and system prompts | Must |
| FR4 | A `/config` row with values `claude-classifier` and `server-classifier-off`, defaulting by first-party login presence | Must |
| FR5 | A `tool.check` hook for routed calls in auto mode; classifier verdicts only; rules and core verdicts kept | Must |
| FR6 | Only the presence of the login handle is read; the handle and credential are never used or stored | Must |

## Out of Scope

- Session title generation on routed models
- Permission behavior outside auto mode
- Changing which model a subagent definition picks
- Keeping recent messages verbatim after a routed compaction
- A context-window threshold for subagent transcripts beyond the engine's own

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature spec |
