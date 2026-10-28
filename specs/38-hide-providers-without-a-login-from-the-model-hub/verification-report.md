# Verification Report: Hide providers without a login from the /model hub

**Date**: 2026-10-27
**Issue**: #38
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 88927ceecdd9469d6ff033d0d6418b35fb8641ce

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 0 blocking. 2 manual-verification gaps are recorded below. Each affected criterion also has live evidence and controller-level unit evidence.

The change does what the spec asks. `rebuild()` lists an enabled provider only when its login kind is `none` or it has at least one stored login. It reads that on every `open()`. The locked state, locked view, bundled preview rows and in-hub login are gone. `/login` and `/logout` still list every enabled provider. All three registered validations passed at the verification head. The live herdr session showed hiding, appearing after a login, staying listed while offline, and hiding after a logout, all with a throwaway provider.

---

## Issue Scope

- Active issue: #38
- Spec: `specs/38-hide-providers-without-a-login-from-the-model-hub`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC6]; FR [FR1–FR5]; tasks [T001–T005]; scenarios [SCN001–SCN006]
- Regression: none

<!-- nmg-sdlc-issue-scope: {"issueNumber":38,"specPath":"specs/38-hide-providers-without-a-login-from-the-model-hub","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --base main --controller-run-id 3303deb8-1e23-4925-b19b-9fbc2079f306`, which returned `ok: true` and `ceiling: null`
- Artifact: `.nmg-sdlc/verification/38.json` at head `88927ce…`, tree clean
- Coverage: declared 3, recorded 3, complete `true`, with no missing, duplicate or unknown results

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `tsc --noEmit` exited 0 |
| `repository.tests` | yes | passed | `Test Files 68 passed (68)`, `Tests 584 passed (584)` |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .`: `✔ Validation passed with warnings` (the standard hooks-module notice) |

No smoke validation (`repository.nmg-sdlc-smoke` / `project.nmg-sdlc-smoke`) is declared in `steering/manifest.json`.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A provider without a login has no hub entry | Pass | `src/hub/hub-controller.ts` `rebuild()` skips a provider when its `login.kind !== "none"` and `credentials.list` is empty. Unit: `tests/hub/provider-visibility.test.ts` AC1 (no `xai` scope, no `xai/` row in All models or a search). Live: `/login` showed ClinePass, OpenAI Codex, xAI and Verify Key as "not logged in", and the hub dropdown listed only `All models (43)`, `Claude (5)`, `Fake Local (1)`, `OpenCode Go (37)`. A search for `xai` gave `All models (0)` and "No matching models.", and a search for `cline` did the same |
| AC2 | Logged-in and login-free providers still appear | Pass | `rebuild()` keeps a provider whose `login.kind === "none"`. Unit: AC2 test (`["all","claude","local","opencode-go"]` with both providers' models) and the `hub-state.test.ts` sidebar order test. Live: Claude, plus the logged-in OpenCode Go and Fake Local, were listed with their models. The login-free half is unit-only (gap G1) |
| AC3 | Logging in makes the provider appear | Pass | `open()` calls `rebuild()` each time, so the next open sees the new login. Unit: AC3 test. Live: after `/login` → Verify Key with a dummy stub key (`⏺ nmg-router: Logged in to Verify Key`), the next `/model` showed `All models (44)` and `Verify Key (1)` with `vk-model` |
| AC4 | Logging out hides the provider | Pass | Unit: AC4 test. Live: after `/logout` → Verify Key (`⏺ nmg-router: Logged out of Verify Key`), the next `/model` dropdown showed `All models (43)`, `Claude (5)`, `Fake Local (1)`, `OpenCode Go (37)`, with no Verify Key entry |
| AC5 | A stored but failing login keeps the provider listed | Pass | `rebuild()` checks only that a stored login exists, never that it resolves. Unit: AC5 test (`unauthenticated` status, cached models still listed). Live: with the stub server stopped (`curl` → offline), the reopened hub still showed `Verify Key (1)` with `vk-model` |
| AC6 | Nothing replaces the hidden entries | Pass | `lockedChildren()`, `HubActions.login`, `HubView.mode`/`locked` and `bundledRows()` were removed. Unit: AC6 test (only `all`/`claude`, no "has no credentials", no "Log in to", no `login` key, rows are the Claude lineup). Live: with four not-logged-in providers hidden, the hub showed no locked view, no login button, no "has no credentials" text and no hidden-provider hint. The "only All models and Claude" end state is unit-only (gap G2) |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `rebuild()` filters before `hubSources()`, so the provider is absent from the sidebar and from every scope |
| FR2 | Pass | No `locked`, `isLocked`, `bundledRows`, `BUNDLED_METADATA` (in `src/hub`), `lent`, `PaneSite` or `"login"` key is left in `src/hub` or `src/login/pane.ts`. `BUNDLED_METADATA` stays in `src/providers/metadata.ts` for its other uses |
| FR3 | Pass | `rebuild()` runs on every `open()`. The live login and logout were both seen in the same session |
| FR4 | Pass | Only `credentials.list(id).length` is checked. Shown live with the stub offline |
| FR5 | Pass | `tests/hub/settings-rows.test.ts` new test: no `xai/` picker row when the catalog `xai` entry has no models. After the live run, the user's `modelPicker` settings were byte-equal to the pre-run backup |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Drop the locked state from sources and view model | Complete | `src/hub/sources.ts`, `src/hub/hub-state.ts` |
| T002 | Remove the locked view and in-hub login | Complete | `src/hub/hub-view.ts`: `drawHub()` always draws the list, and `focusableKeys`/`homeKey` never return `login` |
| T003 | Hide providers without a stored login | Complete | `src/hub/hub-controller.ts`, `src/login/pane.ts` (no `PaneSite`/`lent`), and the `src/login/login-command.ts` comment |
| T004 | Update hub unit tests | Complete | `tests/hub/login-handoff.test.ts` deleted. Other suites updated |
| T005 | Prove provider visibility through the controller | Complete | `tests/hub/provider-visibility.test.ts` (AC1–AC6), harness gains `freePlugin`/`statuses`, and the FR5 settings test |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The hub no longer owns a login flow. `/login` is the only login surface |
| Open/Closed | 5 | Visibility is one predicate in `rebuild()`. Sources, state and view stay pure |
| Liskov Substitution | 5 | Every `HubSource` now has the same shape (no `isLocked` branch) |
| Interface Segregation | 5 | `HubElements` dropped `Button`, `HubActions` dropped `login`, and `createPaneController()` lost its unused site parameter |
| Dependency Inversion | 5 | The controller still reads credentials only through `services.credentials` |

### Layer Separation

`hooks/register.ts` is untouched. The pure hub modules (`sources`, `hub-state`, `hub-view`) gained no `$` access. Removing the hub→login import cuts a cross-directory dependency.

### Dependency Flow

`src/hub` no longer imports `src/login`. `src/login/pane.ts` is back to a single fixed site.

---

## Security Assessment

- [x] Authentication: unchanged. `/login` still runs every provider login, and Anthropic still goes through Claude Code's own login
- [x] Authorization: n/a
- [x] Input validation: unchanged
- [x] Injection prevention: no new subprocess or shell use
- [x] Data protection: `credentials.list` returns account entries only. No key value reaches the hub, logs or settings. The live run typed only a dummy stub key, and the real vault was restored and checked with `cmp`

---

## Performance Assessment

- [x] Async patterns: one `credentials.list` per login-requiring provider per open, the same as before
- [x] Caching: catalog cache unchanged. The live run showed cached models kept while offline
- [x] Resource management: the second pane controller and hold tracking were removed
- [x] Query optimization: n/a

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Vitest `provider-visibility.test.ts` | Yes |
| AC2 | Yes (SCN002) | Vitest `provider-visibility.test.ts`, `hub-state.test.ts` | Yes |
| AC3 | Yes (SCN003) | Vitest `provider-visibility.test.ts` | Yes |
| AC4 | Yes (SCN004) | Vitest `provider-visibility.test.ts` | Yes |
| AC5 | Yes (SCN005) | Vitest `provider-visibility.test.ts` | Yes |
| AC6 | Yes (SCN006) | Vitest `provider-visibility.test.ts` | Yes |

### Coverage Summary

- Feature file: 6 scenarios (`feature.gherkin`), mapped one to one to Vitest cases. The project has no Cucumber runner
- Unit tests: 584 passed across 68 files

---

## Interactive Verification (herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-38 --no-focus`; `herdr agent start verify-38 --kind claude --pane <pane> -- --plugin-dir .` |
| **Startup** | No folder-trust prompt and no hook or plugin load errors. Restarted once after the config change |
| **Throwaway provider** | Per the supervisor scope: one temporary `verifykey` custom provider (`auth: api-key`, `http://127.0.0.1:18799/v1`) against a local stub server that answers `/v1/models` with `vk-model`. A dummy, non-secret key was used. No real provider was logged in or out |
| **State safety** | `config.json`, `vault.json` and `vault.key` were copied to the scratchpad before any login. After the run they were restored and each checked with `cmp` (all identical). The `modelPicker` settings rows matched the backup, the default model was `opus`, there was no listener on 18799, and the tab was closed |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | `/model`, Tab to the providers | Only listed providers shown | `All models (43)` / `Claude (5)` / `Fake Local (1)` / `OpenCode Go (37)` |
| 2 | Search `xai`, then `cline` | No hidden-provider rows | `All models (0)` … `No matching models.` |
| 3 | `/login` | Picker still lists every enabled provider (out of scope, unchanged) | `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` / `Verify Key — not logged in` |
| 4 | `/model` after the restart | Verify Key (configured, no login) hidden | dropdown without `Verify Key`, `All models (43)` |
| 5 | `/login` → Verify Key, dummy key | Saved | `⏺ nmg-router: Logged in to Verify Key` |
| 6 | `/model`, pick Verify Key | Listed with its model (AC3) | `All models (44)` … `Verify Key (1)` … `vk-model` |
| 7 | Stop stub, `/model`, pick Verify Key | Still listed with cached model (AC5) | `stub offline`; `Verify Key (1) ▾ … vk-model` |
| 8 | `/logout` → Verify Key, `/model` | Hidden (AC4) | `⏺ nmg-router: Logged out of Verify Key`; dropdown `All models (43)` with no Verify Key |
| 9 | Hub pick `opencode-go/glm-5.3`, then `/model opus` | Claude ↔ routed both directions | `Set model to OpenCode Go · glm-5.3`; status `🧠 model: OpenCode Go · glm-5.3`, then `🧠 model: Opus` |

Unplanned: an early `herdr agent prompt "/model"` double-submit sent `/model/model` as a Claude turn, which replied harmlessly. It is a driver artifact, not a product finding. In the hub, `herdr pane send-text` did not reach the search Input, but per-key `send-keys` did. This is noted as a test-driver quirk.

### Manual-verification gaps

| Gap | AC | What was not observed live | Why | Covering evidence |
|-----|----|----------------------------|-----|-------------------|
| G1 | AC2 | A provider with login kind `none` listed in the hub | The supervisor scope allows only one throwaway provider, which is used for the api-key cases (AC3–AC5), and no login-free provider is configured | `provider-visibility.test.ts` AC2, plus the `login.kind !== "none"` predicate in `rebuild()` |
| G2 | AC6 | The hub with every login-requiring provider logged out (only All models and Claude) | Needs logging out or disabling the person's real OpenCode Go and Fake Local logins, which the supervisor scope forbids | `provider-visibility.test.ts` AC6. Live evidence for the rest of AC6: no locked view, login button or hint with four providers hidden |

---

## Fixes Applied

None. No findings needed a fix.

## Remaining Issues

None blocking. Gaps G1 and G2 above can be checked by hand if wanted: configure a login-free custom provider for G1, and use a disposable HOME with an empty vault for G2.

---

## Positive Observations

- The comment on `rebuild()` states the visibility rule and why a stored but failing login still counts.
- The removal is thorough. No dead locked-state branches remain, and the pane controller is back to one site.
- The tests drive the real controller through `handleModelCommand`, not just the pure state.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/hub/hub-controller.ts` | 0 | Visibility filter. Login flow removed |
| `src/hub/hub-state.ts` | 0 | No `view`/`locked`. Claude first, then A–Z |
| `src/hub/hub-view.ts` | 0 | Locked view and login button removed |
| `src/hub/sources.ts` | 0 | `bundledRows`/`isLocked` removed |
| `src/login/pane.ts` | 0 | `PaneSite`/`lent` removed |
| `src/login/login-command.ts` | 0 | Comment only |
| `tests/hub/*`, `tests/support/hub-harness.ts`, `tests/routing/images.test.ts` | 0 | Updated, plus the new visibility suite |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`, `README.md` | 0 | Version bump and docs |

---

## Recommendation

**Ready for PR**

Every acceptance criterion and functional requirement is implemented and covered by controller-level tests. All registered validations passed at `88927ceecdd9469d6ff033d0d6418b35fb8641ce` with complete coverage. The live session confirmed the visibility behavior with a throwaway provider, and the person's real state was restored byte for byte.
