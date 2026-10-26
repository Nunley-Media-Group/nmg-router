# Requirements: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-26
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
- Each routed model's context window is in the provider catalog. No documented setting gives a non-Claude model id its window, so the mod checks the threshold itself after each main-loop turn.
- `$.session.compact()` runs every hook except the calling plugin's own, then core. Verified live on Claude Code 2.1.310: a compaction the mod starts skips the mod's `session.compact` hook, and Claude's summarizer sends the routed transcript to Anthropic. The mod therefore never starts compaction itself. When the threshold is reached, it summarizes the routed conversation for the provider on its own.

**Subagents:**
- `turn.step` fires for subagent requests with `agentId` and the step's `model`, and `$.session.messages({ as: "api", agentId })` reads that agent's transcript.
- A subagent delivers its report by calling the deferred tool `SubagentHandback`. The generated tool schemas don't declare it, and tools loaded through `ToolSearch` aren't in the captured tool names. Verified live on 2.1.310: a routed subagent answered but could not hand back its report.

**Auto mode:**
- Bash calls from a routed model got no verdict from the server-side permission classifier and were blocked.
- The `tool.check` hook can return allow, ask or deny. Its `next(e)` returns Claude Code's own verdict, naming the settings rule when one decided.
- A hook's `ask` in auto mode still goes past the server classifier, and that classifier's block refuses the call. Verified live on 2.1.310: the fail-closed "classifier unavailable" verdict denied a routed Bash call that the mod answered with `ask`. A routed call that needs a person's decision is therefore put to the person by the mod itself, through `$.ui.ask`, and answered as `allow` or `deny`. `tool.check`'s `approver` says whether a person can be asked.
- `tool.check` names the call's `tool_use_id` but not its model, so routed calls are recognised by the tool ids the routed `turn.step` emitted.
- `$.model.classify` classifies on a Claude model. `$.session.authorize()` reports whether a first-party Anthropic login is present, as an opaque handle, without exposing the credential.
- A plugin `userConfig` row that has `options` must also have a default among them or be `required`. A required row with no value stops the hooks module from loading, so the permissions row is free text that names the two modes.

Compaction reuses the routed exchange from #3, and the permission policy is a strategy selected by a `/config` row. oh-my-pi's sources are the reference for each part, and none of its code is copied.

Routed turns work for the main loop. Compaction goes to Claude, subagent steps lack per-agent model tracking, and routed Bash calls are blocked in auto mode.

## Acceptance Criteria

### AC1: Routed compaction

**Given** a routed model is selected and Claude Code compacts (`/compact`, the engine's threshold, or another plugin's `$.session.compact()`)
**When** `session.compact` fires
**Then**:
- the summary is produced by the selected routed model through its provider, with any `/compact` instructions included;
- the conversation is replaced by one summary message;
- no request goes to Anthropic;
- with a Claude model selected, the hook calls `next(e)` unchanged.

### AC2: Context window and in-place summary

**Given** a routed model whose catalog context window is 128000 tokens
**When** a main-loop turn ends with the routed context at or above the threshold
**Then**:
- the threshold is `128000 - max(floor(0.15 × 128000), 16384)` = 108800 tokens;
- the mod summarizes the conversation so far on the routed model through its provider;
- the next routed request carries that summary followed by only the messages after the summarized point;
- the mod never calls `$.session.compact()`, and no request goes to Anthropic.

### AC3: Subagents by their own model

**Given** the main loop on Claude with a subagent on `opencode-go/glm-5.3`, and the main loop on a routed model with a subagent on Claude
**When** each subagent's steps fire
**Then**:
- the routed subagent is answered by its provider from its own transcript and captured system prompt;
- the routed subagent is offered `SubagentHandback` and any tool its transcript loaded through `ToolSearch`, so its report reaches the caller;
- the Claude subagent passes through with `next(e)`;
- a routed subagent's compaction uses its own model;
- subagent steps do not change the main status line.

### AC4: Auto-mode permission setting

**Given** the mod's `/config` row for routed auto-mode permissions is unset
**When** the session holds a first-party Anthropic login
**Then**:
- the effective mode is `claude-classifier`, and without such a login it is `server-classifier-off`;
- a set row value of `claude-classifier` or `server-classifier-off` always wins, and any other value reads as unset;
- the hooks module loads with the row unset.

### AC5: Claude classifier mode

**Given** mode `claude-classifier`, auto mode on, and a routed model's Bash call that no rule settles
**When** `tool.check` fires
**Then**:
- an `allow` or `deny` from a classification on a Claude model is the verdict;
- an `ask` label, a failed classification or an unlabelled one is put to the person, as in AC6;
- the classification is never text or tool output in the routed conversation.

### AC6: Person decides routed calls

**Given** auto mode on and a routed model's call that needs a person's decision (every such call in mode `server-classifier-off`, and an undecided classification in mode `claude-classifier`)
**When** `tool.check` fires
**Then**:
- where a person can be asked, the mod asks them in Claude Code's own question dialog, naming the routed model, the tool and its input;
- the answer becomes `allow` or `deny` with a reason naming nmg-router, so no server classifier verdict is needed;
- a dismissed question, or a session where nobody can be asked, gives `deny` with a reason that names nmg-router and says how to allow the call.

### AC7: Rules and Claude steps unchanged

**Given** either mode
**When** a call matches an allow or deny rule, is settled by Claude Code's own check, comes from a Claude model, or runs outside auto mode
**Then** the hook returns Claude Code's own verdict unchanged

### AC8: In-place summary failure and later compaction

**Given** a routed main loop that has an in-place summary, or whose provider fails while summarizing in place
**When** the provider fails, or Claude Code later compacts the main loop
**Then**:
- a failed in-place summary leaves the provider's view unchanged, shows one line naming the provider, retries at the next turn end, and does not fall back to Claude;
- a later compaction summarizes the in-place summary plus the messages after it, not the whole transcript, and the in-place summary is then dropped;
- a compaction whose provider fails answers `{ skip }` with a notice naming the provider, leaves the conversation unchanged, and does not fall back to Claude.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A `session.compact` hook, with a `.catch` handler, that summarizes on the selected (or the agent's) routed model, with no Claude fallback | Must |
| FR2 | The routed model's catalog context window drives a mod-side threshold, checked after each main-loop turn, that summarizes in place for the provider; the mod never calls `$.session.compact()` | Must |
| FR3 | Per-step routing by `model` and `agentId`, with per-agent transcripts, per-agent model tracking and system prompts | Must |
| FR4 | A free-text `/config` row that accepts `claude-classifier` and `server-classifier-off`, defaults by first-party login presence, and never stops the module loading | Must |
| FR5 | A `tool.check` hook for routed calls in auto mode; classifier verdicts only; rules and core verdicts kept | Must |
| FR6 | Only the presence of the login handle is read; the handle and credential are never used or stored | Must |
| FR7 | A routed call that needs a person's decision in auto mode is asked by the mod and answered `allow` or `deny`, never left as a hook `ask` | Must |
| FR8 | Routed requests offer `SubagentHandback` in a subagent loop and the tools a loop loaded through `ToolSearch`, each with a known schema | Must |

## Out of Scope

- Session title generation on routed models
- Permission behavior outside auto mode
- Changing which model a subagent definition picks
- Keeping recent messages verbatim after a compaction Claude Code runs (the in-place summary keeps them only in the provider's view)
- A context-window threshold for subagent transcripts beyond the engine's own
- Fencing the routed tool input inside the classification text (follow-up)
- A context window for `auth: "none"` custom providers whose catalog never refreshes (follow-up)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature spec |
| #4 | 2026-10-26 | Amended after live verification on 2.1.310: in-place summary replaces the mod-started compaction (H1), routed subagents get `SubagentHandback` and `ToolSearch`-loaded tools (H2), the mod asks the person instead of a hook `ask` (H3), and the permissions row is free text (M1) |
