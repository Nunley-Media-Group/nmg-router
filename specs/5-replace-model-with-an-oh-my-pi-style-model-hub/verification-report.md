# Verification Report: Replace /model with an oh-my-pi-style model hub

**Date**: 2026-10-26
**Issue**: #5
**Reviewer**: Claude Code (nmg-sdlc verify worker, run aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d)
**Scope**: Implementation verification against the Approved spec
**Verification head**: d2d4eac7ba65113e9ca18b8e058e2ae4bf87007c

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 4 (2 High, 2 Low)

The registered gate is green: typecheck, 507/507 tests in 64 files and `claude plugin validate .` all pass. The fix commit `d2d4eac` resolves every finding from the previous run (H1, H2, H3 and M1), and the live herdr run confirms each fix. The switch from Claude to a routed model and back now works both by argument and through the hub, and the conversation is kept.

The interactive run found two new defects:

- **H4, AC5.** "Log in to xAI" closes the hub and then opens the login pane. At this terminal's width of 91 columns, the host refuses that second pane (`The login pane could not be shown: unasked below 110 columns (91 now…)`) and the flow ends with `Login cancelled.`. Typed directly, `/login xai` opened the same pane at the same width. So the login fails only on the hub's hand-off path.
- **H5, AC7.** The over-window pick is refused correctly: the model stays and the pane stays open. But the hub pane is opened with `holdToasts: true`, so the hub's own `Kept <current>: …` toast is held undrawn while the pane is open. The person gets no feedback until the hub closes. Then all the held notices appear at once (three stacked copies after three Enter presses).

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

`sdlc-verify-steering.mjs --base main --controller-run-id aeea8b3d-…` returned `ok: true` with `ceiling: null` and wrote `.nmg-sdlc/verification/5.json`. Coverage was declared 3, recorded 3, `complete: true`, with no entries missing, duplicated or unknown. Identity: head `d2d4eac7`, tree clean.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.typecheck` | builtin.command | yes | passed (`tsc --noEmit` exit 0) |
| `repository.tests` | builtin.command | yes | passed (64 files, 507 tests) |
| `repository.plugin-manifest` | builtin.command | yes | passed |

The registered gate imposes no ceiling. The overall status is Fail because of the interactive findings H4 and H5.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Hub layout | Pass | Live: `All models (43)`, `Claude (5)`, `Fake Local (1)`, `OpenCode Go (37)`, `ClinePass (0)`, `OpenAI Codex (1)`, `xAI (1)`, with the locked entries after the logged-in ones. Dimming cannot be seen in a plain-text read (L1); unit: `tests/hub/hub-state.test.ts` |
| AC2 | Rows and details | Pass | Live: rows are padded columns (`opencode-go/kimi-k3          1.049m  $3/15  50t/s`). The ✓ follows the current model (on `kimi-k3.1-pro`, later on `Opus`). The detail line, now above the rows, read `Kimi K3 · 1.049m ctx · 131k out · $3/15 per M · reasoning · vision`. `src/hub/hub-view.ts`, `src/hub/hub-state.ts:96` |
| AC3 | Search and order | Pass | Live: `kimi` listed 4 kimi rows, with the recently used `kimi-k3.1-pro` first. Zero-match entries became plain dim text (`Claude (0)`, `xAI (0)`). The `⏎ submit` focus hint stayed on the search field, and ↓ moved through the rows (H2 fixed) |
| AC4 | Selection switches the model | Pass | Live: `/model opencode-go/kimi-k3.1-pro` printed `Set model to OpenCode Go · kimi-k3.1-pro`, and the routed model answered `OK` to "Remember the word PELICAN". A hub pick of `opencode-go/kimi-k3` ran `/model opencode-go/kimi-k3` (after the host's own "Switch model?" cache prompt, accepted). A hub pick of `Opus` ran `/model opus`, and Opus answered `PELICAN` (conversation kept) |
| AC5 | Unauthenticated provider | **Fail** | Live: Enter on `xAI (1)` showed `xAI has no credentials.`, `1 models in catalog:`, `xai/grok-4.6` and `[ Log in to xAI ]`. Choosing it closed the hub, then printed `The login pane could not be shown: unasked below 110 columns (91 now…)` and `Login cancelled.` (H4). Reopening after a successful login could not be reached, and needs the user's own xAI key in any case |
| AC6 | Arguments, refresh and Esc | Partial | Live: `/model <id>` switched directly with no hub. Esc with the query `fake` cleared it to `All models (43)` with the pane still open, and a second Esc closed the hub. The first-open refresh has no visible live signal; unit: `tests/hub/model-command.test.ts` (refresh once per provider) |
| AC7 | Smaller context window | **Fail** | Live: the row showed `fakelocal/fake-small ⊘ context>20k  20k`. Picking it kept Opus and kept the pane open, and no switch line appeared. The notice was not shown while the pane was open; after Esc closed it, three stacked `Kept claude-opus-5-5: this conversation is larger than fakelocal/fake-small's window` toasts appeared (H5). `src/hub/hub-controller.ts:135` (`holdToasts: true`), `:162-165`. `$.session.compact()` is never called (unit: `tests/hub/model-command.test.ts`) |
| AC8 | Settings rows | Pass | Live: at session start, `~/.claude/settings.json` gained `modelPicker.options` with 38 provider-labeled rows (e.g. `OpenCode Go · GLM-5.1`, `203k ctx · $1.4/4.4`). `replaceBuiltInOptions` was unset, and every other key was identical to the pre-run backup (H1 fixed). `src/hub/settings-rows.ts`, `hooks/register.ts` `session.start` |

### Interactive evidence (herdr)

Tab `verify-5` (pane width 91 columns), `herdr agent start verify-5 --kind claude --pane <pane> -- --plugin-dir .`. Claude Code v2.1.311. No startup dialog and no hook or plugin load error. `~/.claude/settings.json` was backed up before the run and restored byte-identical after it.

1. Session start: `modelPicker.options` had 38 rows, `replaceBuiltInOptions` was unset and the other keys were unchanged.
2. `/model opencode-go/kimi-k3.1-pro` → `⎿ Set model to OpenCode Go · kimi-k3.1-pro and saved as your default for new sessions`.
3. `Remember the word PELICAN. Reply only OK.` → `⏺ OK` (routed).
4. `/model` → `│ [ All models (43) ]      Type to search ⏎ submit │ … │ [ opencode-go/kimi-k3.1-pro ✓             14t/s ] │ … │ [ fakelocal/fake-small ⊘ context>20k      20k ] │`.
5. Keys `k i m i` → `│ [ All models (4) ]        kimi  ⏎ submit │ Claude (0) … │ [ OpenCode Go (4) ] … [ opencode-go/kimi-k3          1.049m  $3/15  50t/s ] │`.
6. ↓×4 → detail `Kimi K3 · 1.049m ctx · 131k out · $3/15 per M · reasoning · vision`. Enter → the host's `Switch model?` cache prompt → `1. Yes` → `❯ /model opencode-go/kimi-k3 ⎿ Set model to OpenCode Go · Kimi K3`.
7. `/model`, `o p u s`, ↓, Enter → `❯ /model opus ⎿ Set model to Opus 5.5`. Then `What word did I ask you to remember?` → `⏺ PELICAN`.
8. `/model`, `f a k e`, ↓, Enter (×3) → the pane stayed open on `[ fakelocal/fake-small ⊘ context>20k  20k ]` and the model stayed Opus, with no notice drawn. Esc → `All models (43)` with the pane open. Esc → the hub closed, then the stacked toasts appeared: `│ nmg-router │ Kept claude-opus-5-5: this conversation is larger than fakelocal/fake-small's …` (three copies).
9. `/model`, `x a i`, Tab, Enter → `xAI has no credentials. / 1 models in catalog: / xai/grok-4.6 / [ Log in to xAI ]`. Enter → `⏺ nmg-router: The login pane could not be shown: unasked below 110 columns (91 now, an id the person opened before): placed when the person opens it, or when the terminal is widened to 110 columns` and `⏺ nmg-router: Login cancelled.`.
10. `/login xai` at the same width → the `Select provider to login` pane opened, and it was cancelled with Esc. No credential was typed.

The tab was closed with `herdr tab close`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Formatting, version order, recent use, Claude lineup | Complete | Verified live through rows and the detail line |
| T002 | Hub sources and pure state | Complete | |
| T003 | Hub view | Complete | H2, H3 and M1 fixed in `d2d4eac` |
| T004 | Hub controller and model command | Incomplete | H4 (login hand-off refused below 110 columns), H5 (refusal toast held by the hub's own `holdToasts`) |
| T005 | Settings-row sync and catalog listener | Complete | Sync on `session.start` from the cached catalog (H1 fixed) |
| T006 | Hook wiring | Complete | |
| T007 | Fake engine extensions | Complete | Core `/model` now refuses unknown ids. The fakes do not model `holdToasts` or the unasked-pane width rule |
| T008 | Hub tests | Complete | Do not cover H4 or H5 |
| T009 | Settings-row tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The view model, view, controller, sources and settings sync stay separate |
| Open/Closed | 4 | `HubSource` lets the Claude and catalog sources plug in |
| Liskov Substitution | 4 | Both sources satisfy `HubSource` |
| Interface Segregation | 4 | `HubHost` and `SettingsHost` are narrow ports |
| Dependency Inversion | 4 | `src/` never touches `$`; `hooks/register.ts` builds the ports |

### Security — 4
No credential is written. The settings rows hold only the model id, label and a context/price description. Model ids go to `$.command.run` args, never to a shell. The run typed no credential.

### Performance — 4
The `session.start` sync reads the cached catalog with no network call, and it writes only on change. Each provider refreshes once per session.

### Testability — 3
Pure state and view functions are well covered, and the fake `/model` now rejects unknown ids. The fakes still do not model two host rules that caused H4 and H5: `holdToasts` holding a pane's own toasts, and the host refusing an unasked pane below 110 columns.

### Error Handling — 3
The refused login pane is reported as `Login cancelled.` rather than with a next step, and the refusal notice for an over-window pick is invisible while it matters.

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: 64 files, 507 tests pass
- `claude plugin validate .`: pass
- Interactive herdr run: Fail (H4, H5)

---

## Fixes Applied

None. This verify publication scope allows writes only to `verification-report.md`, so the findings go back to implementation diagnosis. The previous run's H1–H3 and M1 were fixed by `d2d4eac` and confirmed live in this run.

---

## Remaining Issues

| ID | Severity | AC | Finding | Suggested direction |
|----|----------|----|---------|---------------------|
| H4 | High | AC5 | `login()` in `src/hub/hub-controller.ts:171-180` closes the hub, then `loginToProvider` opens the login pane as an unasked pane. The host refuses unasked panes below 110 columns, so at 91 columns the login is cancelled. `/login xai` works at the same width. | Open the login flow without first closing the person-opened hub (for example, draw the key or OAuth field inside the hub pane, or open the login pane before the hub closes so it counts as asked). Test at a width below 110. |
| H5 | High | AC7 | The hub opens with `holdToasts: true` (`src/hub/hub-controller.ts:135`), so its own `Kept <current>: …` toast is not drawn while the pane is open, then it stacks up after close. | Show the notice inside the pane (a status `Text` line in the hub state), or open the hub without `holdToasts`. Add a fake-engine rule that holds toasts while a `holdToasts` pane is open. |
| L1 | Low | AC1 | Dimming of locked entries cannot be confirmed from a plain-text screen read. | No change needed if the host renders `dimColor` on buttons. |
| L2 | Low | AC5 | The locked view reads `1 models in catalog:`. Searching `xai` showed `All models (0)` next to `xAI (1)`, because locked models count in the sidebar but are not listed under All. | Pluralize the count; consider whether All should count locked models. |

---

## Recommendations

1. Fix H4 and H5, then rerun the full registered gate and the herdr procedure at a width below 110 columns. That run should cover the xAI hand-off up to the key prompt (with the user entering their own key for the reopen check) and the over-window pick showing its notice while the pane is open.
2. Extend the fake engine with the host's `holdToasts` and unasked-pane width rules, so these behaviors are tested.
