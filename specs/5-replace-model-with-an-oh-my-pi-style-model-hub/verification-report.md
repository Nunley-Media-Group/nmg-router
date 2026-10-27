# Verification Report: Replace /model with an oh-my-pi-style model hub

**Date**: 2026-10-26
**Issue**: #5
**Reviewer**: Claude Code (nmg-sdlc verify worker, run aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d)
**Scope**: Implementation verification against the Approved spec
**Verification head**: dfa5b72733276dcadfacebed6617e238112a2542

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 3 (2 High, 1 Low)

The registered gate is green: typecheck, 508/508 tests and `claude plugin validate .` all pass at `dfa5b72`. The fix commit resolves both findings from the previous run, and the live herdr run at 91 columns confirms each fix:

- **H4 fixed (AC5).** "Log in to xAI" now draws its steps inside the hub pane. The key prompt appears at 91 columns, and Esc cancels back to the locked xAI view.
- **H5 fixed (AC7).** The refused over-window pick now shows its `Kept <current>: …` notice inside the pane and as a toast while the hub is open. The model and the pane stay as they were.
- **L2 fixed.** The locked view reads `1 model in catalog:`.

The run found two new defects:

- **H6, AC6/FR2.** Esc on a non-empty search clears it and keeps the hub open, but the hub loses keyboard focus to the main prompt. Typed letters then land in the prompt, and ↑ recalls prompt history, so the next Enter can submit a stale prompt. The Esc-clear branch of `refusesClose` redraws without `keepRing()`, unlike the login-cancel branch above it.
- **H7, AC4/AC8.** Claude Code does not pick up `modelPicker` rows that the mod writes after the session has started. On a session whose settings file had no rows at startup, `session.start` wrote 38 rows, but `/model opencode-go/kimi-k3.1-pro` answered `Model 'opencode-go/kimi-k3.1-pro' not found` twice, about a minute apart. After a restart, with the rows already in the file, the same command switched. This affects the first session after install and any routed model added mid-session, such as a provider's models after a hub login (AC5).

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

`sdlc-verify-steering.mjs --base main --controller-run-id aeea8b3d-…` returned `ok: true` with `ceiling: null` and wrote `.nmg-sdlc/verification/5.json`. Coverage was declared 3, recorded 3, `complete: true`, with no entries missing, duplicated or unknown. Identity: head `dfa5b727`, tree clean.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.typecheck` | builtin.command | yes | passed (`tsc --noEmit` exit 0) |
| `repository.tests` | builtin.command | yes | passed (508 tests) |
| `repository.plugin-manifest` | builtin.command | yes | passed |

The registered gate imposes no ceiling. The overall status is Fail because of the interactive findings H6 and H7.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Hub layout | Pass | Live: `All models (43)`, `Claude (5)`, `Fake Local (1)`, `OpenCode Go (37)`, `ClinePass (0)`, `OpenAI Codex (1)`, `xAI (1)`, with the locked entries after the logged-in ones. Dimming cannot be seen in a plain-text read (L1). Unit: `tests/hub/hub-state.test.ts` |
| AC2 | Rows and details | Pass | Live: `[ opencode-go/kimi-k3.1-pro ✓  11t/s ]`, `[ opencode-go/kimi-k3  1.049m  $3/15  50t/s ]`. Detail line for the fake row: `Fake Small · 20k ctx · 4k out`. The ✓ followed the current model |
| AC3 | Search and order | Pass | Live: `kimi` listed `All models (4)` with only kimi rows, and the recently used `kimi-k3.1-pro` first. Zero-match entries were plain text (`Claude (0)`, `xAI (0)`) |
| AC4 | Selection switches the model | **Fail** | Live, second session: `/model opencode-go/kimi-k3.1-pro` → `Set model to OpenCode Go · kimi-k3.1-pro`, and the model answered `OK` to "Remember the word PELICAN". Hub pick `Opus` → host's `Switch model?` prompt → `❯ /model opus ⎿ Set model to Opus 5.5`, and Opus answered `PELICAN`. Hub pick `opencode-go/kimi-k3.1-pro` → `❯ /model opencode-go/kimi-k3.1-pro ⎿ Set model to OpenCode Go · kimi-k3.1-pro`, and the routed model answered `PELICAN`. First session: refused with `Model 'opencode-go/kimi-k3.1-pro' not found` (H7) |
| AC5 | Unauthenticated provider | Partial | Live: Enter on `xAI (1)` → `xAI has no credentials.` / `1 model in catalog:` / `xai/grok-4.6` / `[ Log in to xAI ]`. Enter → in the same pane: `Log in to xAI` / `The key is checked against the provider before it is saved.` / `xAI API key: (paste or type the key)` / `[ Cancel ]`. Esc → `Login cancelled.` and the locked xAI view again. Reopening on xAI after a successful login needs the user's own xAI key and was not run. Under H7, xAI's rows written after that login could not be switched to until the next session. Unit: `tests/hub/login-handoff.test.ts` |
| AC6 | Arguments, refresh and Esc | **Fail** | Live: `/model <id>` switched directly with no hub. Esc with the query `glm` (and earlier `fake`) cleared it with the pane open, and a second Esc closed the hub. But after the first Esc the hub lost keyboard focus: `kimi` typed next appeared in the main prompt (`❯ kimi`), and ↑ recalled prompt history (H6). The first-open refresh has no visible live signal. Unit: `tests/hub/model-command.test.ts` |
| AC7 | Smaller context window | Pass | Live: the row showed `fakelocal/fake-small ⊘ context>20k  20k`. Enter kept `opencode-go/kimi-k3.1-pro` and kept the pane open, which drew `Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window.` while a matching toast showed at the same time (H5 fixed). `$.session.compact()` is never called (unit: `tests/hub/model-command.test.ts`) |
| AC8 | Settings rows | Pass | Live: the pre-run settings file had no `modelPicker`. At session start the mod wrote `modelPicker.options` with 38 provider-labeled rows (e.g. `OpenCode Go · deepseek-v4.1-flash`). `replaceBuiltInOptions` stayed unset, and every other key matched the backup. The host taking those rows only in the next session is H7, filed under AC4 |

### Interactive evidence (herdr)

Tab `verify-5` (pane width 91 columns), `herdr agent start verify-5 --kind claude --pane <pane> -- --plugin-dir .`. Claude Code v2.1.311. No startup dialog and no hook or plugin load error. `~/.claude/settings.json` was backed up before the run and restored byte-identical after it (`cmp` clean).

1. Session 1 start: the settings file gained 38 `modelPicker.options` rows. `replaceBuiltInOptions` stayed unset, and the other keys were unchanged.
2. `/model opencode-go/kimi-k3.1-pro` → `⎿ Model 'opencode-go/kimi-k3.1-pro' not found`. It was retried about a minute later with the same result (H7). `/exit`.
3. Session 2 (rows present at startup): `/model opencode-go/kimi-k3.1-pro` → `⎿ Set model to OpenCode Go · kimi-k3.1-pro and saved as your default for new sessions`. Then `Remember the word PELICAN. Reply only OK.` → `⏺ OK` (routed).
4. `/model` → `│ [ All models (43) ]  Type to search ⏎ submit │ … │ [ opencode-go/kimi-k3.1-pro ✓  11t/s ] │ … │ [ fakelocal/fake-small ⊘ context>20k  20k ] │`.
5. `f a k e`, ↓, Enter → `│ Kept opencode-go/kimi-k3.1-pro: this conversation is larger than fakelocal/fake-small's window. │`, with the toast `│ nmg-router │ Kept opencode-go/kimi-k3.1-pro: this … │` drawn while the pane was open. The model was unchanged.
6. Esc → `All models (43)  Type to search`, with the pane open but without the `⏎ submit` focus hint. ↑×8 and `k i m i` → the main prompt read `❯ [Pasted text #3 +271 lines]kimi`, recalled from history. It was cleared with ctrl+u and not submitted. Repeated with the query `glm` and no pick: after Esc, `kimi` landed in the main prompt again (`❯ kimi`). A further Esc with an empty search closed the hub (H6).
7. `/model`, `x a i`, Tab, Enter → `xAI has no credentials. / 1 model in catalog: / xai/grok-4.6 / [ Log in to xAI ]`. Enter → `Log in to xAI / The key is checked against the provider before it is saved. / xAI API key: (paste or type the key) / [ Cancel ]` in the hub pane. No key was typed. Esc → `⏺ nmg-router: Login cancelled.` and the locked xAI view again (H4 fixed).
8. `/model`, `o p u s`, ↓, Enter → host `Switch model?` → `1. Yes` → `❯ /model opus ⎿ Set model to Opus 5.5`. `What word did I ask you to remember?` → `⏺ PELICAN`.
9. `/model`, `k i m i`, ↓, Enter → host `Switch model?` → `1. Yes` → `❯ /model opencode-go/kimi-k3.1-pro ⎿ Set model to OpenCode Go · kimi-k3.1-pro`. `What word did I ask you to remember?` → `⏺ PELICAN` (routed, conversation kept).

The tab was closed with `herdr tab close`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Formatting, version order, recent use, Claude lineup | Complete | Verified live through rows and the detail line |
| T002 | Hub sources and pure state | Complete | |
| T003 | Hub view | Complete | In-pane notice and pluralized count added in `dfa5b72` |
| T004 | Hub controller and model command | Incomplete | H6: the Esc-clear path drops the hub's keyboard focus. H4 and H5 are fixed |
| T005 | Settings-row sync and catalog listener | Incomplete | H7: rows written after host startup are not usable until the next session |
| T006 | Hook wiring | Complete | |
| T007 | Fake engine extensions | Complete | Now models `holdToasts` and a press's asked window. It does not model the pane losing keys after a denied Esc close, or the host reading `modelPicker` only at startup |
| T008 | Hub tests | Complete | Do not cover H6 |
| T009 | Settings-row tests | Complete | Do not cover H7 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The view model, view, controller, sources and settings sync stay separate. The login pane controller is reused through a narrow `PaneSite` |
| Open/Closed | 4 | `HubSource` lets the Claude and catalog sources plug in. A `lent` site extends the login pane without forking it |
| Liskov Substitution | 4 | Both sources satisfy `HubSource` |
| Interface Segregation | 4 | `HubHost` and `SettingsHost` are narrow ports |
| Dependency Inversion | 4 | `src/` never touches `$`; `hooks/register.ts` builds the ports |

### Security — 4
No credential is written. The settings rows hold only the model id, label and a context/price description. Model ids go to `$.command.run` args, never to a shell. No credential was typed in the run, and the settings file was restored afterwards.

### Performance — 4
The `session.start` sync reads the cached catalog with no network call, and it writes only on change. Each provider refreshes once per session.

### Testability — 3
Pure state and view functions are well covered, and the fakes now model `holdToasts` and asked windows. The two new defects come from host behavior the fakes do not model: the pane losing keys after a denied Esc close, and `modelPicker` being read only at startup.

### Error Handling — 4
A refused pick and a cancelled login both give visible feedback in place. A first-session switch to a routed id fails with core's bare `not found`, which gives no hint that a restart is needed (H7).

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: 508 tests pass
- `claude plugin validate .`: pass
- Interactive herdr run: Fail (H6, H7)

---

## Fixes Applied

None. This verify publication scope allows writes only to `verification-report.md`, so the findings go back to implementation diagnosis. The previous run's H4, H5 and L2 were fixed by `dfa5b72` and confirmed live in this run.

---

## Remaining Issues

| ID | Severity | AC | Finding | Suggested direction |
|----|----------|----|---------|---------------------|
| H6 | High | AC6 | After Esc clears a non-empty search, the hub pane loses keyboard focus to the main prompt. Typing goes into the prompt, and ↑ recalls history. `refusesClose` in `src/hub/hub-controller.ts:255-258` redraws after `withQuery(state, "")` but never calls `keepRing()`, while the login-cancel branch at `:248-253` does. | Call `keepRing()` after the redraw in the search branch, so the ring returns to the search field and the pane asks for the keys again. Add a fake-engine rule that a denied person close releases the pane's keys, and test that typing after Esc reaches the search. |
| H7 | High | AC4, AC8 (and AC5 after login) | Claude Code reads `modelPicker` at startup only. Rows that `session.start` or a catalog refresh writes during a session are rejected by core `/model` (`Model '<id>' not found`) until the next session. This contradicts the `hooks/register.ts:317-318` comment. | Find a host path that makes a routed id known in the current session (for example a settings reload API, writing the rows before core reads settings, or `behavesAs`/alias handling in the `command.run` hook). If the host offers none, tell the person to restart when new rows are written, and amend the spec to match. Rerun the first-session switch live. |
| L1 | Low | AC1 | Dimming of locked entries cannot be confirmed from a plain-text screen read. | No change needed if the host renders `dimColor` on buttons. |

---

## Recommendations

1. Fix H6 and H7, then rerun the full registered gate and the herdr procedure at a width below 110 columns. Start from a settings file with no `modelPicker` rows, so the first-session switch is covered. Type after an Esc-clear to confirm the hub keeps focus.
2. The xAI reopen after a successful login still needs the user's own key. Once H7 is fixed, it should also confirm that `xai/grok-4.6` can be picked in that same session.
