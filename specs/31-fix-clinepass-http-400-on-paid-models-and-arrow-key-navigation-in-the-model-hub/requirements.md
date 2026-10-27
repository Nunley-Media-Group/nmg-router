# Defect Report: Fix ClinePass HTTP 400 on paid models and arrow-key navigation in the /model hub

**Issue**: #31
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/, specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Reproduction

ClinePass:

1. Log in to ClinePass and select `cline-pass/qwen3.7-plus` (or any paid ClinePass model).
2. Send any prompt.
3. The turn ends with `ClinePass refused the request (HTTP 400).` ClinePass's body is `{"error":"invalid model format. Expected format: modelType/model","success":false}`.

Hub navigation (live session, 91 columns):

1. Run `/model`. The hub shows the provider sidebar and the model rows.
2. Press ↓ several times. The first press moves the ring from the search field to the first row. Every later press scrolls the pane body, and the sidebar scrolls off screen with the rows.
3. Press ←. The session leaves for the agents list, which looks like a crash.
4. Run `/model` again. The pane keeps its scroll offset, so the providers are still off screen.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A ClinePass request names the model as ClinePass listed it. In the hub, ↑↓ move through the models, ← does nothing outside the hub, every provider stays visible, and Tab reaches the providers. |
| **Actual** | Paid ClinePass requests name the bare model and get HTTP 400. In the hub, the arrows scroll the pane instead of moving between rows, the sidebar scrolls away and stays away on reopen, and ← backgrounds the session. |

## Acceptance Criteria

### AC1: A paid ClinePass model is requested with its listed id

**Given** a ClinePass login and a catalog entry `cline-pass/qwen3.7-plus`, whether cached before this fix or listed after it
**When** a routed step runs on `cline-pass/qwen3.7-plus`
**Then** the request names `cline-pass/qwen3.7-plus`

### AC2: A free ClinePass model is requested as listed

**Given** a ClinePass catalog entry whose own id carries a prefix, such as `cline-free/solar-mini4`
**When** a routed step runs on it
**Then** the request names `cline-free/solar-mini4`, unchanged

### AC3: The arrows move through the models

**Given** the hub is open
**When** the person presses ↑ or ↓
**Then** the selection moves between the models listed, the pane does not scroll, and ← leaves the session where it is

### AC4: The providers stay visible and selectable

**Given** the hub is open, or reopened after any navigation
**When** it is drawn
**Then** every provider entry shows in the sidebar; Tab reaches the providers, ↑↓ choose one, and Enter shows its models with the ring on them

### AC5: Enter switches to the chosen model

**Given** a model is selected in the models list
**When** the person presses Enter
**Then** the hub closes and `/model <id>` runs, with the existing over-context refusal unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A provider plugin may give `requestModel(model)`, the id a request names for the model part of a `provider/model` id. The router applies it to every request it sends, routed steps and summaries alike | Must |
| FR2 | ClinePass's `requestModel` returns `cline-pass/<model>` for an id without a slash and any other id unchanged | Must |
| FR3 | The hub draws the providers as one `Select` (`scopes`) and the models as one `Select` (`models`), with no per-row buttons. The ring starts on the models. Tab walks the search field, the models and the providers | Must |
| FR4 | A Select away from the ring draws the options after its selected one as dim text: every provider, and up to 8 models with `… N more` | Must |
| FR5 | The models Select's selected option is the current model's row when listed, else the first row, and the detail line describes that row. Picking a provider moves the ring to the models. Enter in the search field switches to the first row listed. This replaces spec #5's "Tab or arrow keys move focus" key rule and its detail line for the focused row | Must |

## Out of Scope

- Showing a provider's response body in routed error messages: routed errors deliberately name no response body.
- Other providers' model id formats.
- A detail line that follows the arrow highlight: a `Select` reports a pick, not a highlight move.
