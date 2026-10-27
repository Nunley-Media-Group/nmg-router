# Defect Report: Name ClinePass models by their model, not their id, in the picker and status line

**Issue**: #33
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/31-fix-clinepass-http-400-on-paid-models-and-arrow-key-navigation-in-the-model-hub/, specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Reproduction

1. Log in to ClinePass and run `/model cline-pass/qwen3.7-max`.
2. Claude Code answers `Set model to ClinePass · cline-pass/qwen3.7-max`, and a status line that shows `model.display_name` reads `ClinePass · cline-pass/qwen3.7-max`.
3. ClinePass's `/ai/cline/recommended-models` lists the model as `{"id":"cline-pass/qwen3.7-max","name":"cline-pass/qwen3.7-max"}`: every paid model is named by its id.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The picker row names the provider and the model: `ClinePass · qwen3.7-max`. |
| **Actual** | The row repeats the provider and shows the raw id: `ClinePass · cline-pass/qwen3.7-max`. |

## Acceptance Criteria

### AC1: A paid model named by its id is named by its model

**Given** ClinePass lists `cline-pass/qwen3.7-max` with the name `cline-pass/qwen3.7-max`
**When** the catalog refreshes
**Then** the model is named by its metadata name, else `qwen3.7-max`, and its picker row reads `ClinePass · qwen3.7-max`

### AC2: A free model named by its id is named by its bare model

**Given** ClinePass lists `cline-free/solar-mini4` in its free list with the name `cline-free/solar-mini4`
**When** the catalog refreshes
**Then** it is named `solar-mini4 (free)`

### AC3: A real name is kept

**Given** ClinePass lists a model with a name that is not its id, such as `DeepSeek V4 Flash`
**When** the catalog refreshes
**Then** the name is kept as listed, with ` (free)` on a free model

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | ClinePass's list parser treats a name equal to the entry's id as no name, so the catalog falls back to the metadata name, else the bare model | Must |
| FR2 | A free model with no name is named by its id after the last `/`, followed by ` (free)` | Must |

## Out of Scope

- Other providers' names.
- Display names (such as `Qwen 3.7 Max`) that neither ClinePass nor the bundled metadata gives.
