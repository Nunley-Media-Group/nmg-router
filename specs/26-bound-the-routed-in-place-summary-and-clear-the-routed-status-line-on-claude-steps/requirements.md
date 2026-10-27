# Defect Report: Bound the routed in-place summary and clear the routed status line on Claude steps

**Issue**: #26
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions/

## Reproduction

In-place summary:

1. Select a routed model whose provider accepts a request and then sends nothing.
2. Run turns until the routed context reaches the mod's auto-compaction threshold and the in-place summary starts.
3. Send another prompt. The routed step never starts.

A routed step sent while any in-place summary is still running waits for it. Claude Code gives a `turn.step` hook 10 seconds of its own time, and only `$` calls do not count against it. So a summary that runs longer than about 10 seconds makes the waiting step fail with `nmg-router failed to answer with <provider>.` and the status `<provider> error: internal`, even with a 120-second deadline on the summary.

Status line:

1. Run a turn on a routed model. The routed status line appears, for example `fakelocal/fake-small · thinking unsupported`.
2. Switch to a Claude model with `/model` and run a turn.
3. The routed status line is still shown.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The in-place summary gives up 120 seconds after its request is sent. It leaves the conversation as it was, logs one transcript line naming the provider and saying the summary timed out, and retries at the next turn end. A routed step never waits for a running summary: it answers at once with the routed view as it is, and a summary that finishes later applies from the next routed step. A main-loop step on a Claude model clears nmg-router's status line. |
| **Actual** | A stalled provider holds the next routed step until the person interrupts it. A summary that runs longer than about 10 seconds makes the waiting routed step fail with an `internal` error. The routed status line stays visible on Claude turns. |

## Acceptance Criteria

### AC1: A stalled summary times out

**Given** a routed model over the auto-compaction threshold whose provider accepts the summary request and then sends nothing
**When** 120 seconds pass after the summary request is sent
**Then** the request is aborted, the routed view and conversation are unchanged, one transcript line names the provider and says the summary timed out, and the next routed main-loop step runs without waiting further

### AC6: A routed step does not wait for a running summary

**Given** an in-place summary that is still running, whether or not its provider will ever answer
**When** a routed main-loop step starts
**Then** the step answers with the routed view as it is when the step starts, without waiting for the summary, and does not fail because of it. When the summary later finishes, the next routed main-loop step sends it

### AC2: A timed-out summary retries

**Given** an in-place summary that timed out
**When** the next main-loop turn ends with the context still over the threshold
**Then** the in-place summary is attempted again

### AC3: A summary within the deadline is unaffected

**Given** a provider that returns the summary within 120 seconds
**When** the in-place summary runs
**Then** the summary is kept in the routed view exactly as before, and no timeout line is logged

### AC4: Claude steps clear the routed status line

**Given** a main-loop step that ran on a routed model and set the routed status line
**When** a later main-loop step runs on a Claude model
**Then** nmg-router clears its status line

### AC5: Routed and subagent status behavior is preserved

**Given** a main loop on a routed model, or a subagent step on any model
**When** the step completes or fails
**Then** a routed main-loop step still sets the model and thinking status, or the error status, as before, and a subagent step leaves the status line as it is

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The in-place summary's provider call is aborted 120 seconds after it is sent, and the summary stops waiting on it then, whichever transport is in use | Must |
| FR2 | A timed-out summary goes through the existing summary-failure path: the view is unchanged, one line names the provider and the timeout (`<provider> could not summarize this conversation (timed_out); it will be retried at the next turn end.`), and the summary is retried at the next turn end. Text received before the deadline is discarded | Must |
| FR3 | A main-loop step on a Claude model clears nmg-router's status line if a routed step set it. Subagent steps never change the status line | Must |
| FR4 | A routed main-loop step never waits for a running in-place summary. It reads the routed view as it is when the step starts. A summary that finishes later is kept and applies from the next routed main-loop step. This replaces the rule in spec #4 that a routed main-loop step first awaits a pending summary | Must |

## Out of Scope

- A deadline for `/compact` summaries started by Claude Code, which already follow the host's abort signal
- Making the 120-second deadline configurable
- Changing the status line's wording on routed steps

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #26 | 2026-10-27 | Initial defect report |
| #26 | 2026-10-27 | Add AC6 and FR4: a routed step no longer waits for a running summary, because the wait counts against the 10-second `turn.step` hook budget |
