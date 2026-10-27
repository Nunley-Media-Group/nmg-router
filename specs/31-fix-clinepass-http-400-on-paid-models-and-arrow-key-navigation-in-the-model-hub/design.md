# Root Cause Analysis: Fix ClinePass HTTP 400 on paid models and arrow-key navigation in the /model hub

**Issue**: #31
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/, specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Root Cause

1. ClinePass lists paid models as `cline-pass/<model>` (`clinePass` list of `/ai/cline/recommended-models`). `toModelId` in `src/models/model-id.ts` strips that duplicate prefix so the `/model` id is `cline-pass/<model>`, and `buildModels` in `src/catalog/catalog.ts` stores `model: <model>`. The router sends `parsed.model` (`src/routing/router.ts`, `routed`) and the summary sends the same part (`src/compaction/summary-request.ts`). ClinePass's API takes only `modelType/model` ids (Cline API docs: the `model` field is `provider/model`), so a bare id gets HTTP 400 `invalid model format`. Free ids (`nvidia/…`, `cline-free/…`) carry their own prefix and work as listed; `cline-pass/cline-free/solar-mini4` answers 404.
2. The hub drew every model row and sidebar entry as a `Button`. Claude Code's `Pane` docs: while a pane holds the keyboard, "Tab walks its elements, a Button's `hotkey` presses it, the arrows scroll". So once the body was taller than the pane, ↑↓ raised `ui.scroll` and moved the whole body, sidebar included. ← is not a pane key, so it reached Claude Code's own binding and left the session for the agents list (`bg-leftarrow` in the debug log). The pane's scroll offset survives a close, so a reopen kept the sidebar scrolled away. Only a `Select` keeps every arrow while it holds the ring ("arrows move, Enter picks").

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/providers/types.ts` | `ProviderPlugin` | Gains optional `requestModel` |
| `src/providers/builtin/cline-pass.ts` | `clinePassRequestModel`, `clinePass` | ClinePass's request id rule |
| `src/routing/router.ts` | `send` | Applies `requestModel` before encoding |
| `src/hub/hub-view.ts` | `drawHub`, `drawSidebar`, `listChildren`, `focusableKeys`, `homeKey` | Selects instead of buttons; previews away from the ring |
| `src/hub/hub-state.ts` | `HubState`, `HubView`, `hubView` | `selected` replaces `highlighted` |
| `src/hub/hub-controller.ts` | `keepRing`, `selectScope`, `submit`, `focused`, `draw` | Ring home on the models; redraw on ring moves |
| `hooks/register.ts` | `ui.focus` hook comment | Wording only |

## Fix Strategy

ClinePass request id:

- `ProviderPlugin.requestModel?: (model: string) => string`. In `send`, the router encodes `{ ...request, model: plugin.requestModel?.(request.model) ?? request.model }`. One place covers routed steps and summaries.
- ClinePass: `clinePassRequestModel(model)` returns `cline-pass/${model}` when `model` has no `/`, else `model`. The rule needs no catalog change, so catalogs cached before the fix send the right id without a refresh, and no `/model` picker row changes.

Hub navigation:

- The sidebar is one `Select` (`scopes`, options = sidebar entries, value = scope, `onSelect` = `selectScope`). The models are one `Select` (`models`, options = visible rows keyed `row:<switchArg>`, value = `HubView.selected`, `autoFocus`, `onSelect` = `pick`). The search `Input` loses `autoFocus`; document order stays search, models, scopes.
- A focused Select windows its own options (`… N more`), so the body never overflows and the host never scrolls it.
- `drawHub(elements, view, actions, ring)`: a Select away from the ring draws the options after its value as dim text (all providers; at most 8 models, then `… N more`). `focused` stores the ring and redraws when it changes.
- `HubView.selected` is the current model's row key, else the first row's; `detail` describes it. `HubState.highlighted` is removed.
- `selectScope` sets the ring to `models`; `keepRing` falls back to `homeKey(view)` (login, else models, else search). Esc that clears a search still puts the ring on the search field.

## Blast Radius

- Other providers define no `requestModel`, so their requests are unchanged.
- The hub's state functions (`withScope`, `withQuery`, `sidebarEntries`, `searchRows`) are unchanged apart from `highlighted`. The login drawn in the hub's pane, the over-context refusal and the first-open refresh are unchanged.

## Regression Risk

| Risk | Mitigation |
|------|------------|
| A ClinePass paid id that already has a slash after stripping | ClinePass's paid list has none; such an id is sent as listed, as before |
| A host that draws a Select differently | Verified live in a herdr session; tests assert the tree shape |
