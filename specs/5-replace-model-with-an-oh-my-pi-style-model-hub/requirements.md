# Requirements: Replace /model with an oh-my-pi-style model hub

**Issue**: #5
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## User Story

**As a** developer who switches models during a session
**I want** `/model` to open one hub listing Claude and every routed provider's models, with search, capabilities and prices
**So that** I can pick any model as I do in oh-my-pi and keep my conversation

## Background

The hub follows oh-my-pi's model hub, minus roles:
- **Sidebar:** "All models", then a Claude entry, then one entry per provider with its model count. Providers without credentials come after the others, dimmed. Disabled providers are hidden.
- **Rows:** `provider/id`, a ✓ on the current model, context window, price per million tokens in/out or `free`, and measured speed when known.
- **Detail line:** name · context · max out · price · reasoning · vision.
- **Search and order:** fuzzy search over `provider/id`, ranked by match quality, then recent use. The default order is recently used, then provider, then newest version.
- **Keys:** Tab or arrow keys move focus, and Esc clears the search and then closes. A provider's models refresh the first time its entry is opened in a session.

The mods API has no way to set the model, so the hub switches by running Claude Code's own `/model <id>`. A hook's 10-second budget counts the time spent waiting on a pane, so the hook opens the hub and returns at once, and picks are handled by the pane's closures. Panes receive no raw keys, so F5 cannot be bound; Esc closes a pane through `ui.close`, which the hub may refuse while a search is active.

Claude Code only auto-discovers model ids containing "claude", so routed ids also need `modelPicker` rows in the user's settings file. That setting takes `{ options: [{ model, label?, description?, behavesAs? }], replaceBuiltInOptions? }`. The highest-precedence source that defines it wins outright, so the mod merges its rows into the user's own.

The hub's view model, its entry sources and the settings-row sync are separate parts behind small interfaces. oh-my-pi's sources are the reference for each part, and none of its code is copied.

The catalog, login, routed turns (with speed metrics) and routed compaction exist.

## Acceptance Criteria

### AC1: Hub layout

**Given** stored logins for OpenCode Go and Codex, and xAI not logged in
**When** the user runs `/model` with no arguments
**Then** a hub opens with "All models", a Claude entry with the built-in Claude lineup, OpenCode Go and Codex entries with model counts, and then a dimmed xAI entry

### AC2: Rows and details

**Given** the hub is open on a provider
**When** a row is highlighted
**Then** rows show id, a ✓ on the current model, context window, price or `free`, and speed when measured, and the detail line shows name, context, max out, price, reasoning and vision

### AC3: Search and order

**Given** the hub is open
**When** the user types `kimi`
**Then** matching models across providers are listed by match quality and then recent use, and sidebar entries with no matches are dimmed and cannot be chosen

### AC4: Selection switches the model

**Given** a conversation on a Claude model
**When** the user selects `opencode-go/kimi-k3.1-pro`, and later a Claude model
**Then** each selection runs Claude Code's own `/model` switch for that id and keeps the conversation

### AC5: Unauthenticated provider

**Given** the dimmed xAI entry is highlighted
**When** the user presses Enter
**Then** the pane says xAI has no credentials, previews its bundled catalog models and offers "Log in to xAI"; choosing it starts xAI's login flow, and after a successful login the hub reopens on xAI

### AC6: Arguments, refresh and Esc

**Given** `/model opus` or `/model opencode-go/kimi-k3.1-pro`
**When** the command runs
**Then**:
- it switches directly through `next(e)` without opening the hub;
- inside the hub, opening a provider's entry for the first time in a session refreshes that provider's models;
- Esc clears a non-empty search first, and closes the hub when the search is empty.

### AC7: Smaller context window

**Given** a transcript larger than a routed model's context window
**When** the user selects that model
**Then**:
- its row showed a "context too large" mark;
- the session is compacted first and then switched;
- a compaction that is skipped or fails leaves the current model in place with a notice.

### AC8: Settings rows

**Given** discovered routed models
**When** the catalog refreshes
**Then** `modelPicker.options` in the user's settings file holds one provider-labeled row per enabled routed model, the user's other rows and settings are kept unchanged, `replaceBuiltInOptions` is not set by the mod, and the Claude lineup is kept

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A `command.run` hook for `model` that opens the hub with no arguments and passes arguments through to `next(e)` | Must |
| FR2 | Hub sidebar, rows, detail line, search, order, focus, first-open refresh and Esc behavior as described | Must |
| FR3 | Selection switches through Claude Code's own `/model` command | Must |
| FR4 | Login hand-off for providers without credentials | Must |
| FR5 | Recent-use history per model in `$.store`, stored without credentials | Must |
| FR6 | `modelPicker` rows in the user settings file kept in sync with the enabled catalog, merged with the user's own rows | Must |

## Out of Scope

- Model roles and role cycling
- A separate compact `/switch` picker
- An F5 or other hotkey refresh

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #5 | 2026-10-25 | Initial feature spec |
