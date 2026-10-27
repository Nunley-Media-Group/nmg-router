# Verification Report: Fix ClinePass HTTP 400 on paid models and arrow-key navigation in the /model hub

**Date**: 2026-10-27
**Issue**: #31
**Reviewer**: Claude Code
**Scope**: Defect fix

---

## Executive Summary

Paid ClinePass models were requested by their bare model id, which ClinePass refuses with HTTP 400 `invalid model format. Expected format: modelType/model`. ClinePass now gives `requestModel`, and the router sends `cline-pass/<model>` for an id without a slash and any other id as listed. The `/model` hub drew its rows and providers as buttons, so the arrows scrolled the pane (and the sidebar with it) and ← left the session for the agents list. The providers and the models are now one `Select` each, which keeps every arrow. Both fixes were checked live.

<!-- nmg-sdlc-issue-scope: {"issueNumber":31,"specPath":"specs/31-fix-clinepass-http-400-on-paid-models-and-arrow-key-navigation-in-the-model-hub","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Issue Scope

- Active issue: #31
- Spec: `specs/31-fix-clinepass-http-400-on-paid-models-and-arrow-key-navigation-in-the-model-hub`
- Delivery: AC1–AC5; FR1–FR5; T001–T004; SCN001–SCN005

## Commands

- `npm run typecheck` — passed
- `npm test` — passed (66 files, 554 tests)
- `claude plugin validate .` — passed with the same warning count as `main`

## Acceptance Criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | passed | `tests/routing/request-model.test.ts`: a step on `cline-pass/qwen3.7-plus` from a catalog cached with model `qwen3.7-plus` posts `"model":"cline-pass/qwen3.7-plus"` to `https://api.cline.bot/api/v1/chat/completions`. Live: ClinePass answered `qwen3.7-plus` with HTTP 400 `invalid model format`, and `cline-pass/qwen3.7-plus` with HTTP 200 and a stream (`model":"alibaba/qwen3.7-plus"`) |
| AC2 | passed | `tests/routing/request-model.test.ts`: `cline-free/solar-mini4` is posted unchanged. Live: `nvidia/nemotron-3.5-lightning-free` and `cline-free/solar-mini4` answered HTTP 200; `cline-pass/cline-free/solar-mini4` answered HTTP 404 |
| AC3 | passed | Live herdr session, 91 columns: ↓ ×10 moved the `models` Select's highlight and windowed it (`… 28 more`); ← left the session in place (no `bg-leftarrow` in the debug log). Before the fix the same keys logged `ui.scroll Pane nmg-router-models (person) by 1` and `[PERF:bg-leftarrow-start]` |
| AC4 | passed | Live: every provider showed on open and after Esc and reopen; Tab reached the providers, ↓↓↓ and Enter showed OpenCode Go (37) with the ring on its models. `tests/hub/model-command.test.ts` covers the ring after a provider pick and the previews |
| AC5 | passed | Live: `/model`, ↑↑↑ to Haiku and Enter changed the status line to `model: Haiku`. `tests/hub/model-command.test.ts` covers the switch through `/model` and the over-context refusal |

## Behavior for changed paths

- Behavior for `src/providers/builtin/cline-pass.ts`: `clinePassRequestModel` adds `cline-pass/` to an id without a slash — covered.
- Behavior for `src/routing/router.ts`: `send` encodes the plugin's `requestModel` id — covered.
- Behavior for `src/hub/hub-view.ts`: draws `Select` `models` and `scopes`, no buttons, previews away from the ring — covered.
- Behavior for `src/hub/hub-state.ts`: `selected` is the current row, else the first — covered.
- Behavior for `src/hub/hub-controller.ts`: ring home on `models`, provider pick moves the ring to `models` — covered.

## Known Gaps

- The detail line describes the selected row (the current model, else the first), not the row the arrows highlight: a `Select` reports a pick, not a highlight move.
- ClinePass was checked live with direct requests using the same headers and ids the mod sends, not through a routed turn of the installed mod.
