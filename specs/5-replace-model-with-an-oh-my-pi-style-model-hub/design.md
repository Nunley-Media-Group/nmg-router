# Design: Replace /model with an oh-my-pi-style model hub

**Issue**: #5
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Overview

A `command.run` hook on `model` handles the command:
- **With arguments:** it records recent use and `return next(e)`.
- **Bare:** it opens the hub pane `nmg-router-models` and returns `{}` at once.

From then on the hub lives in pane closures:
- `onPress`, `onInput` and the `ui.focus` and `ui.close` hooks update a pure `HubState`, and the pane is redrawn from it.
- A model pick closes the pane, compacts first when the transcript exceeds the model's window, and runs `$.command.run({ command: "model", args: id })`. The same hook then passes that run to Claude Code's own `/model`.

SOLID parts:
- **Entry sources (`HubSource`):** the Claude lineup source and the catalog source give the hub its sidebar entries and rows. A new kind of entry is a new source.
- **View model (`hub-state.ts`):** sorting, search, counts and the detail line are pure functions over rows and state.
- **Rendering (`hub-view.ts`):** draws the state with the `Box`, `Text`, `Input` and `Button` elements only.
- **Settings sync (`settings-rows.ts`):** a catalog listener writes the `modelPicker` rows.

oh-my-pi's sources are the reference for each part (paths relative to `@oh-my-pi/`, 17.3.7). No code is copied.

## Architecture

```text
hooks/register.ts               adds: on("command.run",{command:"model"}); on("ui.render",{component:"Pane",requestId:"nmg-router-models"});
                                on("ui.focus"); on("ui.close")  → src/hub/
src/hub/model-command.ts        handleModelCommand($, e, next, services)
src/hub/hub-controller.ts       open($, initialScope?), press/focus/input/close handlers, pick(), refresh-on-first-open
src/hub/hub-state.ts            pure: HubState, sidebar(), rows(), detail(), applySearch(), sortRows()
src/hub/hub-view.ts             pure: HubState → pane element tree
src/hub/sources.ts              HubSource interface; claudeSource (lineup); catalogSource (#2 catalog)
src/hub/claude-lineup.ts        CLAUDE_LINEUP: default, opus, sonnet, haiku, fable (alias, label)
src/hub/format.ts               formatTokens (128k, 1m), formatPrice ($0.6/2.4 | free), formatSpeed (118t/s)
src/hub/version-order.ts        extractVersionNumber(id), recency suffix compare
src/hub/recent.ts               $.store "models.recent": record(id), order()
src/hub/settings-rows.ts        syncModelPickerRows($, models, providers) → writes the user settings file
src/catalog/catalog.ts          (modify) onChange(listener) after each refresh and logout
src/login/login-command.ts      (modify) export loginToProvider($, providerId, services) for the hand-off
src/login/fuzzy.ts              (reuse) fuzzyFilter
```

### Reference map (oh-my-pi, reference only)

| Part | oh-my-pi reference |
|------|--------------------|
| Sidebar build, locked/unlocked order, counts | `pi-coding-agent/src/modes/components/model-hub.ts` (sidebar entries, `disabledProviders`) |
| Rows, meta columns, detail line | `pi-coding-agent/src/modes/components/model-browser.ts` (`formatContext`, `formatCostPair`, `formatTps`, detail facts) |
| Search ranking | `pi-coding-agent/src/modes/components/model-browser.ts` (score buckets, then MRU), `pi-tui/src/fuzzy.ts` |
| Default order and versions | `pi-coding-agent/src/modes/components/model-browser.ts` (`sortModelItems`, `extractVersionNumber`) |
| Esc, focus, auto-refresh once per process | `pi-coding-agent/src/modes/components/model-hub.ts` (key handling, `autoRefreshedProviders`) |
| Locked provider view and login hand-off | `pi-coding-agent/src/modes/components/model-hub.ts` (no-credentials view), `pi-coding-agent/src/modes/controllers/selector-controller.ts` (reopen on the provider) |
| Context too large | `pi-coding-agent/src/modes/components/model-picker.ts`, `model-browser.ts` (`isOverContext`), `selector-controller.ts` (compact, then switch) |
| Recent use | `pi-coding-agent/src/session/agent-storage.ts` (`model_usage`) |
| Number format | `pi-utils/src/format.ts` (`formatNumber`) |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `handleModelCommand($, e, next)` | `command.run` for `model` | `CommandRunResult` | `e.args.trim()` non-empty → `recent.record(arg)`, `return next(e)`; empty → `hub.open($)`, `return {}` |
| `HubSource` | — | `{ id, label, isLocked(), rows(): HubRow[], refresh?() }` | `claudeSource` is never locked and has no refresh; `catalogSource(provider)` is locked when the provider has no indexed credential |
| `HubRow` | — | `{ id, switchArg, provider, name, contextWindow?, maxOutput?, price?, reasoning?, vision?, speed? }` | `switchArg` is the alias for Claude rows and `provider/model` for routed rows |
| `HubState` | — | `{ scope: "all" \| sourceId, query, highlighted?, refreshing: Set<sourceId>, refreshed: Set<sourceId>, view: "list" \| "locked", currentModel, contextTokens }` | Kept by the controller; every change redraws |
| `hub.pick($, row)` | highlighted row | — | Closes the pane; if `row.contextWindow` is below `contextTokens`, `await $.session.compact()` first, and on `{ skip }` or a rejection shows `$.ui.toast("Kept <current>: compaction did not finish.")` and stops; then `$.command.run({ command: "model", args: row.switchArg })` |
| `syncModelPickerRows($, models)` | enabled routed `CatalogModel[]` | — | See Data / Storage |
| `loginToProvider($, providerId)` | provider id | `{ ok: boolean, text }` | #2's API-key or OAuth flow for one provider, as `/login` runs it after a pick |

## Hub Layout and Behavior

**Pane:** id `nmg-router-models`, title `Models`, opened with `focus`, `closeOnEscape` and `holdToasts`. The body is a row `Box`: a sidebar column (width 26) beside a main column.

**Sidebar** (`Button`s, top to bottom):
- `All models` with the total row count.
- `Claude` with the lineup count.
- Unlocked catalog providers A–Z, each with its model count.
- Locked providers A–Z, drawn with `dimColor`. Pressing one opens the locked view.
- Disabled providers are absent (the catalog already hides them).
- **While searching:** each count becomes the match count, and an entry with zero matches is drawn as dim `Text`. Text is not focusable, so it cannot be chosen. If the active scope drops to zero matches, the scope becomes `all`.

**Main column:**
- A search `Input` (key `search`, autoFocus, placeholder `Type to search`).
- One `Button` per row.
- A detail `Text`.
- A dim footer `Text`: `Enter switch · Tab/↑↓ move · type to search · Esc clear/close`.

**Row label** (`Text tabular`):
- The left part is `<provider>/<id>` in the `all` scope and `<id>` in a provider scope, followed by ` ✓` on the current model.
- When `contextTokens > contextWindow`, ` ⊘ context>128k` is added (formatted window), and the row is dimmed.
- The right-aligned columns are context (`128k`), price (`$0.6/2.4` or `free`) and speed (`118t/s` from #3's `metrics.speed`, when present).
- Claude rows show their label and no price or context.

**Current model:** `$.session.model()` is read at open. A routed row matches its exact id. A Claude row matches when the model equals its alias or contains `-<alias>-` (`claude-opus-5-5` ↔ `opus`).

**Detail line** for the highlighted row (from `ui.focus` on a row button): `name · <context> ctx · <max out> out · <price> per M · reasoning · vision`. A fact without a value is left out, and `reasoning` and `vision` appear only when true.

**Default order** (`sortRows`):
1. Recent use, newest first.
2. Provider (Claude first, then A–Z).
3. `extractVersionNumber(id)`, descending. It tries `(\d+\.\d+)`, then `(\d{1,2})-(\d{1,2})`, then `(\d+)` after `^` or `-`/`_`, else 0.
4. Ids ending `-latest` or `-YYYYMMDD` before others.
5. Id A–Z.

**Search:**
- `fuzzyFilter` from `src/login/fuzzy.ts` over `"<provider>/<id>"`.
- Results are grouped into score buckets (`Math.round(score / 10)`), best first, and ordered by recent use inside a bucket.
- With no matches, the main column reads `No matching models.`

**Focus:** Tab and the arrow keys move through the focus ring (engine behavior). `ui.focus` sets `highlighted` when the focused element is a row button.

**First-open refresh:** when a provider entry becomes the scope for the first time in a session, `catalog.refresh(id)` runs.
- While it runs, the count reads `…`.
- When it ends, the rows are rebuilt.
- A failure keeps the cached rows and the provider's status as #2 records it.

**Esc:** the `ui.close` hook for `nmg-router-models` with origin `person`:
- refuses the close and clears the query when the query is non-empty;
- lets the close through otherwise.

**Locked view:**
- Pressing a dimmed provider shows `<Provider> has no credentials.` and the dim header `<n> models in catalog:`.
- Below that, the bundled metadata model ids for that provider (`src/providers/metadata.ts`) are listed dimmed.
- A focused button reads `Log in to <Provider>`. Pressing it closes the hub and runs `loginToProvider`. When it returns `ok`, the hub reopens with scope `<provider>`.

**Recent use** (`$.store` `models.recent`): `{ [switchArg]: epochMs }`, keeping the 50 newest. It is recorded on every `/model <arg>` the hook sees, which includes every hub pick. It holds no credential.

## Data / Storage Changes

**Settings rows** (`settings-rows.ts`):

The settings path is `$CLAUDE_CONFIG_DIR/settings.json` when that variable is set. Otherwise it is `$HOME/.claude/settings.json`, or `%USERPROFILE%\.claude\settings.json` on Windows.

On each catalog `onChange`:
1. Read the file. A missing file counts as `{}`.
2. If its JSON does not parse to an object, write nothing and `$.ui.log` `nmg-router left settings.json unchanged: it is not valid JSON.` once per session.
3. Build `options`: the user's existing rows whose `model` does not parse to a catalog provider id (kept in order), then one mod row per enabled routed model:
   - `model` is `<provider>/<model>`;
   - `label` is `<Provider name> · <model name>`;
   - `description` is `<context> ctx · <price>` with missing parts left out.
4. Keep every other key of the file and of `modelPicker`. Leave `replaceBuiltInOptions` as the user set it, and never add it.
5. Write `JSON.stringify(doc, null, 2) + "\n"` with `$.fs.write`, but only when the result differs from the current text.

The rows hold ids, names and numbers only, never a credential.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Return from the hook at once; picks in pane closures | Selected | A hook awaiting a pane pick overruns its 10 s budget |
| Switch via `$.command.run({ command: "model", args })` | Selected | No mod API sets the model; the built-in switch keeps the conversation |
| Write `~/.claude/settings.json` | Selected | User choice; persistent rows honored as user settings |
| `settings.read` overlay | Rejected | User preferred persistent rows |
| F5 or a hotkey button for refresh | Rejected | No raw keys reach panes; the user chose first-open auto-refresh |
| `Select` for rows | Rejected | No per-option styling or highlight events; `Button`s with `ui.focus` give both |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #5 | 2026-10-25 | Initial feature design |
