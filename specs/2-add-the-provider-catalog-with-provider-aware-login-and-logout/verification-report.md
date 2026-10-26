# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-25
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec (re-verification after fix 84f288e)
**Verification head**: 84f288eb96d67e152792301877a4292385946638

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 3 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.3 |

### Implementation Status: Fail
**Total Issues**: 5 (1 critical, 1 high, 1 medium, 2 low)

All three registered validations pass, and so do the 235 unit tests. Fix 84f288e fixes C2. Live at 91 columns, `/login` and `/logout` now draw their picker. Fuzzy search, the masked key field, invalid-key refusal, the Anthropic hand-off and logout cancel all work.

Two new defects block the flows live:

- **C3 (critical)**: in the OpenAI Codex OAuth step, the pane's "Redirect URL or code" field never gets keyboard focus. Typing and pasting go to Claude's chat prompt. A pasted redirect URL, which carries the authorization code, is sent to the model as a chat message. AC7 cannot be completed, and the code leaks into the transcript.
- **H1 (high)**: a `/login` or `/logout` run while an earlier flow is still pending loses its pane. The old flow's cleanup closes the new pane, so the next step reopens it unasked and it is not placed (`The login pane could not be shown: unasked below 110 columns (91 now…)` then `Login cancelled.`).

The keychain in this session was locked (`security` exit 36), so no credential could be saved live. AC6's success path and AC8's account steps have no interactive evidence and need the user's unlocked keychain.

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

- Local verification: Not complete (interactive verification fails)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs` ran at the verification head on a clean tree (run id `d71ecb44-1ddc-487b-917e-e1fc843ed3ca`). `.nmg-sdlc/verification/2.json` reports `ceiling: null` and coverage `declared: 3, recorded: 3, complete: true`.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| repository.typecheck | builtin.command (`npm run typecheck`) | yes | passed |
| repository.tests | builtin.command (`npm test`) | yes | passed (26 files, 235 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed |

The steering manifest declares no smoke validation. The interactive verification that `project.verification` requires fails (see below), so the status is capped at Fail.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass | `src/providers/builtin/index.ts`; `tests/providers/builtin.test.ts`. Live: searching the picker found `OpenCode Go`, `ClinePass` and `OpenAI Codex`. xAI was hidden by `disabledProviders` |
| AC2 | Model discovery | Pass (unit only) | `src/catalog/catalog.ts`, `src/providers/builtin/opencode-go.ts`; `tests/catalog/discovery.test.ts` |
| AC3 | Cache, refresh and failure states | Pass (unit only) | `src/catalog/catalog.ts`; `tests/catalog/catalog.test.ts` |
| AC4 | Custom providers and filters | Pass | `src/config/user-config.ts`; `tests/config/user-config.test.ts`. Live: the custom `Local Test` provider was listed, xAI was hidden, and `leaky` gave `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` The sentinel value was not echoed |
| AC5 | Login picker and Anthropic | Pass | Live at 91 columns: the picker was titled "Select provider to login", with a "Type to search" field (11 rows) and rows such as `Local Test — not logged in` and `OpenAI Codex — not logged in`. Picking Anthropic opened Claude Code's own "Select login method" dialog, which was cancelled. The session stayed signed in |
| AC6 | API-key login | **Incomplete** | Live: the masked field drew only `•••••••••••••••••`. An invalid key gave `Invalid Local Test API key; nothing was saved.`, and the mock logged `auth=other`. A valid key was validated (mock `auth=valid`), but the save hit `The macos keyring is locked; the credential for local-test was not changed.` That is correct fail-closed behaviour, but "Logged in to …" and the refresh were not shown. Unit tests pass |
| AC7 | OAuth login and refresh | **Fail** | Live: the pane showed the authorize URL (PKCE S256, state) and the "Redirect URL or code: Paste here" field. Text typed or pasted went to Claude's chat prompt, not the field (C3), so the paste flow cannot be completed. The state check and refresh pass only in unit tests (`tests/login/oauth-code-login.test.ts`) |
| AC8 | Accounts and logout | **Incomplete** | Live: with no stored credential, `/logout` listed only `Anthropic (Claude Code login)`, and Esc gave `Logout cancelled.` The two-account picker, `(active)` marker and delete could not be driven because the keychain was locked. Anthropic logout was not picked, so the user was not signed out. Unit tests pass (`tests/login/logout-command.test.ts`) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001–T006 | Interfaces, HTTP, providers, auth, config, catalog | Complete | |
| T007 | Pane controller, fuzzy filter and masked input | Complete (defects) | C3: the text step does not take focus. H1: `end()` is not tied to the `begin()` that opened the pane. L2: layout |
| T008 | /login and /logout commands and hook wiring | Complete (defect) | `src/login/command-flow.ts`: a superseded flow's `.finally(() => pane.end())` closes the next flow's pane (H1) |
| T009–T013 | Fakes, fixtures and tests | Complete | The fake engine models neither keyboard focus nor a second command arriving while a flow is pending |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `command-flow.ts` owns the flow lifecycle, `pane.ts` the view. `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one registry entry |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `FlowHost` and the `Pick<PaneController, "begin" \| "end">` are narrow |
| Dependency Inversion | 4 | No direct `$` use under `src/` |

### Notes

- The pane controller is a module-level singleton with mutable `pending` and `held` state, shared by overlapping flows. Each flow has no ownership token for the pane, and this is the root of H1.

---

## Security Assessment

- [x] PKCE S256, a checked state and no listening port. Credentials stay in the keyring, and a locked keyring fails closed (confirmed live)
- [x] Config entries that look like credentials are refused by path, without the value (confirmed live)
- [x] The masked field draws only `•` (confirmed live)
- [ ] **C3**: because the paste field has no focus, a person who pastes the redirect URL sends the OAuth authorization code to the model as a chat prompt. It is then kept in the transcript and sent to Anthropic. This breaks FR8's intent ("No credential in UI text, logs…")
- Low (L1, carried over): the OAuth authorize URL is also written to the transcript. It holds no secret

---

## Performance Assessment

- [x] `load()` makes no network call, and refresh runs per provider
- [x] The hook opens the pane with a `$` call and answers. The 10 s budget is no longer at risk

---

## Error Handling Assessment

- C2 (the unasked pane not being drawn below 144 columns) is **fixed** for the first `/login` or `/logout` of a session.
- M1 (an undrawn pane waiting forever) is **fixed**: an open that is not placed now logs its reason and ends the step (`Login cancelled.`).
- **High (H1)**: `createCommandFlows().start` runs `flow(next).finally(() => pane.end())`. When a new command's `begin()` cancels the pending step of the old flow, the old flow settles and its `finally` calls `end()` *after* the new `begin()` set `held`. This clears `held` and closes the new pane. The new flow's next `open()` then calls `ui.open` outside the hook, and the host does not place it (`unasked below 110 columns (91 now, an id the person opened before)`). Live, the person had to run `/login` twice.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC4 | Yes | Yes (Vitest) | Yes |
| AC5 | Yes | Yes (Vitest) | Yes (unit and live) |
| AC6, AC8 | Yes | Yes (Vitest) | Yes (unit) / Incomplete (live, keychain locked) |
| AC7 | Yes | Yes (Vitest) | Yes (unit) / No (live) |

- Unit tests: 235 in 26 files, all passing.
- Gaps: no test runs a second `start()` while a flow is pending and then checks the new flow's pane stays held and placed. The fake engine does not model keyboard focus.

---

## Exercise Test Results (Interactive Verification, herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude --pane <pane> -- --plugin-dir .`. Keys were sent with `herdr agent send-keys` and `herdr pane send-text`, and the screen was read with `herdr agent read` |
| **Setup** | A temporary `~/Library/Application Support/nmg-router/config.json` held the custom API-key provider `local-test` (a mock on `127.0.0.1:18471` that accepts only the dummy key `nmgtest-valid-key`) and the credential-bearing entry `leaky` with a sentinel value. It also held six `auth: "none"` filler providers (11 picker rows) and `disabledProviders: ["xai"]`. Afterwards the config was removed, the mock stopped and the tab closed |
| **Startup** | Claude Code v2.1.310 at a 91-column terminal. No folder-trust dialog, and no hook or plugin load errors |
| **Environment** | `security show-keychain-info` gives `User interaction is not allowed` (exit 36) in this session, both from the worker and from a herdr shell. The login keychain is locked, and unlocking it needs the user's password |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login` | The picker is drawn at 91 columns, with search because there are 11 rows. The config problem is shown without its value | `Select provider to login  Type to search ⏎ submit Anthropic (Claude Code login) ▾ [ Cancel ]` / `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` |
| 2 | Type `local`, Enter | Fuzzy filter, then the masked key step in the same pane | `Local Test — not logged in` → `Local Test API key: Paste or type the key` |
| 3 | Type `nmgtest-wrong-key`, Enter | Masked, validated, refused | `Local Test API key: •••••••••••••••••` / `Invalid Local Test API key; nothing was saved.` (mock: `GET /v1/models auth=other`) |
| 4 | `/login` → Local Test → `nmgtest-valid-key` | Validated. The save was refused because the keychain is locked | mock `auth=valid` / `The macos keyring is locked; the credential for local-test was not changed.` |
| 5 | `/logout`, Esc | Only Anthropic is listed (nothing stored), and Esc cancels | `Select provider to logout Anthropic (Claude Code login)` / `Logout cancelled.` |
| 6 | `/login`, Enter on Anthropic, Esc | Claude Code's built-in login ran, and was cancelled | `Login … Select login method: ❯ 1. Claude account with subscription …` |
| 7 | `/login` + `opencode`, `cline`, `codex`, `xai`, `filler`, `leaky` | Rows and status. xAI is absent (`xai` only fuzzy-matches OpenAI Codex), and `leaky` is absent | `OpenCode Go — not logged in`, `ClinePass — not logged in`, `OpenAI Codex — not logged in`, `Filler 1`, `No matching providers` |
| 8 | `/login` → OpenAI Codex, then paste `http://localhost:1455/auth/callback?code=nmgtest-code&state=wrong-state` | The pane shows the URL and the paste field, but the paste reached the chat prompt and was sent to the model (C3) | `Log in to OpenAI Codex  Open this URL, sign in, then paste… Redirect URL or code: Paste here` / `❯ http://localhost:1455/auth/callback?code=nmgtest-code&state=wrong-state` |
| 9 | `/login` while the step-8 flow was pending | The old flow was cancelled, and the new pane closed and could not be reopened (H1) | `Login cancelled.` / `The login pane could not be shown: unasked below 110 columns (91 now, an id the person opened before)…` / `Login cancelled.` |
| 10 | Fresh `/login` → Codex, then type `z` | Reproduced C3 from a clean state: the field stays empty and `z` lands in the chat prompt | `Redirect URL or code: Paste here` / `❯ z` |

Not driven live:
- A successful API-key save, the account picker and logout of a stored account (AC6, AC8). These need the user's keychain unlocked.
- A real Codex OAuth sign-in. It needs the user's own login and is blocked by C3 in any case.
- Picking Anthropic in `/logout`, which would sign the user out of Claude.

Side effect: the Codex step runs `open <authorize URL>`, so each Codex attempt opened a browser tab at auth.openai.com. No sign-in was done.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. The verify publication scope allows only this report, and C3 and H1 need code changes | — | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling / Security |
| **Location** | `src/login/pane.ts` (`drawText`, held-pane `open`), `src/login/login-command.ts` (`oauthFlow`) |
| **Issue** | C3: the OAuth "Redirect URL or code" input has no keyboard focus, and keystrokes and pastes go to Claude's chat prompt. The API-key step does receive input, so the difference is in the OAuth path. Possible causes: `oauthFlow` writes `host.ui.log(...)` and runs `open <url>` (the browser takes the terminal's focus) between the select and text steps, while the held pane shows only `Working…` with nothing focusable. Or `drawText`'s `Input` is uncontrolled (no `value`) |
| **Impact** | AC7 cannot be completed. A person who pastes the redirect URL sends the authorization code to the model and the transcript |
| **Reason Not Fixed** | The verify scope allows only the report. Suggested fix: re-assert focus when the text step is drawn (a focused element, or re-request focus on the held pane after `log` and `open`), make the Input controlled like the secret field, and add a fake-engine focus model with a test |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling |
| **Location** | `src/login/command-flow.ts` (`start`: `.finally(() => pane.end())`), `src/login/pane.ts` (`begin`, `end`) |
| **Issue** | H1: a superseded flow's `end()` closes the pane that the next command's `begin()` just opened |
| **Impact** | Re-running `/login` or `/logout` while a step is pending fails with "could not be shown … unasked", and the person must run it again |
| **Reason Not Fixed** | The verify scope allows only the report. Suggested fix: have `begin` return a token or generation, and let `end(token)` close only the pane it opened. Or skip `end()` when the flow was superseded. Add a test that runs two `start()` calls back to back |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Verification evidence |
| **Location** | Environment |
| **Issue** | The login keychain is locked in this verification session (`security` exit 36), so AC6's success path and AC8's account steps have no live evidence |
| **Reason Not Fixed** | Unlocking needs the user's password. The user should run these steps with an unlocked keychain, or verification should run where the keychain is unlocked |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Usability |
| **Location** | `src/login/pane.ts` (`drawSelect`, `drawSecret`, `drawText`) |
| **Issue** | L2: children of the root `Box` are laid out in a row. Title, hint, field and button sit side by side, and the OAuth URL wraps inside a 23-column cell, so it cannot be copied cleanly from the pane |
| **Reason Not Fixed** | The verify scope allows only the report. Suggested fix: `flexDirection: "column"` on the root `Box` |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts` |
| **Issue** | L1 (carried over): the OAuth authorize URL is also written to the transcript. It holds no secret, and while L2 stands it is the only copyable form |
| **Reason Not Fixed** | Optional; this is a product choice |

---

## Positive Observations

- C2 and M1 are fixed. The picker draws at 91 columns, and a pane that cannot be placed ends the step instead of hanging.
- The Anthropic hand-off runs Claude Code's own login, and the mod stays out of it.
- Credential hygiene holds live: the key is masked, an invalid key is not saved, the config sentinel is not echoed, and a locked keyring fails closed with no vault fallback.

---

## Recommendations Summary

### Before PR (Must)
- [ ] C3: give the OAuth paste field keyboard focus, and add a focus-aware fake-engine test
- [ ] H1: tie `end()` to the `begin()` that opened the pane, and add a test with a second command while a flow is pending
- [ ] Re-run interactive verification for AC6–AC8 with an unlocked keychain, including a stored dummy credential and `/logout` of it

### Short Term (Should)
- [ ] L2: lay out the pane as a column so the URL and fields are readable

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL once the pane shows it copyably

---

## Recommendation

**Needs fixes**

The C2 fix works and the picker is usable at ordinary widths. Verification is **Fail** until C3 and H1 are fixed and AC6–AC8 are shown working interactively.
