# Verification Report: Replace /model with an oh-my-pi-style model hub

**Date**: 2026-10-26
**Issue**: #5
**Reviewer**: Claude Code (nmg-sdlc verify worker, run aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d)
**Scope**: Implementation verification against the Approved spec
**Verification head**: 5ffca43e9e9c428f6e11d6076a7b0ea4381ad004

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.8 |

### Implementation Status: Fail
**Total Issues**: 2 (1 High, 1 Low)

The registered gate is green at `5ffca43`: typecheck, 516/516 tests and `claude plugin validate .` all pass. The live herdr run started from a settings file with no `modelPicker` rows, and it confirms most of the fix commit:

- **H7 fixed (AC4, AC8).** In the first session after the rows were written, `/model opencode-go/kimi-k3.1-pro` switched at once, and the routed model answered.
- **H6 partly fixed (AC6).** After Esc clears a search typed in the search field, the hub keeps the keyboard, and the next letters go into the search. After Esc cancels a login, the hub also keeps the keyboard.

One defect remains:

- **H8, AC6/FR2 (H6 still open in one case).** If a row is highlighted when Esc clears the search, the hub loses the keyboard to the main prompt. The pane stays open, but letters typed next appear in the main prompt (`❯ hai`, `❯ z`, `❯ opus`). This happened in 3 of 3 tries with the row highlighted (queries `fake` after a refused pick, `glm` + ↓, `qwen` + ↓↓). It happened in 0 of 2 tries with the ring on the search field. The new unit test (`tests/hub/model-command.test.ts:135`) covers only the search-field case.

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

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id aeea8b3d-…` returned `ok: true` with `ceiling: null` and wrote `.nmg-sdlc/verification/5.json`. Coverage: declared 3, recorded 3, `complete: true`, with nothing missing, duplicated or unknown. Identity: head `5ffca43e`, tree clean.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.typecheck` | builtin.command | yes | passed (`tsc --noEmit` exit 0) |
| `repository.tests` | builtin.command | yes | passed (64 files, 516 tests) |
| `repository.plugin-manifest` | builtin.command | yes | passed (warnings only: no author, root CLAUDE.md, no icon) |

The registered gate sets no ceiling. The overall status is Fail because of the interactive finding H8.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Hub layout | Pass | Live: `[ All models (43) ]`, `[ Claude (5) ]`, `[ Fake Local (1) ]`, `[ OpenCode Go (37) ]`, `[ ClinePass (0) ]`, `[ OpenAI Codex (1) ]`, `[ xAI (1) ]`, with the locked entries after the logged-in ones. A plain-text read cannot show dimming (L1). Unit: `tests/hub/hub-state.test.ts` |
| AC2 | Rows and details | Pass | Live: `[ opencode-go/kimi-k3.1-pro ✓  18t/s ]`, `[ opencode-go/kimi-k3  1.049m  $3/15  50t/s ]`, `[ opencode-go/glm-5.1  203k  $1.4/4.4 ]`. Highlighting `kimi-k3` showed the detail line `Kimi K3 · 1.049m ctx · 131k out · $3/15 per M · reasoning · vision`. The ✓ followed the current model |
| AC3 | Search and order | Pass | Live: `kimi` gave `All models (4)` and `OpenCode Go (4)`, with only kimi rows and the recently used `kimi-k3.1-pro` first. Zero-match entries became plain text without brackets (`Claude (0)`, `xAI (0)`) |
| AC4 | Selection switches the model | Pass | Live, first session (no rows at startup): `/model opencode-go/kimi-k3.1-pro` → `Set model to OpenCode Go · kimi-k3.1-pro`, then `Remember the word PELICAN` → `OK` (routed). Hub pick `Opus` → host `Switch model?` → Yes → `❯ /model opus ⎿ Set model to Opus 5.5`, and Opus recalled `PELICAN`. Hub pick `kimi-k3.1-pro` → `❯ /model opencode-go/kimi-k3.1-pro ⎿ Set model to OpenCode Go · kimi-k3.1-pro`, and the routed model recalled `PELICAN` (H7 fixed) |
| AC5 | Unauthenticated provider | Partial | Live: Enter on `xAI (1)` → `xAI has no credentials.` / `1 model in catalog:` / `xai/grok-4.6` / `[ Log in to xAI ]`. Enter → in the pane: `Log in to xAI` / `The key is checked against the provider before it is saved.` / `xAI API key: (paste or type the key)` / `[ Cancel ]`. Esc → `⏺ nmg-router: Login cancelled.` and the locked view, with the keyboard still on the hub (Enter started the login again). Reopening on xAI after a successful login needs the user's own xAI key and was not run. Unit: `tests/hub/login-handoff.test.ts` |
| AC6 | Arguments, refresh and Esc | **Fail** | Live: `/model <id>` switched directly with no hub. Esc with a non-empty search cleared it and kept the pane, and Esc with an empty search closed the hub. With the ring on the search field, letters typed after the clear went into the search (`hai ⏎ submit`). With a row highlighted, they went into the main prompt instead (H8). The first-open refresh has no visible live signal. Unit: `tests/hub/model-command.test.ts` |
| AC7 | Smaller context window | Pass | Live: the row showed `fakelocal/fake-small ⊘ context>20k  20k`. Enter kept `opencode-go/kimi-k3.1-pro` and the pane, which drew `Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window.` while a matching toast showed. Unit: no `$.session.compact()` call (`tests/hub/model-command.test.ts`) |
| AC8 | Settings rows | Pass | Live: the pre-run file had no `modelPicker`. At session start the mod wrote 38 provider-labeled `modelPicker.options` rows (e.g. `OpenCode Go · deepseek-v4.1-flash`). `replaceBuiltInOptions` stayed unset. After the run, only `modelPicker` and `model` differed from the backup, and `model` was written by core's `/model` ("saved as your default"). Core took the rows in the same session (AC4) |

### Interactive evidence (herdr)

Tab `verify-5` (pane width 91 columns), `herdr agent start verify-5 --kind claude --pane <pane> -- --plugin-dir .`. Claude Code v2.1.311. There was no startup dialog and no hook or plugin load error. `~/.claude/settings.json` was backed up before the run and restored byte-identical after it (`cmp` clean).

1. Session start: the settings file gained 38 `modelPicker.options` rows, `replaceBuiltInOptions` stayed unset, and no other key changed.
2. `/model opencode-go/kimi-k3.1-pro` → `⎿ Set model to OpenCode Go · kimi-k3.1-pro and saved as your default for new sessions` in the same first session (H7 fixed). `Remember the word PELICAN. Reply only OK.` → `⏺ OK`.
3. `/model` → `│ [ All models (43) ]  Type to search ⏎ submit │ … │ [ opencode-go/kimi-k3.1-pro ✓  18t/s ] │ … │ [ fakelocal/fake-small ⊘ context>20k  20k ] │`.
4. `g l m`, Esc → `All models (43)  Type to search ⏎ submit`. Then `k i m i` → `│ [ All models (4) ]  kimi  ⏎ submit │`, and the main prompt stayed empty (H6 fixed for the search field).
5. ↓×4 to `kimi-k3` → detail `Kimi K3 · 1.049m ctx · 131k out · $3/15 per M · reasoning · vision`. Esc cleared the search, and a second Esc closed the hub.
6. `/model`, `f a k e`, ↓, Enter → the pane drew `Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window.` with a toast, and the model was unchanged. Esc cleared the search. `o p u s` then landed in the main prompt (`❯ opus`) (H8).
7. Controlled repro A: `/model`, `g l m`, Esc, wait 3 s, `h a i` → `│ [ All models (1) ]  hai  ⏎ submit │`, main prompt `❯` empty.
8. Controlled repro B: `g l m`, ↓, Esc, wait 3 s, `h a i` → hub `All models (43)  Type to search` (no `⏎ submit`), main prompt `❯ hai`. Repeated with `q w e n`, ↓↓, Esc, wait 4 s, `z` → `❯ z`. The prompt was cleared with ctrl+u each time and nothing was submitted.
9. `/model`, `o p u s`, ↓, Enter → host `Switch model?` → Yes → `❯ /model opus ⎿ Set model to Opus 5.5`. `What word did I ask you to remember?` → `⏺ PELICAN`.
10. `/model`, `k i m i`, ↓, Enter → host `Switch model?` → Yes → `❯ /model opencode-go/kimi-k3.1-pro ⎿ Set model to OpenCode Go · kimi-k3.1-pro`. The same question → `⏺ PELICAN` (routed, conversation kept).
11. `/model`, `x a i`, Tab, Enter → the locked xAI view. Enter → the in-pane key prompt. No key was typed. Esc → `⏺ nmg-router: Login cancelled.` and the locked view. Enter → the key prompt again, so the hub kept the keyboard. Esc, Esc, Esc closed it.

The session was ended with `/exit`, and the tab was closed with `herdr tab close`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Formatting, version order, recent use, Claude lineup | Complete | Verified live through rows and the detail line |
| T002 | Hub sources and pure state | Complete | |
| T003 | Hub view | Complete | |
| T004 | Hub controller and model command | Incomplete | H8: Esc-clear with a row highlighted drops the hub's keyboard. The search-field and login-cancel cases are fixed |
| T005 | Settings-row sync and catalog listener | Complete | `loaded()`/rewrite makes core take the rows in the first session |
| T006 | Hook wiring | Complete | |
| T007 | Fake engine extensions | Complete | Models which site holds the keyboard. It does not model Esc dropping the keyboard when the ring is on a row button |
| T008 | Hub tests | Complete | The Esc test covers only the ring on the search field |
| T009 | Settings-row tests | Complete | Cover rewrite on an unloaded row |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The view model, view, controller, sources and settings sync stay separate. Row-load confirmation sits with the settings sync |
| Open/Closed | 4 | `HubSource` takes new sources. `rowLoaded` is injected into `handleModelCommand` with a default |
| Liskov Substitution | 4 | Both sources satisfy `HubSource` |
| Interface Segregation | 4 | `HubHost` and `SettingsHost` pick only `settings` and `clock` from `HostPort` |
| Dependency Inversion | 4 | `src/` never touches `$`. `hooks/register.ts` builds the ports, including `$.settings.read({ source: "user" })` |

### Security — 4
No credential is written. The rows hold only model id, label and a context/price description. Model ids go to `$.command.run` args, never to a shell. No credential was typed in the run, and the settings file was restored afterwards.

### Performance — 4
The row confirmation polls `$.settings.read` every 250 ms for up to 2 s, with at most two rewrites. That stays under 10 s, so it fits the hook budget, and it runs only when core has not loaded the row. In the live first session the switch had no visible delay.

### Testability — 3
Pure state, view and settings logic are well covered, and the fake engine now tracks which site holds the keyboard. The remaining defect comes from host keyboard handling that the fake does not reproduce: Esc with the ring on a row button.

### Error Handling — 4
Refused picks and cancelled logins give feedback in place. A switch whose row never loads logs `Claude Code has not loaded <id>'s model picker row yet.` and still passes to core.

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: 516 tests pass
- `claude plugin validate .`: pass
- Interactive herdr run: Fail (H8)

---

## Fixes Applied

None. This verify publication scope allows writes only to `verification-report.md`, so the finding goes back to implementation diagnosis. The previous run's H7 is fixed and H6 is fixed for the search-field and login-cancel cases, both confirmed live in this run.

---

## Remaining Issues

| ID | Severity | AC | Finding | Suggested direction |
|----|----------|----|---------|---------------------|
| H8 | High | AC6 | With a row highlighted, Esc clears the search and keeps the pane, but the hub loses the keyboard: typing goes into the main prompt. `regainKeys()` (`src/hub/hub-controller.ts:76`) calls `keepRing()`, which puts the ring back on the remembered row key (`:69`). With the ring on the search field the same path works, so the row-button case is what fails. | On Esc-clear, move the ring to the search field, since the cleared query is where typing goes. Then confirm live whether `ui.open` regains the keys when a row held the ring. Add a fake-engine case and a test that highlight a row, press Esc, and expect the next letters in the search. Rerun live with ↓ before Esc. |
| L1 | Low | AC1 | Dimming of locked entries cannot be confirmed from a plain-text screen read. | No change needed if the host renders `dimColor` on buttons. |

---

## Recommendations

1. Fix H8, then rerun the full registered gate and the herdr procedure. Include an Esc-clear with a row highlighted, and one after a refused over-window pick.
2. The xAI reopen after a successful login still needs the user's own key. It should also confirm that `xai/grok-4.6` can be picked in that same session.
