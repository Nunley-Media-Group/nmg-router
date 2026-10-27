# Tasks: Name ClinePass models by their model, not their id, in the picker and status line

**Issue**: #33
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/31-fix-clinepass-http-400-on-paid-models-and-arrow-key-navigation-in-the-model-hub/

## Implementation Tasks

### T001: Drop id-shaped names in ClinePass's list

**File(s)**: `src/providers/builtin/cline-pass.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `nameOf(entry, id)` returns `undefined` for a name equal to `id`.
- A free model with no name is named `<id after the last slash> (free)`.

### T002: Regression test

**File(s)**: `tests/catalog/discovery.test.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1, AC2: a list naming `cline-pass/qwen3.7-max` and `cline-free/solar-mini4` by their ids yields the names `qwen3.7-max` and `solar-mini4 (free)`.
- AC3: the existing fixture test keeps `DeepSeek V4 Flash (free)`.

### T003: Version and changelog

**File(s)**: `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `VERSION`, `package.json` and `.claude-plugin/plugin.json` are `0.10.3`, and `CHANGELOG.md` has a `0.10.3` Fixed entry naming #33.
