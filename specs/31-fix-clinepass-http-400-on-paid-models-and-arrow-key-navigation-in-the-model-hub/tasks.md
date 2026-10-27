# Tasks: Fix ClinePass HTTP 400 on paid models and arrow-key navigation in the /model hub

**Issue**: #31
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/, specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Implementation Tasks

### T001: Send ClinePass's listed id

**File(s)**: `src/providers/types.ts`, `src/providers/builtin/cline-pass.ts`, `src/routing/router.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `ProviderPlugin` has optional `requestModel(model: string): string`.
- `clinePassRequestModel("qwen3.7-plus")` is `cline-pass/qwen3.7-plus`; an id with a slash is returned unchanged. `clinePass.requestModel` is that function.
- `send` in `src/routing/router.ts` encodes the request with `plugin.requestModel?.(request.model) ?? request.model`.

### T002: Draw the hub's providers and models as Selects

**File(s)**: `src/hub/hub-view.ts`, `src/hub/hub-state.ts`, `src/hub/hub-controller.ts`, `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- The list view draws no `Button`; it draws `Select` `models` (autoFocus, value `HubView.selected`) and `Select` `scopes` (value = scope), in the order search, models, scopes.
- Away from the ring, `scopes` previews every other provider and `models` previews up to 8 other rows and `… N more`, as dim text.
- `HubView.selected` is the current model's row, else the first; the detail line describes it. `HubState.highlighted` is gone.
- Picking a provider puts the ring on `models`; with no models the ring goes to `search`; the locked view puts it on `login`.

### T003: Regression tests

**File(s)**: `tests/routing/request-model.test.ts`, `tests/hub/hub-view.test.ts`, `tests/hub/model-command.test.ts`, `tests/hub/login-handoff.test.ts`, `tests/support/hub-harness.ts`
**Type**: Create / Modify
**Depends**: T001, T002
**Acceptance**:
- AC1, AC2: a routed step on a ClinePass entry cached with a bare `model` posts `cline-pass/qwen3.7-plus`, and `cline-free/solar-mini4` unchanged.
- AC3, AC4: the hub tree has the two Selects and no buttons; previews follow the ring; a provider pick moves the ring to `models`.
- AC5: a pick in `models` closes the hub and runs `/model <id>`; the over-context refusal is unchanged.

### T004: Version and changelog

**File(s)**: `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- `VERSION`, `package.json` and `.claude-plugin/plugin.json` are `0.10.2`, and `CHANGELOG.md` has a `0.10.2` Fixed entry naming #31.
