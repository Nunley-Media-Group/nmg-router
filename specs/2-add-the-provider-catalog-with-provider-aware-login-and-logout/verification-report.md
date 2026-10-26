# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-26
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec (re-verification after fix e5a383a)
**Verification head**: e5a383a9f76065f9cb5623d4733e247cbde49b38

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 3 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 4 (0 critical, 1 high, 2 medium, 1 low)

All three registered validations pass, and so do the 242 unit tests. Fix e5a383a works live for the three defects it targets:

- **C3 fixed**: the OpenAI Codex "Redirect URL or code" field takes the keyboard. A typed `z` and a pasted redirect URL landed in the field, not in the chat prompt. A wrong-state paste was refused, and the code never reached the transcript.
- **H1 fixed**: a second `/login` while the Codex step was pending logged `Login cancelled.` for the old flow. The new picker stayed up and could be driven to the next step.
- **L2 fixed**: the pane is laid out as a column, and the authorize URL wraps across the pane's full width.

A new defect blocks Pass:

- **H2 (high)**: the masked API-key field draws typed or pasted characters in plain text until the mod's redraw replaces them with bullets. A single paste of `xyz1` was read on screen as `OpenCode Go API key: xyz1`, and the next paste as `••••xyz2`, before both became bullets. A pasted provider key is therefore drawn on screen in full for a moment. This breaks AC6 ("a masked input") and FR8 ("No credential in UI text").

Some AC paths still have no live evidence. AC4 (the test config file was blocked) and the success paths of AC6, AC7 and AC8 all need the user. See Remaining Issues.

---

## Issue Scope

- Active issue: #2
- Spec: `specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC8]; FR [FR1–FR8]; tasks [T001–T013]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":2,"specPath":"specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (interactive verification fails on H2)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs` ran at the verification head on a clean tree (controller run id `3dae437e-cbc6-429b-b393-702530618736`). `.nmg-sdlc/verification/2.json` reports `ceiling: null` and coverage `declared: 3, recorded: 3, complete: true`.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| repository.typecheck | builtin.command (`npm run typecheck`) | yes | passed |
| repository.tests | builtin.command (`npm test`) | yes | passed (26 files, 242 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed (advisory warnings only: no icon, no install line in README) |

The steering manifest declares no smoke validation. The interactive verification that `project.verification` requires fails on H2, so the status is capped at Fail.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass | `src/providers/builtin/index.ts`; `tests/providers/builtin.test.ts`. Live: the picker listed `OpenCode Go`, `ClinePass`, `OpenAI Codex` and `xAI`, and no Anthropic routed provider |
| AC2 | Model discovery | Pass (unit only) | `src/catalog/catalog.ts`, `src/providers/builtin/opencode-go.ts`; `tests/catalog/discovery.test.ts`. A live model list needs a valid OpenCode Go key |
| AC3 | Cache, refresh and failure states | Pass (unit only) | `src/catalog/catalog.ts`; `tests/catalog/catalog.test.ts` |
| AC4 | Custom providers and filters | Pass (unit only); live **Incomplete** | `src/config/user-config.ts`, `src/providers/custom.ts`; `tests/config/user-config.test.ts`. The auto-mode classifier blocked writing a temporary `~/Library/Application Support/nmg-router/config.json`, so this run has no live custom-provider evidence. The previous run (head 84f288e) showed it live, and that code is unchanged since |
| AC5 | Login picker and Anthropic | Pass | Live: the picker was titled "Select provider to login" and listed 5 rows with status (`OpenCode Go — not logged in` …). There was no search field, which is correct for 10 rows or fewer. Picking Anthropic opened Claude Code's own "Select login method" dialog, which was cancelled with Esc. Fuzzy search with more than 10 rows passes in unit tests (`tests/login/pane.test.ts`) and was shown live in the previous run |
| AC6 | API-key login | **Fail** | Live: an invalid dummy key gave `Invalid OpenCode Go API key; nothing was saved.` The field ends as bullets, but typed and pasted characters are drawn in plain text until the redraw (H2). The success path ("Logged in to OpenCode Go" and the refresh) needs the user's real key |
| AC7 | OAuth login and refresh | Partial | Live: the pane showed the authorize URL (PKCE S256, state) and a focused paste field. A paste of `http://localhost:1455/auth/callback?code=<dummy>&state=wrong-state` gave `The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.` The dummy code is not in the transcript. A real sign-in, saved tokens, the email display and refresh need the user's own login. Refresh passes in unit tests (`tests/login/oauth-code-login.test.ts`) |
| AC8 | Accounts and logout | Partial | Live: with nothing stored, `/logout` listed only `Anthropic (Claude Code login)`, and Esc gave `Logout cancelled.` Two Codex accounts, the `(active)` marker and the delete need two real Codex logins. Anthropic logout was not picked, because that would sign the user out. Unit tests pass (`tests/login/logout-command.test.ts`) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001–T006 | Interfaces, HTTP, providers, auth, config, catalog | Complete | |
| T007 | Pane controller, fuzzy filter and masked input | Complete (defect) | C3, H1 and L2 are fixed. H2: the masked field echoes raw input until the redraw |
| T008 | /login and /logout commands and hook wiring | Complete | `pane.end(hold)` closes only the flow's own hold |
| T009–T013 | Fakes, fixtures and tests | Complete | The fake engine applies the mod's `value` at once, so it cannot show the window in which the host draws raw typing |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `command-flow.ts` owns the flow lifecycle, `pane.ts` the view. `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one registry entry |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `FlowHost` and `PaneHost` are narrow; `ui.focus` was added to the port only |
| Dependency Inversion | 4 | No direct `$` use under `src/` |

### Notes

- `PaneHold` gives each command an ownership token for the pane, which removes the shared-state race behind H1.
- `focusStep` re-asks for the keyboard with one retry and swallows errors. That fits a best-effort focus.

---

## Security Assessment

- [x] PKCE S256, a checked state and no listening port. A wrong-state paste is refused and nothing is saved (confirmed live)
- [x] The OAuth paste now goes to the field, not the model (C3 fixed, confirmed live)
- [x] An invalid key saves nothing (confirmed live)
- [ ] **H2**: the masked field draws raw typed or pasted text until the mod redraws it as bullets. The host `InputProps` has no masking option, and its docs say "the person's typing replaces it until the hook draws another". The raw key is not written to the transcript (a check of the scrollback for the probe strings found 0 matches), but it is drawn on screen and in any screen capture or recording of that moment
- Low (L1, carried over): the OAuth authorize URL is also written to the transcript. It holds no secret

---

## Performance Assessment

- [x] `load()` makes no network call, and refresh runs per provider
- [x] The hook opens the pane with a `$` call and answers, so the 10 s budget is not at risk

---

## Error Handling Assessment

- H1 is **fixed**: a superseded flow ends with `Login cancelled.` and leaves the new command's pane alone.
- The "Working…" view keeps a focusable Cancel that marks the hold closed, so the later steps end instead of reopening an unasked pane.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC5 | Yes | Yes (Vitest) | Yes |
| AC6 | Yes | Yes (Vitest) | Unit yes / live No (H2) |
| AC7, AC8 | Yes | Yes (Vitest) | Unit yes / live partial (needs user login) |

- Unit tests: 242 in 26 files, all passing. New tests cover focus and `end(hold)` ownership.
- Gap: no test models the host drawing the raw text before `onInput` runs, so H2 passes in unit tests.

---

## Exercise Test Results (Interactive Verification, herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude --pane <pane> -- --plugin-dir .`. Keys were sent with `herdr pane send-text` and `send-keys`, and the screen was read with `herdr pane read`. The tab was closed afterwards |
| **Startup** | Claude Code v2.1.310 at 91 columns. No folder-trust dialog, and no hook or plugin load errors |
| **Setup** | No user config. Writing a temporary config was blocked by the auto-mode classifier. The keychain was unlocked, but no credential was saved, because only dummy keys were used |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login` | Picker drawn as a column, with 5 rows and status | `Select provider to login` / `OpenCode Go — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` / `[ Cancel ]` |
| 2 | OpenCode Go, type a dummy key after the step drew, Enter | Masked, then refused | `OpenCode Go API key: •••••••••••••••••` / `Invalid OpenCode Go API key; nothing was saved.` |
| 3 | `/login` → OpenAI Codex, type `z` | Field has focus (C3 fixed) | `Redirect URL or code: z  ⏎ submit`; prompt `❯` empty |
| 4 | Backspace, paste `…/auth/callback?code=<dummy>&state=wrong-state`, Enter | Refused, and the code is not in the transcript | `The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.` |
| 5 | `/login` → Codex, Tab Tab, `/login` Enter | Old flow cancelled, new picker held (H1 fixed) | `Login cancelled.` then `Select provider to login` drawn |
| 6 | In the new picker → OpenCode Go | The second flow reaches the key step | `Log in to OpenCode Go` / `OpenCode Go API key: •  ⏎ submit` |
| 7 | Key step: paste `xyz1`, read at once; paste `xyz2`, read at once | Raw text drawn before the bullets (H2) | `OpenCode Go API key: xyz1` → `••••` → `••••xyz2` → `••••••••` |
| 8 | `/login`, Enter on Anthropic, Esc | Claude Code's built-in login ran, and was cancelled | `Login … Select login method: ❯ 1. Claude account with subscription …` |
| 9 | `/logout`, Esc | Only Anthropic is listed (nothing stored), and Esc cancels | `Select provider to logout  Anthropic (Claude Code login)` / `Logout cancelled.` |

Not driven live: a successful key save and refresh, a real Codex sign-in with email, the two-account logout and the `(active)` marker. These need the user's own provider logins. Anthropic logout was not driven, because it would sign the user out of Claude. Side effect: each Codex attempt ran `open <authorize URL>` and opened an auth.openai.com browser tab. No sign-in was done.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. The verify publication scope allows only this report, and H2 needs a code change | — | — |

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security |
| **Location** | `src/login/pane.ts` (`drawSecret`), `src/login/masked-input.ts` |
| **Issue** | H2: the host `Input` draws the person's typing until the hook draws a new `value`. The mod redraws bullets only after `onInput` → `invalidate`, so each typed or pasted chunk is drawn in plain text for a moment |
| **Impact** | A pasted provider key is drawn on screen in full, briefly. This breaks AC6's masked input and FR8 |
| **Reason Not Fixed** | The verify scope allows only the report. Possible fix: register a `ui.input` hook for the `secret` element of this plugin's pane. It would record the raw text and call `next({ ...e, value: bullets })`, so the host never draws the raw value. Confirm live that the rewritten value is what gets drawn. If the host cannot hide the typing, record it as a host limit and ask for a masked `Input` option. Add a fake-engine model of the raw-echo window and a test for it |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Verification evidence |
| **Location** | Environment |
| **Issue** | AC4 has no live evidence in this run, because the auto-mode classifier blocked creating the temporary user config file. The success paths of AC6, AC7 and AC8 need the user's real OpenCode Go key and two Codex logins |
| **Reason Not Fixed** | The user should allow the temporary config file, or run these steps themselves, during the next verification |

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Testability |
| **Location** | `tests/support/fake-engine.ts` |
| **Issue** | The fake engine applies the mod's `value` at once, so it cannot catch H2 |
| **Reason Not Fixed** | Belongs with the H2 fix |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts` |
| **Issue** | L1 (carried over): the OAuth authorize URL is also written to the transcript. It holds no secret, and the pane now shows it cleanly, so the transcript copy can go |
| **Reason Not Fixed** | Optional; a product choice |

---

## Positive Observations

- C3, H1 and L2 are fixed and confirmed live.
- The Anthropic hand-off runs Claude Code's own login, and the mod stays out of it.
- A wrong-state OAuth paste and an invalid key save nothing, and no probe string reached the transcript.

---

## Recommendations Summary

### Before PR (Must)
- [ ] H2: stop the masked field from drawing raw input, and add a fake-engine test for it
- [ ] Re-run interactive verification with a temporary custom-provider config (AC4) and with the user's own logins for the success paths of AC6–AC8

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL

---

## Recommendation

**Needs fixes**

The pane is now focused, owned by its command and readable. Verification is **Fail** until the masked key field stops drawing raw input (H2), and until AC4 and the success paths of AC6–AC8 have live evidence.
