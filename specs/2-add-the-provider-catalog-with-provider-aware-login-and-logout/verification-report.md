# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-26
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec (re-verification after fix 2187f79, merge 7c8dc30 and release commit 1d37f72)
**Verification head**: 1d37f72a57af35643bad498bd0d63547bbbdda49

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.0 |

### Implementation Status: Incomplete
**Total Issues**: 3 (0 critical, 0 high, 1 medium, 2 low)

All three registered validations pass at the verification head, with 238 unit tests in 26 files. No code defect was found in this run.

- **H2 fixed**: the masked API-key field no longer draws raw input. Pasted probes (`qprobe-x1`, `qprobe-x2`) and typed characters were read from the screen straight after each send. Every read showed only bullets, and no probe string appears anywhere in the scrollback.
- **AC4 is now shown live**: a temporary config file added a custom provider, disabled xAI and held a dummy `apiKey` entry. The picker listed the custom provider and hid xAI. The mod refused the entry by its path and pointed to `/login`, and it did not echo the dummy value.
- **AC5 fuzzy search is shown live**: with 11 rows the picker shows "Type to search", and typing `codx` narrowed it to OpenAI Codex.

The status is **Incomplete**, not Fail. The project's interactive-verification steering says that "An acceptance criterion with no interactive evidence leaves verification Incomplete." It also says to hand any step that needs the user's own login to the user. AC2 and AC3 have no interactive evidence, because discovery needs a stored provider credential. The success paths of AC6, AC7 and AC8 need the user's own OpenCode Go key and two OpenAI Codex sign-ins. The verifier never types a credential.

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

- Local verification: Not complete (the steps that need the user's provider logins have not run)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs` ran at the verification head on a clean tree (controller run id `3dae437e-cbc6-429b-b393-702530618736`). `.nmg-sdlc/verification/2.json` reports `ceiling: null` and coverage `declared: 3, recorded: 3, complete: true`.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| repository.typecheck | builtin.command (`npm run typecheck`) | yes | passed |
| repository.tests | builtin.command (`npm test`) | yes | passed (26 files, 238 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed (advisory warnings only: no author, no icon, CLAUDE.md at the plugin root, no install line in the README) |

The steering manifest declares no smoke validation. The registered gate puts no ceiling on the status. The `project.verification` interactive rule caps it at Incomplete, because AC2 and AC3 have no interactive evidence.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass | `src/providers/builtin/index.ts`; `tests/providers/builtin.test.ts`. Live: the picker listed OpenCode Go, ClinePass and OpenAI Codex, with xAI hidden by the test config. Live at the previous head with no config: all four providers, none Anthropic |
| AC2 | Model discovery | Unit pass; live **Incomplete** | `src/catalog/catalog.ts`, `src/providers/builtin/opencode-go.ts`; `tests/catalog/discovery.test.ts`. A live model list needs the user's OpenCode Go key |
| AC3 | Cache, refresh and failure states | Unit pass; live **Incomplete** | `src/catalog/catalog.ts`; `tests/catalog/catalog.test.ts`. Nothing on screen shows cache and failure states without a stored credential |
| AC4 | Custom providers and filters | Pass | `src/config/user-config.ts`, `src/providers/custom.ts`; `tests/config/user-config.test.ts`. Live: `Verify Local` listed, xAI hidden, and `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` The dummy value appears 0 times in the scrollback. `enabledModels` filtering is covered by unit tests only, because the picker shows providers, not models |
| AC5 | Login picker and Anthropic | Pass | Live: the picker is titled "Select provider to login" and shows each row's status. With 11 rows it shows `Type to search`, and `codx` narrowed it to `OpenAI Codex — not logged in`. Picking Anthropic opened Claude Code's own "Select login method" dialog, and Esc gave `Login interrupted` |
| AC6 | API-key login | Partial (success path needs the user) | Live: the field draws only bullets for pasted and typed input (H2 fixed). An invalid dummy key gave `Invalid OpenCode Go API key; nothing was saved.` The success path ("Logged in to OpenCode Go" and the refresh) needs the user's real key. Unit: `tests/login/login-command.test.ts`, `tests/login/pane.test.ts` |
| AC7 | OAuth login and refresh | Partial (success path needs the user) | Live: the pane showed the authorize URL (PKCE S256 with a state) and a paste field. A paste of `…/auth/callback?code=<dummy>&state=wrong-state` gave `The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.` The dummy code appears 0 times in the scrollback. The saved tokens, the email display and refresh need a real sign-in. Unit: `tests/login/oauth-code-login.test.ts` |
| AC8 | Accounts and logout | Partial (success path needs the user) | Live: with nothing stored, `/logout` listed only `Anthropic (Claude Code login)`, and Esc gave `Logout cancelled.` Two accounts, the `(active)` marker and the delete need two real Codex sign-ins. Anthropic logout was not picked, because it would sign the user out. Unit: `tests/login/logout-command.test.ts` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001–T006 | Interfaces, HTTP, providers, auth, config, catalog | Complete | The credential store is vault-only after the merge of #19 (7c8dc30) |
| T007 | Pane controller, fuzzy filter and masked input | Complete | H2 fix: the `Input` sits in a zero-height `overflow: hidden` Box, and a `Text` draws the bullets |
| T008 | /login and /logout commands and hook wiring | Complete | |
| T009–T013 | Fakes, fixtures and tests | Complete | New test: `keeps the field in a zero-height clip, so the host's raw echo is never drawn` |

Also delivered in 1d37f72: the version bump in `VERSION`, `package.json` and `.claude-plugin/plugin.json`, and a `CHANGELOG.md` entry.

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `command-flow.ts` owns the flow lifecycle and `pane.ts` the view. `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one registry entry |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `FlowHost`, `PaneHost` and `HostPort` are narrow |
| Dependency Inversion | 4 | Nothing under `src/` uses `$` directly |

### Layer Separation and Dependency Flow

The merge from main removed the keyring backends and the `routeThrough` fallback. `createCredentialStore` now calls `createVault` directly, and the error codes shrank to `anthropic_refused`, `invalid_id` and `vault_failed`. No other caller depended on the removed codes, and the type-check passes.

---

## Security Assessment

- [x] Masked input: no raw key is drawn on screen (H2 fixed, confirmed live)
- [x] OAuth: PKCE S256, a checked state and no listening port. A wrong-state paste saves nothing (confirmed live)
- [x] A credential in the config is refused by its path, and its value is not echoed (confirmed live)
- [x] Anthropic login and logout go through `next(e)`. A failed `/logout` never falls through to Claude Code's own logout (`.catch` in `hooks/register.ts`)
- Low (L1, carried over): the OAuth authorize URL is also written to the transcript. It holds no secret

---

## Performance Assessment

- [x] `load()` makes no network call, and refresh runs per provider (unit)
- [x] The command hook opens the pane and answers, so the hook budget is not at risk

---

## Error Handling Assessment

- An invalid key, a wrong-state paste, Esc in either picker, and Esc in Claude Code's login dialog each end with a clear message and change nothing.
- Low (L3): the config warning for a refused entry is logged again on every `/login` and `/logout`. It is correct, but it repeats.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1, AC4, AC5 | Yes | Yes (Vitest) | Unit yes / live yes |
| AC2, AC3 | Yes | Yes (Vitest) | Unit yes / live not run (needs a credential) |
| AC6, AC7, AC8 | Yes | Yes (Vitest) | Unit yes / live partial (success paths need the user's logins) |

- Unit tests: 238 in 26 files, all passing. The count fell from 242 because the merge removed the keyring tests.

---

## Interactive Verification (herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude --pane <pane> -- --plugin-dir .`. Keys were sent with `herdr pane send-text` and `send-keys`, and the screen was read with `herdr agent read --source recent-unwrapped`. The tab was closed afterwards |
| **Startup** | Claude Code v2.1.310. No folder-trust dialog, and no hook or plugin load errors |
| **Setup** | A temporary `~/Library/Application Support/nmg-router/config.json` with a custom `verify-local` provider (`auth: none`), a `leaky` entry with a dummy `apiKey`, `disabledProviders: ["xai"]` and `enabledModels`. Six more `auth: none` providers were added later to pass 10 rows. The file was removed after the run. Only dummy values were used |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login` | Config entry refused, custom provider shown, xAI hidden | `nmg-router: Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` / `Select provider to login` / `OpenCode Go — not logged in` / `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `Verify Local` |
| 2 | OpenCode Go | Key step drawn | `Log in to OpenCode Go` / `OpenCode Go API key: (paste or type the key)` |
| 3 | Paste `qprobe-x1`, read at once; paste `qprobe-x2`, read five times at once | Only bullets were ever drawn (H2 fixed) | `OpenCode Go API key: •••••••••` → `••••••••••••••••••` |
| 4 | Type `k`, `e`, `y`, Backspace, each read at once; then Enter | Only bullets, then refused | `OpenCode Go API key: •••••••••••••••••••` / `Invalid OpenCode Go API key; nothing was saved.` |
| 5 | `/login` → OpenAI Codex | URL and paste field drawn | `Log in to OpenAI Codex` / `…code_challenge_method=S256&state=…` / `Redirect URL or code: Paste here ⏎ submit` |
| 6 | Paste `…/auth/callback?code=<dummy>&state=wrong-state`, Enter | Refused | `The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.` |
| 7 | `/login` → Anthropic, Esc | Claude Code's built-in login ran | `Login … Select login method: ❯ 1. Claude account with subscription …` / `Login interrupted` |
| 8 | `/logout`, Esc | Only Anthropic is listed (nothing stored) | `Select provider to logout` / `Anthropic (Claude Code login)` / `Logout cancelled.` |
| 9 | `/login` with 11 rows, type `codx`, Esc | Fuzzy search shown and working | `Type to search ⏎ submit` → `codx ⏎ submit` / `OpenAI Codex — not logged in` / `Login cancelled.` |

After the run, a search of the scrollback found 0 matches for `qprobe`, `DUMMYVALUE` and `dummycode`.

Handed to the user (not driven, since they need the user's own credentials): saving a valid OpenCode Go key, with "Logged in to OpenCode Go" and the model refresh (AC2, AC6); discovered models and the cached and failure states (AC3); a real Codex sign-in with the email display and saved tokens (AC7); and two Codex accounts with `(active)` and deletion at `/logout` (AC8). Anthropic logout was not driven, because it would sign the user out of Claude. Side effect: the Codex step ran `open <authorize URL>`, which opened an auth.openai.com browser tab. No sign-in was done.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None was needed. No code defect was found | — | — |

## Remaining Issues

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Verification evidence |
| **Location** | Environment |
| **Issue** | AC2 and AC3 have no interactive evidence. The success paths of AC6, AC7 and AC8 have not been driven live |
| **Impact** | Under the project's interactive-verification steering, the status stays Incomplete |
| **Reason Not Fixed** | These steps need the user's own OpenCode Go key and two OpenAI Codex sign-ins, and the verifier never types a credential. The user should run `/login` with OpenCode Go (then check the success message and that the row shows `✓ logged in`), sign in to Codex twice, and run `/logout`, or allow a verification session that the user signs in to. This is not a code change, so it should not go back to implementation |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts` |
| **Issue** | L1 (carried over): the OAuth authorize URL is also written to the transcript. It holds no secret |
| **Reason Not Fixed** | Optional; a product choice |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error handling (UX) |
| **Location** | `src/login/login-command.ts`, `src/login/logout-command.ts` |
| **Issue** | L3: the warning for a refused config entry is logged again on every `/login` and `/logout` |
| **Reason Not Fixed** | The spec only requires the message. Showing it once per session is optional |

---

## Positive Observations

- H2 is fixed in a simple way: the host's raw echo is clipped to zero height, and the bullets are drawn separately. A unit test locks this in.
- Refused config entries, invalid keys and wrong-state pastes save nothing, and no probe value reached the screen or the transcript.
- The Anthropic hand-off runs Claude Code's own login, and the mod stays out of it.

---

## Recommendations Summary

### Before PR (Must)
- [ ] The user runs the credential-dependent steps for AC2, AC3, AC6, AC7 and AC8, and they are recorded in a fresh verification

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL
- [ ] L3: log each config warning once per session

---

## Recommendation

**Needs the user's live sign-in evidence, not code changes**

The code meets every acceptance criterion in unit tests and in every live path that needs no credential. H2 is fixed. Verification is **Incomplete** until the user's own provider logins provide interactive evidence for AC2, AC3 and the success paths of AC6–AC8.
