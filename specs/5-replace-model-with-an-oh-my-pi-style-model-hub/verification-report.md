# Verification Report: Replace /model with an oh-my-pi-style model hub

**Date**: 2026-10-26
**Issue**: #5
**Reviewer**: Claude Code (nmg-sdlc verify worker, run aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d)
**Scope**: Implementation verification against the Approved spec
**Verification head**: 50322fa55c4bf37aa9bb2776e44e9f13c672f30f

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.2 |

### Implementation Status: Pass
**Total Issues**: 1 (1 Low)

The registered gate is green at `50322fa`: typecheck, 517/517 tests and `claude plugin validate .` all pass. Commit `50322fa` fixes H8. When Esc clears a search, the ring now moves to the search field (`src/hub/hub-controller.ts:262`), and a new unit test covers the case with a row highlighted (`tests/hub/model-command.test.ts:150`).

The live herdr run confirms the fix in all three cases that failed before: letters typed after Esc went into the hub search, and the main prompt stayed empty. It also confirms every acceptance criterion again, including switching between Claude and routed models in both directions with the conversation kept.

---

## Issue Scope

- Active issue: #5
- Spec: `specs/5-replace-model-with-an-oh-my-pi-style-model-hub`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC8]; FR [FR1–FR6]; tasks [T001–T009]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":5,"specPath":"specs/5-replace-model-with-an-oh-my-pi-style-model-hub","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d` returned `ok: true` with `ceiling: null` and wrote `.nmg-sdlc/verification/5.json`. Coverage: declared 3, recorded 3, `complete: true`, with nothing missing, duplicated or unknown. Identity: head `50322fa5`, tree clean.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.typecheck` | builtin.command | yes | passed (`tsc --noEmit` exit 0) |
| `repository.tests` | builtin.command | yes | passed (517 tests) |
| `repository.plugin-manifest` | builtin.command | yes | passed |

No `repository.nmg-sdlc-smoke` validation is declared, so no smoke result is required.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Hub layout | Pass | Live: `[ All models (43) ]`, `[ Claude (5) ]`, `[ Fake Local (1) ]`, `[ OpenCode Go (37) ]`, `[ ClinePass (0) ]`, `[ OpenAI Codex (1) ]`, `[ xAI (1) ]`, with the locked entries after the logged-in ones. Unit: `tests/hub/hub-state.test.ts` |
| AC2 | Rows and details | Pass | Live: `[ opencode-go/kimi-k3.1-pro ✓  8t/s ]`, `[ opencode-go/glm-5.1  203k  $1.4/4.4 ]`, `[ opencode-go/kimi-k3  1.049m  $3/15  50t/s ]`. Highlighting `kimi-k3` showed `Kimi K3 · 1.049m ctx · 131k out · $3/15 per M · reasoning · vision`. The ✓ was gone from `kimi-k3.1-pro` while Opus was the current model |
| AC3 | Search and order | Pass | Live: `kimi` gave `All models (4)` and `OpenCode Go (4)`, with the recently used `kimi-k3.1-pro` first. Entries with no matches were drawn as plain text without brackets (`Claude (0)`, `xAI (0)`) |
| AC4 | Selection switches the model | Pass | Live: hub pick `Opus` → host `Switch model?` → Yes → `❯ /model opus ⎿ Set model to Opus 5.5`, and Opus recalled `PELICAN`. Hub pick `kimi-k3.1-pro` → `Switch model?` → Yes → `❯ /model opencode-go/kimi-k3.1-pro ⎿ Set model to OpenCode Go · kimi-k3.1-pro`, and the routed model recalled `PELICAN` |
| AC5 | Unauthenticated provider | Pass | Live: `xai`, Tab, Enter → `xAI has no credentials.` / `1 model in catalog:` / `xai/grok-4.6` / `[ Log in to xAI ]`. Enter → in the pane: `Log in to xAI` / `xAI API key: (paste or type the key)` / `[ Cancel ]`. Esc → `⏺ nmg-router: Login cancelled.` and the locked view again, and Enter started the login again. The hub reopening on xAI after a successful login needs the user's own xAI key. Following the steering, this step is handed to the user. Unit: `tests/hub/login-handoff.test.ts:15` "reopens the hub on the provider after a successful login" |
| AC6 | Arguments, refresh and Esc | Pass | Live: `/model opencode-go/kimi-k3.1-pro` switched directly with no hub. Esc with a non-empty search cleared it and kept the pane, and Esc with an empty search closed the hub. After an Esc-clear with a row highlighted, the next letters went into the search in 3 of 3 tries (H8 fixed). The first-open refresh has no visible live signal. Unit: `tests/hub/model-command.test.ts:78` |
| AC7 | Smaller context window | Pass | Live: the row showed `fakelocal/fake-small ⊘ context>20k  20k`. Enter kept `opencode-go/kimi-k3.1-pro` and the pane, which drew `Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window.` Unit: no `$.session.compact()` call (`tests/hub/model-command.test.ts`) |
| AC8 | Settings rows | Pass | Live: the settings file had no `modelPicker` before the run. At session start the mod wrote 38 provider-labeled `modelPicker.options` rows (for example `OpenCode Go · deepseek-v4.1-flash`), and `replaceBuiltInOptions` stayed unset. Core took the rows in the first session (AC4) |

### Interactive evidence (herdr)

Tab `verify-5` (91 columns). Ran `herdr agent start verify-5 --kind claude --pane <pane> -- --plugin-dir .` on Claude Code v2.1.311. There was no startup dialog and no hook or plugin load error. `~/.claude/settings.json` was backed up before the run and restored byte-identical after it (`cmp` clean).

1. Session start: the settings file gained 38 `modelPicker.options` rows, and `replaceBuiltInOptions` stayed unset.
2. `/model opencode-go/kimi-k3.1-pro` → `⎿ Set model to OpenCode Go · kimi-k3.1-pro and saved as your default for new sessions`. Then `Remember the word PELICAN. Reply only OK.` → `⏺ OK`.
3. `/model` → `│ [ All models (43) ]  Type to search ⏎ submit │ … │ [ opencode-go/kimi-k3.1-pro ✓  8t/s ] │ … │ [ fakelocal/fake-small ⊘ context>20k  20k ] │`.
4. H8 repro A: `g l m`, ↓, Esc, wait 3 s, `h a i` → `│ [ All models (1) ]  hai  ⏎ submit │ … [ Haiku ]`, main prompt `❯` empty.
5. H8 repro B: Esc, `q w e n`, ↓↓, Esc, wait 4 s, `z` → `│ All models (0)  z  ⏎ submit │ … No matching models.`, main prompt `❯` empty.
6. H8 repro C (after a refused pick): Esc, `f a k e`, ↓, Enter → `Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window.`. Then Esc, wait 2 s, `o p u s` → `│ [ All models (5) ]  opus  ⏎ submit │ … [ Opus ]`, main prompt `❯` empty.
7. ↓, Enter on `Opus` → host `Switch model?` → Yes → `❯ /model opus ⎿ Set model to Opus 5.5`. `What word did I ask you to remember?` → `⏺ PELICAN`.
8. `/model`, `k i m i` → `kimi-k3.1-pro` first and no ✓. ↓×4 to `kimi-k3` showed the detail line. ↑×3, Enter → `Switch model?` → Yes → `❯ /model opencode-go/kimi-k3.1-pro`. The same question → `⏺ PELICAN` (routed, conversation kept).
9. `/model`, `x a i`, Tab, Enter → the locked xAI view. Enter → the in-pane key prompt. No key was typed. Esc → `⏺ nmg-router: Login cancelled.` and the locked view. Enter → the key prompt again. Esc cancelled it, Esc cleared the search, and Esc closed the hub.

The session was ended with `/exit`, and the tab was closed with `herdr tab close`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Formatting, version order, recent use, Claude lineup | Complete | Verified live through rows and the detail line |
| T002 | Hub sources and pure state | Complete | |
| T003 | Hub view | Complete | |
| T004 | Hub controller and model command | Complete | Esc-clear now puts the ring on the search field (H8 fixed) |
| T005 | Settings-row sync and catalog listener | Complete | |
| T006 | Hook wiring | Complete | |
| T007 | Fake engine extensions | Complete | |
| T008 | Hub tests | Complete | Now include the Esc-clear test with a row highlighted |
| T009 | Settings-row tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The view model, view, controller, sources and settings sync each live in a separate module |
| Open/Closed | 4 | New sources plug in through `HubSource`. `rowLoaded` is injected into `handleModelCommand`, with a default |
| Liskov Substitution | 4 | Both sources satisfy `HubSource` |
| Interface Segregation | 4 | `HubHost` and `SettingsHost` take only the parts of `HostPort` they need |
| Dependency Inversion | 4 | Nothing under `src/` touches `$`. `hooks/register.ts` builds the ports |

### Security — 4
No credential is written. The rows hold only the model id, label and a context/price description. Model ids go to `$.command.run` as arguments, never to a shell. No credential was typed during the run, and the settings file was restored afterwards.

### Performance — 4
The row confirmation polls `$.settings.read` every 250 ms for up to 2 s, and only when core has not loaded the row. In the live session, switches showed no visible delay.

### Testability — 4
Pure state, view and settings logic are well covered. The fake engine tracks which site holds the keyboard, and the Esc-clear test now covers the case with a row highlighted.

### Error Handling — 4
Refused picks and cancelled logins give feedback in place. If a row never loads, the switch logs that and still passes to core.

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: 517 tests pass
- `claude plugin validate .`: pass
- Interactive herdr run: pass (all ACs exercised; the xAI login with a real key is handed to the user)

---

## Fixes Applied

None in this run. Commit `50322fa` fixed H8 before this run, and this run confirmed the fix live.

---

## Remaining Issues

| ID | Severity | AC | Finding | Suggested direction |
|----|----------|----|---------|---------------------|
| L1 | Low | AC1 | A plain-text screen read cannot show whether locked entries are dimmed. Zero-count entries do drop their button brackets. | No change needed if the host draws `dimColor` on buttons. |

The user still has to check one step: log in to xAI with their own key from the hub, and confirm that the hub reopens on xAI and that `xai/grok-4.6` can be picked.

---

## Recommendations

1. Run the xAI login check above with the user's own key before release.
