# Root Cause Analysis: Name ClinePass models by their model, not their id, in the picker and status line

**Issue**: #33
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/31-fix-clinepass-http-400-on-paid-models-and-arrow-key-navigation-in-the-model-hub/, specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Root Cause

ClinePass's `/ai/cline/recommended-models` now names every paid model by its id (`"name":"cline-pass/qwen3.7-max"`), and some free models too (`cline-free/nemotron-3.5-super-vl`). `parseClinePassList` in `src/providers/builtin/cline-pass.ts` keeps any non-empty name, so `buildModels` in `src/catalog/catalog.ts` uses it ahead of its own fallback (`raw.name ?? metadata?.name ?? model`). `rowFor` in `src/hub/settings-rows.ts` then labels the row `ClinePass · cline-pass/qwen3.7-max`, which Claude Code shows on `/model` and passes to the status line as `model.display_name`.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/providers/builtin/cline-pass.ts` | `nameOf`, `bareOf`, `parseClinePassList` | Drops an id-shaped name; names a nameless free model by its bare id |

## Fix Strategy

- `nameOf(entry, id)` returns `undefined` when the name equals the entry's id. A paid model then takes the catalog's existing fallback: its metadata name, else the bare model.
- A free model with no name is named `bareOf(id) (free)`, the id after its last `/`.

## Blast Radius

- Only ClinePass's parser changes. Models with real names keep them. Model ids, request ids and routing are unchanged.
- The picker rows in `settings.json` are rewritten on the next catalog refresh, as for any name change.

## Regression Risk

| Risk | Mitigation |
|------|------------|
| ClinePass later sends real names | They differ from the id and are kept (AC3) |
