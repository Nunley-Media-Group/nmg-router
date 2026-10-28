# Tasks: Hide providers without a login from the /model hub

**Issue**: #38
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## Implementation Tasks

### T001: Drop the locked state from the hub's sources and view model

**File(s)**: `src/hub/sources.ts`, `src/hub/hub-state.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2: `SourcesInput.providers` and `CatalogSourceInput` have no `locked` field, `HubSource` has no `isLocked()`, and `bundledRows()` and the `BUNDLED_METADATA` import are removed from `src/hub/sources.ts`.
- FR2: `HubState` has no `view`, `SidebarEntry` has no `locked`, `HubView` has no `mode` or `locked`, `rowsOf(ALL_SCOPE)` lists every source's rows, `orderedSources()` orders Claude first then providers A–Z, and `withScope()` / `withQuery()` set no view.

### T002: Remove the locked view and in-hub login from the drawing

**File(s)**: `src/hub/hub-view.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR2, AC6: `lockedChildren()` and `HubActions.login` are removed; `drawHub()` always draws the list; `focusableKeys()` and `homeKey()` never return `"login"`.

### T003: Hide providers without a stored login when the hub builds its lists

**File(s)**: `src/hub/hub-controller.ts`, `src/login/pane.ts`, `src/login/login-command.ts`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR1, FR3, FR4: `rebuild()` passes to `hubSources()` only enabled providers whose login kind is `none` or whose `services.credentials.list(id)` returns at least one entry, and it runs on every `open()`.
- FR2: the controller's `login()`, `loginPane`, `loginHold`, `loggingIn()` and their branches in `draw()`, `refusesClose()` and `keepRing()` are removed, as is the `loginToProvider` / `createPaneController` import.
- FR2: `PaneSite` and the `lent` handling in `createPaneController()` are removed so the controller always draws in the login pane; `/login` and `/logout` behave as before. The `loginToProvider` comment in `src/login/login-command.ts` no longer mentions the model hub.
- `npm run typecheck` passes.

### T004: Update hub unit tests for the removed locked state

**File(s)**: `tests/hub/hub-state.test.ts`, `tests/hub/hub-view.test.ts`, `tests/hub/model-command.test.ts`, `tests/hub/login-handoff.test.ts`, `tests/routing/images.test.ts`, `tests/support/hub-harness.ts`
**Type**: Modify | Delete
**Depends**: T003
**Acceptance**:
- Tests build sources and state without `locked` or `view`; the locked-view, login-button and in-hub login tests are removed, and `tests/hub/login-handoff.test.ts` is deleted.
- AC2: a `tests/hub/hub-state.test.ts` sidebar test shows "All models", Claude, then the providers A–Z, none dimmed while not searching.
- `npm test` passes.

### T005: Prove provider visibility through the hub controller

**File(s)**: `tests/hub/provider-visibility.test.ts`, `tests/support/hub-harness.ts`, `tests/hub/settings-rows.test.ts`
**Type**: Create | Modify
**Depends**: T004
**Acceptance**:
- AC1: with `xai` (api-key) having no stored login, the opened hub's `scopes` options have no `xai`, and no `xai/` row appears in "All models" or in a search for "xai".
- AC2: with one logged-in api-key provider and one provider whose login kind is `none` (the harness gains a way to declare one), the `scopes` options are `all`, `claude` and both providers, and both providers' catalog models are listed.
- AC3: after the stubbed `credentials.list` starts returning a login for `xai` in the same harness, the next `/model` open lists `xai` and its catalog models.
- AC4: after the stubbed `credentials.list` stops returning `opencode-go`'s login, the next `/model` open has no `opencode-go` entry.
- AC5: with a stored login for a provider whose catalog status is not `ok` but whose cached models remain, the hub lists the provider and those models.
- AC6: with no login-requiring provider logged in, the `scopes` options are only `all` and `claude`, the drawn text has no "has no credentials", no "Log in to" text and no `login` key, and the rows are the Claude lineup.
- FR5: a `tests/hub/settings-rows.test.ts` test syncs from a catalog whose `xai` entry has no models and asserts no `xai/` picker row is written.
- `npm test` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #38 | 2026-10-27 | Initial feature tasks |
