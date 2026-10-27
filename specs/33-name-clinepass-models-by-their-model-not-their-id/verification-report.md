# Verification Report: Name ClinePass models by their model, not their id, in the picker and status line

**Date**: 2026-10-27
**Issue**: #33
**Reviewer**: Claude Code
**Scope**: Defect fix

---

## Executive Summary

ClinePass names every paid model by its id, so the `/model` picker row and the status line read `ClinePass · cline-pass/qwen3.7-max`. ClinePass's list parser now treats a name equal to the id as no name. A paid model then takes the catalog's fallback (metadata name, else the bare model) and reads `ClinePass · qwen3.7-max`; a nameless free model is named by its bare id with ` (free)`.

<!-- nmg-sdlc-issue-scope: {"issueNumber":33,"specPath":"specs/33-name-clinepass-models-by-their-model-not-their-id","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Issue Scope

- Active issue: #33
- Spec: `specs/33-name-clinepass-models-by-their-model-not-their-id`
- Delivery: AC1–AC3; FR1–FR2; T001–T003; SCN001–SCN003

## Commands

- `npm run typecheck` — passed
- `npm test` — passed (66 files, 555 tests)
- `claude plugin validate .` — passed with the same warning count as `main`

## Acceptance Criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | passed | `tests/catalog/discovery.test.ts` "names a model the list names by its id after the bare model": `cline-pass/qwen3.7-max` listed with the name `cline-pass/qwen3.7-max` is named `qwen3.7-max`. Live: ClinePass's public `/ai/cline/recommended-models` names all 15 paid models by their ids |
| AC2 | passed | Same test: `cline-free/solar-mini4` named by its id is named `solar-mini4 (free)` |
| AC3 | passed | `tests/catalog/discovery.test.ts` "reads both lists, strips the prefix once and marks free models": `DeepSeek V4 Flash (free)` is kept |

## Behavior for changed paths

- Behavior for `src/providers/builtin/cline-pass.ts`: `nameOf` drops a name equal to the id; a nameless free model is named by its bare id — covered.

## Known Gaps

- The picker label was not checked in a live session; `rowFor` builds it from the catalog name, unchanged by this fix.
