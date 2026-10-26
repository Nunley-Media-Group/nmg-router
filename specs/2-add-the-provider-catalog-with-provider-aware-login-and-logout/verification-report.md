# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-25
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec (re-verification after fix 8743ca1)
**Verification head**: 8743ca1c3497703c2a3803634ee9b5df9d64683b

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.3 |

### Implementation Status: Fail
**Total Issues**: 3 (1 critical, 1 medium, 1 low)

All three registered validations pass, and so do the 229 unit tests. Fix 8743ca1 fixes the earlier critical defect C1. The `command.run` hook now answers at once, the host no longer skips it, and Claude Code's built-in `/login` or `/logout` no longer runs in its place.

The fix causes a new critical defect, C2. The flow now opens the login pane after the hook has returned. The host therefore counts the pane as **unasked**, and an unasked pane is only drawn on terminals at least 144 columns wide (110 once the person has opened that pane before). In the live session the terminal was 91 columns wide. `/login` and `/logout` printed `The login pane waits for a wider terminal: unasked below 144 columns (91 now)` and drew no picker. The person cannot choose a provider, so AC5–AC8 fail live.

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
| repository.tests | builtin.command (`npm test`) | yes | passed (26 files, 229 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed |

No smoke validation is declared in the steering manifest. The interactive verification required by `project.verification` fails (see below), so the status is capped at Fail.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass (unit) | `src/providers/builtin/index.ts`; `tests/providers/builtin.test.ts`. The live picker was not drawn, so the provider rows could not be seen in this run |
| AC2 | Model discovery | Pass (unit only) | `src/catalog/catalog.ts`, `src/providers/builtin/opencode-go.ts`; `tests/catalog/discovery.test.ts` |
| AC3 | Cache, refresh and failure states | Pass (unit only) | `src/catalog/catalog.ts`; `tests/catalog/catalog.test.ts` |
| AC4 | Custom providers and filters | Pass | `src/config/user-config.ts`; `tests/config/user-config.test.ts`. Live: `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` The sentinel value was not echoed |
| AC5 | Login picker and Anthropic | **Fail** | Live at 91 columns, `/login` drew no picker, only `The login pane waits for a wider terminal: unasked below 144 columns (91 now)`. The person cannot reach the Anthropic row or any routed provider. The hook no longer falls through to the built-in login, which is the C1 fix (`tests/hooks/command-flow.test.ts`) |
| AC6 | API-key login | **Fail** | It is unreachable live because the picker is not drawn. The mock provider received no request (empty request log). Unit tests pass (`tests/login/login-command.test.ts`) |
| AC7 | OAuth login and refresh | **Fail** | It is unreachable live for the same reason. The paste flow, state check and refresh pass in unit tests (`tests/login/oauth-code-login.test.ts`). A real Codex sign-in needs the user |
| AC8 | Accounts and logout | **Fail** | Live, `/logout` also printed `The login pane waits for a wider terminal…`, and its open cancelled the pending `/login` flow (`Login cancelled.`). It did not run the built-in logout, and the Claude session stayed signed in. The account picker cannot be reached. Unit tests pass (`tests/login/logout-command.test.ts`) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001–T006 | Interfaces, HTTP, providers, auth, config, catalog | Complete | |
| T007 | Pane controller, fuzzy filter and masked input | Complete (defect) | The pane is opened outside the asked command hook; see C2 |
| T008 | /login and /logout commands and hook wiring | Complete (defect) | `hooks/register.ts` and `src/login/command-flow.ts` start the flow after the hook answers; see C2 |
| T009–T013 | Fakes, fixtures and tests | Complete | The fake engine models neither the asked/unasked placement rule nor the 144-column floor, so the suite cannot catch C2 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `command-flow.ts` isolates the run-after-the-hook logic. `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one registry entry |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `FlowHost` and `HostPort` picks are narrow |
| Dependency Inversion | 4 | No direct `$` use under `src/` |

### Notes

- `createCommandFlows().isHandoff` marks the Anthropic re-run so the hook passes it to `next(e)`. The host docs say `$.command.run` "runs through every hook but the calling one", so the guard may never be hit. It is harmless but unverified live.

---

## Security Assessment

- [x] PKCE S256, a checked state and no listening port. Credentials stay in the keyring
- [x] Config entries that look like credentials are refused by path without the value (confirmed live)
- [x] The new `.catch` answers a failed `/logout` with text and never falls through to the built-in logout. Live, the Claude session stayed signed in
- [x] The flow's error handler logs a fixed message, never the error, which might carry a provider reply
- Low (L1, carried over): the OAuth authorize URL is also written to the transcript

---

## Performance Assessment

- [x] `load()` makes no network call. Refresh runs per provider
- [x] The hook answers at once, so it no longer holds the 10 s budget

---

## Error Handling Assessment

- C1 (the 10 s budget overrun falling through to the built-in command) is **fixed**.
- **Critical (C2)**: `flows.start` returns `{}` and opens the pane later, outside the hook frame of the person's command. Under the host's placement rule ("Asked (the hook of a command the person typed …) a pane is placed at any width … Unasked it is placed from 144 terminal columns"), the picker stays undrawn on ordinary terminal widths. The flow promise then waits with nothing on screen. The log line tells the person to widen the terminal, but no picker appears.
- Medium (M1, still open): a flow left waiting on an undrawn pane is only settled when a later `/login` or `/logout` replaces it (live: `Login cancelled.`). Nothing times it out or closes it.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC4 | Yes | Yes (Vitest) | Yes |
| AC5–AC8 | Yes | Yes (Vitest) | Yes (unit) / No (live) |

- Unit tests: 229 in 26 files, all passing. They include the new `tests/hooks/command-flow.test.ts`
- Gap: `tests/support/fake-engine.ts` always places panes, so no test exercises the unasked, narrow-terminal case

---

## Exercise Test Results (Interactive Verification, herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude --pane <pane> -- --plugin-dir .` |
| **Setup** | A temporary `~/Library/Application Support/nmg-router/config.json` with the custom provider `local-test` (a mock on `127.0.0.1:18471`), the credential-bearing entry `leaky` holding a sentinel string, six `auth: "none"` filler providers (11 picker rows) and `disabledProviders: ["xai"]`. The config was removed, the mock stopped and the tab closed afterwards |
| **Startup** | Claude Code v2.1.310 at a 91-column terminal. No folder-trust dialog, and no hook or plugin load errors |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login` | The config problem is shown without its value. No picker is drawn, and the built-in login does not run | `nmg-router: Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` / `nmg-router: The login pane waits for a wider terminal: unasked below 144 columns (91 now): placed when the person opens it, or when the terminal is widened to 144 columns` |
| 2 | `/logout` | The pending login flow is cancelled. The logout pane is not drawn either, and the built-in logout does not run. The status line still shows the Claude plan | `nmg-router: Login cancelled.` / `nmg-router: The login pane waits for a wider terminal: unasked below 144 columns (91 now)…` |
| 3 | Mock request log | No request reached the mock provider | (empty) |

Not driven live:
- The steps after the picker (masked key, OAuth paste, account picker), which cannot be reached at this width. The herdr client window could not be widened to 144 columns from the worker.
- A real Codex OAuth sign-in, which needs the user's own login.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. The verify publication scope allows only this report, and C2 needs a code change | — | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling / Architecture |
| **Location** | `src/login/command-flow.ts` (`start`), `hooks/register.ts` (`command.run`), `src/login/pane.ts` (`open`) |
| **Issue** | The pane is opened after the `command.run` hook has answered, so the host treats it as unasked and draws it only from 144 columns (C2) |
| **Impact** | On terminals under 144 columns, `/login` and `/logout` show no picker, and AC5–AC8 cannot be completed |
| **Reason Not Fixed** | The verify scope allows only the report. Suggested fix: open the pane with `$.ui.open` inside the hook before it returns. This is a `$` call, so it pauses the budget, and it is placed because it answers the person's command. Then return `{}` and let the picks resolve from `ui.render` callbacks. Make the fake engine refuse to place panes opened outside the person's command hook below 144 columns, and add a test for that |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Error Handling |
| **Location** | `src/login/pane.ts`, `src/login/command-flow.ts` |
| **Issue** | A flow waiting on an undrawn pane stays pending until another command replaces it (M1) |
| **Impact** | A login that cannot be seen stays pending with no way to end it |
| **Reason Not Fixed** | It is part of the C2 fix |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts` |
| **Issue** | The OAuth authorize URL is also written to the transcript (L1). It holds no secret |
| **Reason Not Fixed** | Optional; this is a product choice |

---

## Positive Observations

- C1 is fixed. The hook answers within budget, and a failed `/logout` can no longer sign the person out of Claude.
- Credential hygiene is strong, and the live config refusal names the path without the value.
- Provider plugins, the catalog and auth are cleanly separated and fully unit-tested.

---

## Recommendations Summary

### Before PR (Must)
- [ ] C2: open the login/logout pane inside the person's `command.run` hook so it is placed at any width
- [ ] Model the asked/unasked placement rule in the fake engine and add a regression test
- [ ] Re-run interactive verification for AC5–AC8 at a terminal under 144 columns, including `/logout` of a stored dummy credential

### Short Term (Should)
- [ ] M1: settle and close a pane that is never placed

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL

---

## Recommendation

**Needs fixes**

The budget fix works, but the picker it opens is not drawn on terminals under 144 columns. Verification is **Fail** until the pane opens as an asked pane and AC5–AC8 are shown working interactively.
