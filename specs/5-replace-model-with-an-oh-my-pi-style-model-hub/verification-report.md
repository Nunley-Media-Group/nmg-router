# Verification Report: Replace /model with an oh-my-pi-style model hub

**Date**: 2026-10-26
**Issue**: #5
**Reviewer**: Claude Code (nmg-sdlc verify worker, run aeea8b3d-18a4-45f7-84d7-d58bd8b7d91d)
**Scope**: Implementation verification against the Approved spec
**Verification head**: 7ab101d2d6723976e5ef527141421184e246c43d

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 5 (3 High, 1 Medium, 1 Low)

The registered gate is green: typecheck, 500/500 tests and `claude plugin validate .` all pass. The interactive herdr run, which the verification steering requires, found that the hub cannot switch to a routed model in a live session:

- **H1, AC4/AC6/AC8.** `/model opencode-go/kimi-k3.1-pro` printed `Model 'opencode-go/kimi-k3.1-pro' not found`, and the model stayed on Opus. `modelPicker` rows are written only from `catalog.onChange`, which fires only after a refresh or logout. A session that opens on the cached catalog never writes rows, and `~/.claude/settings.json` had no `modelPicker` key after the run.
- **H2, AC3/AC4.** After typing in the hub's search, keyboard focus left the pane for the main prompt. Enter, Tab and later keystrokes went to the prompt, so a search result could not be picked.
- **H3, AC2.** Each row's two `Text` children render with no space between them. The id runs into the context and speed columns: `opencode-go/kimi-k31.049m  $3/15  50t/s` (`kimi-k3` + `1.049m`), `opencode-go/glm-5.355t/s` and `opencode-go/glm-5.1203k  $1.4/4.4`.

The unit suites pass because the fakes do not model these host behaviors: the fake `$.command.run` accepts any id, the harness drives focus directly, and string assertions check `left` and `right` separately.

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

`sdlc-verify-steering.mjs --base main --controller-run-id aeea8b3d-…` returned `ok: true` with `ceiling: null` and wrote `.nmg-sdlc/verification/5.json`. Coverage was declared 3, recorded 3, `complete: true`, with no entries missing, duplicated or unknown. Identity: head `7ab101d2`, tree clean.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.typecheck` | builtin.command | yes | passed (`tsc --noEmit` exit 0) |
| `repository.tests` | builtin.command | yes | passed (64 files, 500 tests) |
| `repository.plugin-manifest` | builtin.command | yes | passed with advice (README has no marketplace install line; that is #6) |

The registered gate imposes no ceiling. The overall status is Fail because of the interactive findings.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Hub layout | Partial | Live: bare `/model` opened the pane with `All models (43)`, `Claude (5)`, `Fake Local (1)`, `OpenCode Go (37)`, `ClinePass (0)`, `OpenAI Codex (1)` and `xAI (1)`. A plain-text read cannot show dimming, so the dimmed locked entries are proven only by `tests/hub/hub-state.test.ts`. Code: `src/hub/hub-state.ts` (sidebar), `src/hub/sources.ts` |
| AC2 | Rows and details | **Fail** | H3: the id is glued to the columns (`opencode-go/kimi-k31.049m  $3/15  50t/s`). M1: the detail line and footer come after every row, so in "All models" (43 rows) they are cut off below the pane. They were visible only with 4 search results. `src/hub/hub-view.ts:39-48`, `:63-70` |
| AC3 | Search and order | Partial | Live: `kimi` gave `All models (4)` and `OpenCode Go (4)` as buttons, and `Claude (0)`, `Fake Local (0)`, `ClinePass (0)`, `OpenAI Codex (0)` and `xAI (0)` as plain dim text that cannot be chosen. H2: after the redraw, focus was in the main prompt (a probe keystroke `z` landed at `❯ z`) |
| AC4 | Selection switches the model | **Fail** | H2: after a search, Enter in the hub did nothing and the model stayed Opus. H1: Claude Code rejected the routed id with `Model 'opencode-go/kimi-k3.1-pro' not found`. The conversation was kept: after the failed switch, Opus still answered `PELICAN`. Code: `src/hub/hub-controller.ts:137-149` |
| AC5 | Unauthenticated provider | Incomplete | Not exercised live: focus could not be moved reliably to the `xAI (1)` sidebar button (H2). Unit evidence: `tests/hub/login-handoff.test.ts` |
| AC6 | Arguments, refresh and Esc | **Fail** | Esc passed live: with `kimi` typed, the first Esc cleared the search (back to `All models (43)`, pane open) and the second Esc closed the hub. The direct switch `/model opencode-go/kimi-k3.1-pro` reached `next(e)` but failed with `not found` (H1). First-open refresh was not observed live |
| AC7 | Smaller context window | Incomplete | Not exercised live: the transcript was smaller than every window. Code refuses an over-window pick before `ui.close` and never calls `$.session.compact()`: `src/hub/hub-controller.ts:142-146`. Unit: `tests/hub/model-command.test.ts` |
| AC8 | Settings rows | **Fail** | `~/.claude/settings.json` had no `modelPicker` key after a full session with three hub opens. Sync is tied only to `catalog.onChange` (refresh/logout), `src/hub/settings-rows.ts:108-114`, and `catalog.load()` never fires it. Other keys were unchanged (byte-identical to the pre-run backup) |

### Interactive evidence (herdr)

Tab `verify-5`, `herdr agent start verify-5 --kind claude --pane <pane> -- --plugin-dir .`. Claude Code v2.1.311. No startup dialog and no hook or plugin load error.

1. Prompt `/model` gave the hub. Excerpt: `│ [ All models (43) ]  Type to search ⏎ submit │`, `│ [ OpenCode Go (37) ] [ Haiku ] │`, `│ [ opencode-go/glm-5.355t/s ] │`, `│ [ opencode-go/glm-5.1203k  $1.4/4.4 ] │`. The pane ends after 15 rows, with no detail line or footer.
2. Typing `kimi` gave `│ Claude (0)  [ opencode-go/kimi-k3.1-pro ] │ … │ [ opencode-go/kimi-k31.049m  $3/15  50t/s ] │ kimi-k3.1-pro │ Enter switch · Tab/↑↓ move · type to search · Esc clear/close │`. The `⏎ submit` focus hint disappeared after the redraw.
3. Esc gave `All models (43)` with the pane open, and a second Esc closed the hub (pass).
4. Enter, then Tab and Enter, after the search: the pane stayed open and the status line still read `model: Opus`. A typed probe `z` appeared at `❯ z`.
5. The prompt `Remember the word PELICAN. Reply only OK.` got `⏺ OK`.
6. `/model opencode-go/kimi-k3.1-pro` printed `⎿  Model 'opencode-go/kimi-k3.1-pro' not found`.
7. The prompt `What word did I ask you to remember?` got `⏺ PELICAN` from Opus. The conversation was kept, but no switch happened.

No `/model` switch from Claude to a routed model and back could be completed, because of H1 and H2. Both tabs were closed with `herdr tab close`, and `~/.claude/settings.json` was confirmed byte-identical to its pre-run backup.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Formatting, version order, recent use, Claude lineup | Complete | `src/hub/format.ts`, `version-order.ts`, `recent.ts`, `claude-lineup.ts` |
| T002 | Hub sources and pure state | Complete | Row text composition causes H3 together with T003 |
| T003 | Hub view | Incomplete | H3 (no column separator), M1 (detail line after all rows), H2 (focus lost on redraw) |
| T004 | Hub controller and model command | Complete in code | The live switch fails, see H1 |
| T005 | Settings-row sync and catalog listener | Incomplete | Sync never runs without a refresh, see H1 |
| T006 | Hook wiring | Complete | `hooks/register.ts` registers `command.run`, `ui.render`, `ui.focus` and `ui.close` for the hub |
| T007 | Fake engine extensions | Complete | The fakes accept any `/model` id, which hid H1 |
| T008 | Hub tests | Complete | Do not cover H1–H3 |
| T009 | Settings-row tests | Complete | Exercise sync only after an explicit refresh |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The view model (`hub-state.ts`), view (`hub-view.ts`), controller, sources and settings sync are separate, as designed |
| Open/Closed | 4 | `HubSource` lets Claude and catalog sources plug in |
| Liskov Substitution | 4 | `claudeSource` and `catalogSource` both satisfy `HubSource` |
| Interface Segregation | 4 | `HubHost` and `SettingsHost` are narrow `Pick`s of `HostPort` |
| Dependency Inversion | 4 | `src/` never touches `$`; `hooks/register.ts` builds the ports |

### Security — 4
No credential is written. The settings row holds only the model id, label, context and price. `hubHost` exposes only the listed env and store names. Model ids go to `$.command.run` args, never to a shell.

### Performance — 4
Each provider refreshes once per session, and a write happens only when the text changed. `rebuild` lists credentials per provider on every open, which is acceptable at the current catalog size.

### Testability — 3
The pure state and view functions are well covered. The fake engine does not reproduce the host's focus ring, `/model` id validation or text layout of sibling `Text` nodes, so all three high findings slipped past 500 green tests.

### Error Handling — 4
Pane failures are logged with "Nothing was changed". Sync refuses invalid JSON and warns once. A failed refresh keeps the cached rows.

---

## Test Results

- `npm run typecheck`: pass
- `npm test`: 64 files, 500 tests pass
- `claude plugin validate .`: pass, with README marketplace advice (#6 scope)
- Interactive herdr run: Fail (see above)

---

## Fixes Applied

None. This verify publication scope allows writes only to `verification-report.md`, so these findings go back to implementation diagnosis.

---

## Remaining Issues

| ID | Severity | AC | Finding | Suggested direction |
|----|----------|----|---------|---------------------|
| H1 | High | AC4, AC6, AC8 | Routed ids are unknown to Claude Code's `/model` because `modelPicker` rows are synced only on `catalog.onChange`. Also not shown: whether Claude Code accepts a routed id once the rows exist. | Sync the rows on catalog load or mod start, not only after a refresh. Then re-check live that `/model <routed id>` is accepted with the rows present. If it is not, the switch path needs a different design. |
| H2 | High | AC3, AC4, AC5 | Typing in the hub search redraws the pane and focus moves to the main prompt, so Enter and Tab no longer reach the hub. | Keep the `Input` focused across redraws (stable key and `autoFocus` only on first draw, or check how the host keeps focus when siblings change Button↔Text). Add a harness assertion that focus stays in the pane. |
| H3 | High | AC2 | Row `left` and `right` `Text` children render with no gap, so ids merge with context and speed (`kimi-k31.049m`). | Put the two parts in a row `Box` with a gap or padding, or join them with a separator in one string. |
| M1 | Medium | AC2 | The detail line and footer come after every row and are cut off when the list is taller than the pane (always in "All models"). | Draw the detail line and footer above the rows, or cap or scroll the row list. |
| L1 | Low | AC1 | Dimming of locked entries cannot be confirmed from a plain-text screen read. | No change needed if the host renders `dimColor` on buttons. Confirm in the next live run. |

---

## Recommendations

1. Fix H1–H3 and M1, then rerun the full registered gate and the herdr procedure. That procedure includes switching Claude → `opencode-go/kimi-k3.1-pro` → Claude, both by argument and through the hub, plus the locked xAI hand-off (AC5) and an over-window pick (AC7, for example with `fakelocal/fake-small20k`).
2. Extend the fake engine so `$.command.run({ command: "model" })` rejects ids that are neither built in nor in `modelPicker.options`, matching the host.
