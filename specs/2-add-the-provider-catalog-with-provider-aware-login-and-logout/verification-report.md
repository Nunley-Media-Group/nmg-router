# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-25
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: d16d7612f4beccaa0b02b780d98efdfc36a7077e

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 2 |
| **Overall** | 3.3 |

### Implementation Status: Fail
**Total Issues**: 3 (1 critical, 1 medium, 1 low)

All three registered validations pass, and the unit suite (221 tests) covers every AC with fakes. The interactive run in the real host shows a critical defect: the `command.run` hook waits for the person's pick inside its own code, so the host's 10 s hook budget runs out. The host then skips the hook and runs Claude Code's built-in `/login` in its place. No routed-provider login can finish at a normal human pace, so AC5–AC8 fail in the live session.

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

`sdlc-verify-steering.mjs` ran at the verification head on a clean tree. `.nmg-sdlc/verification/2.json` reports `ceiling: null` and coverage `declared: 3, recorded: 3, complete: true`.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| repository.typecheck | builtin.command (`npm run typecheck`) | yes | passed |
| repository.tests | builtin.command (`npm test`) | yes | passed (25 files, 221 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed |

No smoke validation is declared in the steering manifest.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass | `src/providers/builtin/index.ts:7`; `tests/providers/builtin.test.ts`. Live: the picker offered OpenCode Go, ClinePass and OpenAI Codex, and hid xAI because the test config disabled it |
| AC2 | Model discovery | Pass (unit only) | `src/catalog/catalog.ts:76` drops Anthropic ids and resolves wires; `src/providers/builtin/opencode-go.ts:28`; `tests/catalog/discovery.test.ts`. No live discovery ran because no login finished |
| AC3 | Cache, refresh and failure states | Pass (unit only) | `src/catalog/catalog.ts:103`, `:166`; `tests/catalog/catalog.test.ts` |
| AC4 | Custom providers and filters | Pass | `src/config/user-config.ts:83`; `tests/config/user-config.test.ts`. Live: the custom "Local Test" provider and six filler providers appeared, xAI was hidden, and a transcript line read `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.`, without echoing the sentinel value |
| AC5 | Login picker and Anthropic | **Fail** | The title, statuses and fuzzy search work live (11 rows show a search field, and "loc" narrows to `Local Test — not logged in`). After 10 s the host skips the hook (`nmg-router: command.run hook skipped: ran past its 10s budget`) and runs the built-in login whatever the person picks |
| AC6 | API-key login | **Fail** | After a provider was picked and the key typed in the masked field, the built-in Anthropic "Select login method" dialog replaced the pane. The mock provider never got a `/v1/models` validation request, so nothing was validated or saved. Unit tests pass (`tests/login/login-command.test.ts`) |
| AC7 | OAuth login and refresh | **Fail** | It uses the same hook and wait as AC6, so it has the same budget overrun. The paste-based design, state check and refresh are correct in the unit tests (`src/auth/oauth-code-login.ts:59`, `src/auth/access-token.ts:21`, `tests/login/oauth-code-login.test.ts`). It was not driven live, because a real Codex sign-in needs the user |
| AC8 | Accounts and logout | **Fail** | It uses the same hook pattern, so the logout picker would also overrun and fall through to Claude Code's built-in `/logout`, which signs the person out of Claude. It was not driven live for that reason. The logic passes in the unit tests (`src/login/logout-command.ts`, `tests/login/logout-command.test.ts`) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Provider plugin interfaces and registry | Complete | |
| T002 | HTTP helper and OpenAI list parser | Complete | |
| T003 | Built-in provider plugins and bundled metadata | Complete | |
| T004 | PKCE, JWT, accounts and login methods | Complete | |
| T005 | User config loader | Complete | |
| T006 | Catalog with cache, refresh and status | Complete | |
| T007 | Pane controller, fuzzy filter and masked input | Complete (defect) | The pane waits on the person inside the hook's own time; see C1 |
| T008 | /login and /logout commands and hook wiring | Complete (defect) | `hooks/register.ts:21` awaits the whole interactive flow inside `command.run`; see C1 |
| T009 | Fake engine extensions and fixtures | Complete | |
| T010 | Provider, discovery and catalog tests | Complete | |
| T011 | Config tests | Complete | |
| T012 | Login and logout tests | Complete | The fake engine has no hook budget, so the tests cannot catch C1 |
| T013 | Credential leak tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Clean split into providers, auth, catalog, config and login; `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one `BUILTIN_PROVIDERS` entry; custom providers adapt to the same `ProviderPlugin` |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `HostPort` picks are narrow per consumer |
| Dependency Inversion | 4 | Everything takes the injected `HostPort`; no direct `$` use under `src/` |

### Layer Separation

Pure parsing, model-id and pattern logic is kept apart from host I/O. The long `HostPort` switch in `hooks/register.ts` exists to meet the host's literal-name rule and holds no logic.

### Dependency Flow

The flow is one-way: hooks → services → catalog/login → providers/auth → http/credentials. No cycles were found.

---

## Security Assessment

- [x] Authentication: PKCE S256, a random state checked on paste, no listening port. Credentials stay in the keyring
- [x] Authorization: N/A
- [x] Input validation: config entries with credential-shaped keys or headers are refused by path, without the value. Anthropic ids and hosts are refused
- [x] Injection prevention: the browser opener uses a fixed argv with no shell (`src/login/login-command.ts:43`)
- [x] Data protection: HTTP outcomes carry no bodies. The cache and labels hold no secrets. Sentinel tests cover the leak paths
- Finding (Low, L1): `oauthFlow` writes the authorize URL to the transcript with `ui.log`. It holds no secret, only the state and PKCE challenge, but it is redundant with the pane

---

## Performance Assessment

- [x] Async patterns: `load()` makes no network call. Refresh is sequential per provider, which is fine for four providers
- [x] Caching: `catalog.cache` in `$.store` keeps prior models marked cached
- [x] Resource management: one pane per engine. Services are rebuilt per command, which is cheap
- [x] Query optimization: N/A

---

## Error Handling Assessment

- `LoginError`/`ConfigProblem` messages carry no secrets or bodies.
- **Critical (C1)**: the hook does not account for the host's `HookBudget.ms = 10_000`. Only `next(e)` and `$` calls pause the budget clock. The pane's promise is resolved by `ui.render` callbacks, not by a `$` call, so the time the person spends choosing counts against the hook. Past 10 s the host skips the hook and runs `next(e)`, the built-in command. For `/logout` that fallback signs the person out of Claude, the opposite of their choice. No `.catch` handler or budget-aware path exists.
- Medium (M1): when the host skips the hook, the pane is left open and orphaned. After the skip, the transcript showed the picker still drawn under "Login interrupted".

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes | Yes (Vitest) | Yes |
| AC2 | Yes | Yes (Vitest) | Yes |
| AC3 | Yes | Yes (Vitest) | Yes |
| AC4 | Yes | Yes (Vitest) | Yes |
| AC5 | Yes | Yes (Vitest) | Yes (unit) / No (live) |
| AC6 | Yes | Yes (Vitest) | Yes (unit) / No (live) |
| AC7 | Yes | Yes (Vitest) | Yes (unit) / No (live) |
| AC8 | Yes | Yes (Vitest) | Yes (unit) / not run live |

### Coverage Summary

- Feature file: 8 scenarios
- Unit tests: 221 tests in 25 files, all passing
- Gap: `tests/support/fake-engine.ts` does not enforce the 10 s hook budget, so the suite cannot catch C1

---

## Exercise Test Results (Interactive Verification, herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude -- --plugin-dir .` at the worktree root |
| **Setup** | A temporary `~/Library/Application Support/nmg-router/config.json` with the custom provider `local-test` pointing at a local mock (`127.0.0.1:18471`), the credential-bearing entry `leaky`, six `auth: "none"` filler providers (11 picker rows), and `disabledProviders: ["xai"]`. The config and mock were removed afterwards and the tab was closed |
| **Startup** | No folder-trust dialog, and no hook or plugin load errors |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login`, then wait over 10 s | Picker drawn with title, search field and Anthropic row. The hook is then skipped and the built-in Anthropic login opens | `nmg-router: command.run hook skipped: ran past its 10s budget` / `Login … Browser didn't open? Use the url below to sign in` |
| 2 | (startup of #1) | The config problem is shown without its value | `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` |
| 3 | `/login`, type `loc` | Fuzzy search narrows the list to the custom provider with its status | `Select provider to login  loc ⏎ submit  Local Test — not logged in ▾ [ Cancel ]` |
| 4 | Enter, type a dummy key `good-test-key` (not a credential) | The masked-key pane opens (`Log in to Local Test … The key is checked against the provider before it is saved.`), then the built-in "Select login method" dialog replaces it. No validation request reached the mock | `Select login method: ❯ 1. Claude account with subscription …` |
| 5 | Esc ×2 | The built-in login is cancelled. The Claude session stays signed in (status line still shows plan usage) | `/login ⎿ Login interrupted` |
| 6 | `/model` | Only Claude models are listed. Routed `/model` rows are out of scope for #2. Cancelled with Esc | `Select model … Opus 5.5 ✔ … Haiku 5.5` |

Not driven live:
- `/logout`, because the same budget overrun would run Claude Code's built-in logout and sign the user out of Claude.
- A real Codex OAuth sign-in, which needs the user's own login.

Layout note: the pane's `Box` draws its children in one row. The title, search field, select and Cancel button sit side by side, and the title wraps. This is cosmetic and was not counted against an AC.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. The verify publication scope allows only this report, and C1 needs a design change | — | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling / Architecture |
| **Location** | `hooks/register.ts:21`, `src/login/pane.ts:198`, `src/login/login-command.ts:118`, `src/login/logout-command.ts:56` |
| **Issue** | The `command.run` hook awaits the person's picks and typing in its own time. Under `HookBudget.ms = 10_000`, the host skips the hook after 10 s and runs `next(e)` |
| **Impact** | Routed-provider `/login` (API key and OAuth) cannot finish at a human pace. `/logout` would fall through to Claude Code's built-in logout and sign the person out of Claude. AC5–AC8 fail live |
| **Reason Not Fixed** | This needs a design change (C1), not a local patch, and the verify scope allows only the report. Options: (a) answer `command.run` at once with `{ text }` and run the flow outside the hook budget, settling from `ui.render` callbacks and reporting with `$.ui.log` or a toast; (b) wait on the person through a `$` call that pauses the budget clock; (c) at minimum, add a `.catch` that returns `{ text }` instead of `next(e)`, so a timeout never runs the built-in logout. The fake engine should also model the budget, so a test catches this |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Error Handling |
| **Location** | `src/login/pane.ts` |
| **Issue** | When the hook is skipped, the pane stays open with a pending promise that never settles (M1) |
| **Impact** | A stale picker is left on screen after a fallback |
| **Reason Not Fixed** | It is part of the C1 redesign |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts:96` |
| **Issue** | The OAuth authorize URL is also written to the transcript (L1) |
| **Impact** | Transcript noise. The URL holds no secret |
| **Reason Not Fixed** | Optional; this is a product choice |

---

## Positive Observations

- Provider plugins are self-contained, with a clear extension point.
- Credential hygiene is strong. Outcomes carry no bodies, config refusals name the path without the value, and sentinel tests cover login, refresh, discovery, logout and error paths.
- Anthropic is guarded at every layer: registry, config, custom hosts and discovered model ids.
- Fuzzy search, statuses and config problem messages behave as specified in the live host.

---

## Recommendations Summary

### Before PR (Must)
- [ ] C1: move the interactive login/logout flow out of the `command.run` budget, and make sure a hook failure never falls through to the built-in `/logout`
- [ ] Add a budget-aware fake-engine test that drives a pick after more than 10 s
- [ ] Re-run interactive verification for AC5–AC8, including a `/logout` of a stored credential

### Short Term (Should)
- [ ] M1: settle and close the pane when the hook is aborted (`next.signal`)
- [ ] Lay the pane out as a column so the title, field and buttons stack

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 1 | C1 |
| `src/login/pane.ts` | 2 | C1, M1 |
| `src/login/login-command.ts` | 2 | C1, L1 |
| `src/login/logout-command.ts` | 1 | C1 |
| `src/auth/*.ts` | 0 | |
| `src/catalog/*.ts` | 0 | |
| `src/config/user-config.ts`, `src/providers/**` | 0 | |
| `tests/**` | 1 | The fake engine has no hook budget |

---

## Recommendation

**Needs fixes**

The catalog, config, auth and credential code is well built and fully unit-tested. In the real host, however, the provider-aware `/login` and `/logout` cannot finish, because the host's 10 s hook budget skips the hook. Verification is **Fail** until C1 is fixed and AC5–AC8 are shown working interactively.
