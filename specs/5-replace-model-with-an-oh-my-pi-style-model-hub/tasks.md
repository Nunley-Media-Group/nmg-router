# Tasks: Replace /model with an oh-my-pi-style model hub

**Issue**: #5
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Implementation Tasks

### T001: Formatting, version order, recent use and Claude lineup

**File(s)**: `src/hub/format.ts`, `src/hub/version-order.ts`, `src/hub/recent.ts`, `src/hub/claude-lineup.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `formatTokens`, `formatPrice` and `formatSpeed` produce `128k`, `1m`, `$0.6/2.4`, `free` and `118t/s` as the design states (AC2)
- `extractVersionNumber` and the recency-suffix comparison follow the design; `recent` keeps the 50 newest ids in `models.recent` (AC3, FR5)
- `CLAUDE_LINEUP` lists the `default`, `opus`, `sonnet`, `haiku` and `fable` aliases with labels (AC1)

### T002: Hub sources and pure state

**File(s)**: `src/hub/sources.ts`, `src/hub/hub-state.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `claudeSource` and `catalogSource` implement `HubSource`; sidebar order, counts, locked dimming and disabled hiding follow the design (AC1)
- `sortRows`, search buckets with recent-use tie-breaks, zero-match entries, current-model matching, the over-context mark and the detail line follow the design (AC2, AC3, AC7)

### T003: Hub view

**File(s)**: `src/hub/hub-view.ts`
**Type**: Create
**Depends**: T002
**Acceptance**:
- Renders the sidebar, search input, row buttons with tabular labels, detail line, footer and locked view using only `Box`, `Text`, `Input` and `Button`; zero-match entries render as non-focusable dim `Text` (AC1, AC2, AC3, AC5)

### T004: Hub controller and model command

**File(s)**: `src/hub/hub-controller.ts`, `src/hub/model-command.ts`, `src/login/login-command.ts`
**Type**: Create
**Depends**: T003
**Acceptance**:
- `/model` with arguments records recent use and returns `next(e)`; bare `/model` opens the hub and returns `{}` (AC6, FR1)
- A pick closes the pane and runs `$.command.run({ command: "model", args })`; an over-context pick is refused: the pane stays open, nothing is switched or compacted, and a toast names the current model (AC4, AC7, FR3)
- The first time each provider is opened in a session, it is refreshed; Esc refuses the close and clears a non-empty query, and closes otherwise (AC6, FR2)
- The locked view's login button runs `loginToProvider` (exported from `src/login/login-command.ts`) and reopens the hub on that provider after success (AC5, FR4)

### T005: Settings-row sync and catalog listener

**File(s)**: `src/hub/settings-rows.ts`, `src/catalog/catalog.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The catalog notifies `onChange` listeners after each refresh and logout; the sync writes the merged `modelPicker.options` as the design states, keeps unrelated keys and user rows, never sets `replaceBuiltInOptions`, writes only on change, and leaves invalid JSON untouched (AC8, FR6)

### T006: Hook wiring

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T004, T005
**Acceptance**:
- Registers `command.run` for `model`, `ui.render` for the `nmg-router-models` pane, `ui.focus` and `ui.close`, and the settings-row listener, all delegating to `src/` (FR1, FR2, FR6)

### T007: Fake engine extensions

**File(s)**: `tests/support/fake-engine.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Fakes record `$.command.run`, `$.ui.open`/`close`/`toast`, `$.session.model`, `$.session.usage`, `$.session.compact` calls (recorded, so a test shows the hub makes none) and `$.fs.write` to the settings path, and can dispatch `ui.focus`, `ui.close` and button presses to the hub

### T008: Hub tests

**File(s)**: `tests/hub/format.test.ts`, `tests/hub/hub-state.test.ts`, `tests/hub/hub-view.test.ts`, `tests/hub/model-command.test.ts`
**Type**: Create
**Depends**: T006, T007
**Acceptance**:
- AC1: with OpenCode Go and Codex indexed and xAI not, the sidebar reads All models, Claude (5), OpenCode Go (n), Codex (n), then dimmed xAI
- AC2: a highlighted routed row shows its id, ✓ when current, `128k`, `$0.6/2.4` or `free`, and speed when `metrics.speed` has it; the detail line shows name, context, max out, price, reasoning and vision
- AC3: query `kimi` lists only kimi models across providers in score-bucket then recent order; zero-match entries render as non-focusable dim text
- AC4: picking `opencode-go/kimi-k3.1-pro` and then `opus` runs `$.command.run({ command: "model", args })` with each id, and the hook passes each run to `next(e)`
- AC5: pressing dimmed xAI shows the no-credentials text, the bundled xAI model ids and the login button; a successful faked login reopens the hub scoped to xAI
- AC6: `/model opus` returns the `next(e)` result without `ui.open`; the first open of a provider calls `catalog.refresh` once per session; Esc with a query clears it and keeps the pane, and Esc with no query closes it
- AC7: with `contextTokens` above a row's window the row carries the mark; picking it runs no `$.session.compact()` and no `$.command.run`, keeps the pane open and shows the `Kept <current>: ...` toast

### T009: Settings-row tests

**File(s)**: `tests/hub/settings-rows.test.ts`
**Type**: Create
**Depends**: T005, T007
**Acceptance**:
- AC8: after a refresh the settings file holds the user's own rows first, then one `<Provider> · <name>` row per enabled routed model; other keys are unchanged; `replaceBuiltInOptions` is not added; a second identical refresh writes nothing; an unparseable file is not written; no credential appears in the file

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #5 | 2026-10-25 | Initial feature tasks |
| #5 | 2026-10-26 | Amended AC7 (T004, T007, T008): an over-window pick is refused, not compacted, per #4 |
