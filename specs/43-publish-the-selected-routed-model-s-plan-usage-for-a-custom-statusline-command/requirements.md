# Requirements: Publish the selected routed model's plan usage for a custom statusLine command

**Issue**: #43
**Date**: 2026-10-28
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage/

## User Story

**As a** developer who uses a custom Claude Code `statusLine` command and switches between Claude and routed provider models
**I want** nmg-router to publish the selected routed model's provider plan usage in a form my status-line command can read
**So that** my own status line shows the selected provider's usage windows instead of Claude's rate limits when a routed model is selected

## Background

A custom `statusLine` command receives Claude Code's status-line JSON on stdin, with `session_id` and `model.id`. Its `rate_limits` fields come from Anthropic responses only, and a mod cannot add to that JSON: `$.session.usage()` and `session.measure` only read the engine's figures, a routed `turn.step` result has no rate-limit field, and `$.ui.status` is the only status text a mod sets. nmg-router already keeps the shown routed status as one `RoutedStatus` object with the provider's latest usage report (`src/routing/router.ts`, `src/usage/monitor.ts`). This feature writes that state to a per-session JSON snapshot the status-line command reads.

## Acceptance Criteria

### AC1: A routed step publishes the selected provider's windows

**Given** a routed model from a provider with a usage source is selected, and that provider has a usage reading for the active account
**When** a routed main-loop step completes
**Then** nmg-router writes `<config dir>/nmg-router/status/<session id>.json`, where `<config dir>` is `CLAUDE_CONFIG_DIR` when set and otherwise `~/.claude` (`%USERPROFILE%\.claude` on Windows)
**And** the file is JSON `{ "version": 1, "sessionId", "provider", "model", "windows": [{ "label", "usedPercent", "resetsAt"? }] }` with the windows in the provider's order and `resetsAt` in epoch milliseconds

### AC2: A reading that arrives later updates the snapshot

**Given** a routed step's snapshot was written before that provider's background usage read finished
**When** the read finishes while the same provider and account are still shown without an error
**Then** the snapshot is rewritten with the new windows

### AC3: Switching providers never shows the earlier provider's windows

**Given** the snapshot shows provider A's windows
**When** a routed main-loop step on provider B completes, including when provider A's read finishes afterwards
**Then** the snapshot names provider B and its model with only provider B's windows, or an empty `windows` list when provider B has no reading or no usage source

### AC4: Errors and Claude steps clear the windows

**Given** a snapshot with windows for the current session
**When** a routed main-loop step fails, or a Claude main-loop step runs
**Then** a failed step writes the routed model's snapshot with an empty `windows` list, and a Claude step writes `{ "version": 1, "sessionId", "windows": [] }` with no provider or model

### AC5: The snapshot never affects the routed step

**Given** writing the snapshot fails (no home directory, a refused write or permission change)
**When** a routed main-loop step completes
**Then** the step's answer and the `$.ui.status` line are unchanged and no error is shown

### AC6: The snapshot holds no secret and only valid session ids name a file

**Given** any routed step or usage read
**When** the snapshot is written
**Then** it contains no token, key, account name or account id; on macOS and Linux the directory is `0700`, the file `0600`, and the file is replaced atomically so a reader never sees a partial file; a session id outside `[A-Za-z0-9_-]{1,128}` writes no file

### AC7: Subagent steps leave the snapshot alone

**Given** a snapshot for the main loop
**When** a subagent step, routed or Claude, runs
**Then** the snapshot is not rewritten

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A snapshot writer builds the version-1 snapshot from a session id, provider id, model id and usage report, under `<config dir>/nmg-router/status/<session id>.json`. | Must |
| FR2 | The router publishes the snapshot wherever it sets or redraws the main-loop status line, and writes empty windows on a main-loop failure and a cleared snapshot on a Claude main-loop step, keeping the existing guards on late readings. | Must |
| FR3 | Writes run one at a time in call order, never change a step's answer, and swallow every failure. | Must |
| FR4 | On macOS and Linux the directory is created `0700`, the file is written to a unique temporary path, set `0600`, and moved over the snapshot; on Windows the file is written in place. | Must |
| FR5 | The README documents the snapshot path, fields and matching rule: a status-line command uses it only when `sessionId` and `model` match its `session_id` and `model.id`. | Must |

## Out of Scope

- Changes to Claude Code's own status-line JSON input.
- Usage for providers without a usage source (xAI, ClinePass): their snapshot has empty windows.
- Usage for a provider's inactive accounts.
- Deleting snapshot files of ended sessions.
- Shipping or editing the person's own status-line script.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #43 | 2026-10-28 | Initial feature spec |
