# Verification Report: Lay the mod foundation with the Anthropic guard and OS keyring credentials

**Date**: 2026-10-24
**Issue**: #1
**Reviewer**: Claude Code (nmg-sdlc verify worker, run c6909847-216b-43c9-9507-e3e205776a74)
**Scope**: Implementation verification against spec
**Verification head**: 1ff6fcb5c1f51963e5f2c1b34ab63c9c4ea687bf

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 3.8 |

### Implementation Status: Fail
**Total Issues**: 2

The required `repository.tests` validation failed at the verification head. Commit `1ff6fcb` ("feat: deliver issue #1") raised `VERSION`, `package.json` and `.claude-plugin/plugin.json` to `0.2.0`. The test `tests/manifest/versions.test.ts:12` still asserts `VERSION` is `0.1.0`, and AC2/FR3 in the Approved spec pin `0.1.0`. The deterministic ceiling is **Fail**. The rest of the implementation passes review: 81 of 82 tests pass, typecheck passes and the plugin manifest validates.

---

## Issue Scope

- Active issue: #1
- Spec: `specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1–FR10]; tasks [T001–T014]; scenarios [10 scenarios in feature.gherkin]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":1,"specPath":"specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["Clean checkout type-checks and tests","Manifests mirror VERSION","Anthropic request refused before any transport call","Spike fallback response is rejected","Anthropic provider registration rejected","Credentials round-trip through each OS keyring","No keyring uses the encrypted vault and keyring failures are refused","Anthropic credential never stored","Hygiene checks hold","README explains credential security"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (required `repository.tests` failed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

Artifact: `.nmg-sdlc/verification/1.json`. Head `1ff6fcb5c1f51963e5f2c1b34ab63c9c4ea687bf`, tree clean, base `main`.
Coverage: declared 3, recorded 3, complete `true`, no missing, duplicate or unknown ids. **Ceiling: Fail.**

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| `repository.tests` | yes | **failed** | `npm test` exited 1: 1 failed / 81 passed; `tests/manifest/versions.test.ts > reads VERSION as 0.1.0`: expected `'0.2.0'` to be `'0.1.0'` |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .` passed with warnings (no author, no icon, root CLAUDE.md not loaded as context) |

**Gate Summary**: 2/3 passed, 1 failed, 0 incomplete. No smoke validation is declared in `steering/manifest.json`.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Clean checkout type-checks and tests | **Fail** | `scripts/sync-mod-types.mjs`, `tsconfig.json`; typecheck passes, but `npm test` fails at head |
| AC2 | Manifests mirror VERSION (`0.1.0`) | **Fail** | `VERSION`, `package.json`, `.claude-plugin/plugin.json` are all `0.2.0`. They mirror each other, but not the `0.1.0` the spec requires. `hooks/hooks.json` lists `./register.ts`; `claude plugin validate .` passes |
| AC3 | Anthropic request refused | Pass | `src/gateway/guard.ts:14`, `src/gateway/anthropic.ts`; `tests/gateway/guard.test.ts`, `tests/gateway/guarded-send.test.ts` |
| AC4 | Spike fallback reproduced and blocked | Pass | `src/gateway/guarded-send.ts:10` (one transport call, then `checkResponse` before any content is returned); `tests/gateway/guarded-send.test.ts` |
| AC5 | No Anthropic provider | Pass | `src/providers/registry.ts:19`; `tests/providers/registry.test.ts` |
| AC6 | Credentials in each OS keyring | Pass | `src/credentials/keyring-{macos,windows,linux}.ts` (secret on stdin; macOS passes hex through `security -i`); `tests/credentials/store.test.ts` |
| AC7 | Vault fallback only when no keyring; failures refused | Pass | `src/credentials/vault.ts` (AES-GCM, random IV, `mkdir -m 700`, `chmod 600`); `src/credentials/store.ts:60` (vault only when no keyring is available); `tests/credentials/vault.test.ts` |
| AC8 | Anthropic never stored | Pass | `src/credentials/store.ts:31` (`assertIds` runs before backend resolution); `tests/credentials/store.test.ts` |
| AC9 | Hygiene checks | Pass | `.github/workflows/gitleaks.yml`; `tests/hygiene/{gitleaks-workflow,sentinel,fixtures}.test.ts` |
| AC10 | README credential security | Pass | `README.md`; `tests/docs/readme-security.test.ts` (14 tests) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Scaffold the plugin and toolchain | Complete | Its version is now `0.2.0`, which contradicts the task text (`0.1.0`) |
| T002 | Mod types sync script | Complete | `scripts/sync-mod-types.mjs` |
| T003 | Anthropic guard and guarded send | Complete | |
| T004 | Provider registry | Complete | |
| T005 | OS keyring backends | Complete | |
| T006 | Keyfile vault | Complete | |
| T007 | Credential store facade | Complete | |
| T008 | gitleaks workflow | Complete | |
| T009 | README credential security section | Complete | |
| T010 | Engine fakes and sentinel harness | Complete | `tests/support/` |
| T011 | Scaffold and version tests | Complete, failing | `tests/manifest/versions.test.ts:12` hardcodes `0.1.0` |
| T012 | Guard and registry tests | Complete | |
| T013 | Credential store tests | Complete | |
| T014 | Hygiene and README tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Each file has one concern: guard, transport wrapper, registry, one file per keyring, vault, store facade |
| Open/Closed | 4 | `KeyringBackend`/`CredentialBackend` interfaces let new backends plug in |
| Liskov Substitution | 4 | Keyring and vault backends are interchangeable behind `CredentialBackend` |
| Interface Segregation | 4 | Backends take `Pick<CredentialHost, ...>` |
| Dependency Inversion | 4 | Host (`$`) capabilities are injected, so tests use fakes |

### Layer Separation

`hooks/register.ts` is 3 lines and wires no hooks. The guard and model-id logic are pure functions with no `$` access.

### Dependency Flow

`credentials` and `providers` depend on `gateway/anthropic.ts` for Anthropic detection, and every module depends on `errors`. There are no cycles.

---

## Security Assessment

- [x] Authentication: no Claude credentials are read; the store refuses Anthropic
- [x] Authorization: N/A
- [x] Input validation: provider and account ids must match `^[a-z0-9][a-z0-9._-]{0,63}$` before they reach a keyring argv; an unparsable base URL counts as Anthropic (fails closed)
- [x] Injection prevention: secrets travel on stdin and never in argv; ids are validated before command construction
- [x] Data protection: AES-256-GCM with per-entry IV and provider/account AAD; vault files are 0600 in a 0700 directory; the sentinel test covers logs, `$.store`, settings, errors and child argv/env

---

## Performance Assessment

- [x] Async patterns: the backend is resolved once and memoized
- [x] Caching: the backend promise is cached
- [x] Resource management: one short-lived child process per keyring operation
- [x] Query optimization: N/A

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes | Vitest | No (suite fails) |
| AC2 | Yes | Vitest | No |
| AC3–AC10 | Yes | Vitest | Yes |

### Coverage Summary

- Feature file: 10 scenarios
- Step definitions: covered by Vitest suites (no separate Gherkin runner)
- Unit tests: 82 tests in 10 files; 81 pass, 1 fails
- Integration tests: none (live provider checks are manual by policy)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Not applicable: no nmg-sdlc `workflows/` or `agents/` changes. This is a Claude Code mod, not an nmg-sdlc plugin change |
| **Recommendation** | Run `claude --plugin-dir .` manually after the fix |

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | Verify publication scope allows only `verification-report.md`, so the test and VERSION fix is left to implementation | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Testing / Spec Compliance |
| **Location** | `tests/manifest/versions.test.ts:12`, `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md` |
| **Issue** | Delivery commit `1ff6fcb` raised the version to `0.2.0` before verification. The Approved spec (AC2, FR3, T001) and the version test require `0.1.0` |
| **Impact** | The required `repository.tests` validation fails, which caps status at Fail. AC1 and AC2 fail |
| **Reason Not Fixed** | Outside the verify publication scope. Implementation must pick one: (a) return `VERSION`, `package.json`, `.claude-plugin/plugin.json` and the CHANGELOG entry to `0.1.0` until delivery bumps the version, or (b) change the test to assert only that the manifests equal the trimmed `VERSION`, and amend the spec's `0.1.0` pin. Option (a) matches the Approved spec |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `src/credentials/store.ts:59` |
| **Issue** | `resolveBackend` memoizes the promise even when it rejects. A transient `detectPlatform` failure then fails every later call in the session |
| **Impact** | The store stays unusable until reload. It fails closed, so no secret is exposed |
| **Reason Not Fixed** | Not a spec violation; outside verify scope |

---

## Positive Observations

- The guard fails closed. A response with no `model`, an Anthropic model or a Claude-family name is rejected, and so is an unparsable base URL.
- macOS secrets go to `security -i` as hex on stdin, so they never appear in argv.
- The vault uses the provider and account as AAD, which stops one entry's ciphertext from being swapped into another.
- A reusable sentinel harness covers every leak channel the spec lists.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Settle the version so it matches the Approved spec and `npm test` passes, then rerun the full registered gate

### Short Term (Should)
- [ ] Clear the memoized backend promise when it rejects

### Long Term (Could)
- [ ] Add `author` and an icon to `.claude-plugin/plugin.json` to clear the validator warnings

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/gateway/anthropic.ts`, `guard.ts`, `guarded-send.ts` | 0 | |
| `src/providers/registry.ts` | 0 | |
| `src/credentials/store.ts` | 1 | Low: memoized rejection |
| `src/credentials/keyring-macos.ts`, `vault.ts` | 0 | |
| `tests/manifest/versions.test.ts` | 1 | Critical: hardcoded `0.1.0` vs `0.2.0` at head |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | (same) | Bumped to `0.2.0` by `1ff6fcb` |

---

## Recommendation

**Needs fixes**

The implementation meets AC3–AC10. A premature version bump to `0.2.0` breaks the required test gate and AC1/AC2. Return the version to `0.1.0`, or reconcile the test and the spec, then rerun full verification.
