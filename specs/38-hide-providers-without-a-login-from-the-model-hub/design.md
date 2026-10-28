# Design: Hide providers without a login from the /model hub

**Issue**: #38
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## Overview

The hub stops building entries for providers it cannot use. `rebuild()` in `src/hub/hub-controller.ts` keeps an enabled provider only when its login kind is `none` or `services.credentials.list(id)` returns at least one stored login, and passes only those providers to `hubSources()`. With no provider ever locked, the locked state is deleted end to end: the sources' `locked` flag and bundled preview rows, the state's `view`, the view model's `mode` and `locked` fields, the drawn locked view, the in-hub login action, and the lent login pane it needed.

## Architecture

`/model` → `HubController.open()` → `catalog.load()` → `rebuild()` → `hubSources()` → `hubView()` → `drawHub()`.

- `rebuild()` runs on every hub open and after a scope refresh, so a `/login` or `/logout` earlier in the session is reflected the next time the hub opens (FR3). It reads stored logins with `services.credentials.list`, which lists stored accounts without resolving them, so an expired or offline credential still counts as a login (FR4) and the provider keeps the cached models the catalog holds for it.
- The settings picker rows (`src/hub/settings-rows.ts`) read `catalog.models()`, and the catalog records a provider with no login as `not-logged-in` with no models (`src/catalog/catalog.ts`), so they are unchanged (FR5).
- `/login` (`src/login/login-command.ts` `handleLogin`) keeps its own picker of every enabled provider and still calls `loginToProvider`; only the hub's call to it is removed.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `rebuild()` in `src/hub/hub-controller.ts` | enabled providers, stored logins | `sources` | Skips a provider whose login kind is not `none` and whose `credentials.list` is empty. |
| `SourcesInput.providers` in `src/hub/sources.ts` | `{ id, name }[]` | `HubSource[]` | Drops the `locked` field. |
| `CatalogSourceInput` / `catalogSource()` | no `locked` | `HubSource` | Always lists the provider's catalog models; `bundledRows()` and the `BUNDLED_METADATA` import are removed. |
| `HubSource` | — | — | Drops `isLocked()`. |
| `HubState` in `src/hub/hub-state.ts` | — | — | Drops `view`. |
| `SidebarEntry` | — | — | Drops `locked`; `dimmed` is true only for a zero-match entry while searching. |
| `HubView` | — | — | Drops `mode` and `locked`. |
| `rowsOf(ALL_SCOPE)` | sources | rows | Lists every source's rows. |
| `orderedSources()` | sources | sources | Claude first, then the providers A–Z by label. |
| `withScope()` / `withQuery()` | state | state | No longer set `view`. |
| `HubActions` in `src/hub/hub-view.ts` | — | — | Drops `login`. |
| `drawHub()` / `focusableKeys()` / `homeKey()` | view | element / keys | Always draw the list; the `"login"` key and `lockedChildren()` are removed. |
| `HubController` | — | — | Removes `login()`, `loginPane`, `loginHold`, `loggingIn()` and the login branches in `draw()`, `refusesClose()` and `keepRing()`. |
| `PaneSite` / `createPaneController()` in `src/login/pane.ts` | — | — | The `lent` site option, used only by the hub, is removed; the controller always draws in the login pane. |

## State and UI Behavior

- The sidebar shows "All models", Claude, then each listed provider A–Z. A hidden provider has no entry, contributes no rows to "All models" or any search, and cannot be chosen as a scope.
- With every login-requiring provider hidden, the sidebar holds only "All models" and Claude, and the list shows the Claude models.
- The hub draws no "has no credentials" text, no bundled preview list, no "Log in to <Provider>" button and no hint that providers are hidden.
- Esc keeps its search-clear-then-close behavior; the login-cancel branch is gone.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Filter providers in `rebuild()` and delete the locked state | Selected | One filter point that already runs on each open; no unreachable code remains. |
| Keep the locked state but never pass locked providers | Rejected | Leaves the locked view, preview rows and lent pane as dead code. |
| Hide providers whose stored credential fails to resolve | Rejected | Out of scope; a stored login keeps its entry and cached models. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #38 | 2026-10-27 | Initial feature design |
