# Verification Report: Lay the mod foundation with the Anthropic guard and OS keyring credentials

**Date**: 2026-10-24
**Issue**: #1
**Reviewer**: Claude Code (nmg-sdlc verify worker, run c6909847-216b-43c9-9507-e3e205776a74)
**Scope**: Implementation verification against spec
**Verification head**: 71a119bf2211f539852ac87071bba20217f0f2ab

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.5 |

### Implementation Status: Pass
**Total Issues**: 4 (all Low; none block delivery)

All three registered validations passed at head `71a119b` with complete coverage, so there is no deterministic ceiling. Every acceptance criterion, functional requirement and task is implemented and covered by tests: 10 test files, 81 tests, all passing. The AC1 live check also passed: `npm run types:sync` regenerated `.claude-plugin/types/` for Claude Code 2.1.310, the types stayed gitignored, and typecheck passed afterwards.

The previous cycle failed because a test pinned `VERSION` to the literal `0.1.0`, and the delivery step raises the version before verification runs again. Commit `d3762f2` removed that pin. `tests/manifest/versions.test.ts` now checks the invariant T011 states: both manifests equal the trimmed `VERSION`. `VERSION`, `package.json` and `.claude-plugin/plugin.json` are all `0.2.0`, and that release is recorded in `CHANGELOG.md`. The `0.1.0` in AC2 and FR3 was the starting value when the spec was written. The release bump made by the delivery commit (`feat: deliver issue #1`) is release automation and does not count as an implementation defect. See the AC2 row.

---

## Issue Scope

- Active issue: #1
- Spec: `specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1–FR10]; tasks [T001–T014]; scenarios [SCN001–SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":1,"specPath":"specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

Artifact: `.nmg-sdlc/verification/1.json`. Head `71a119bf2211f539852ac87071bba20217f0f2ab`, tree clean, base `main`, controller run `c6909847-216b-43c9-9507-e3e205776a74`.
Coverage: declared 3, recorded 3, complete `true`, no missing, duplicate or unknown ids. **Ceiling: none.**

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| `repository.tests` | yes | passed | `npm test` exited 0: 10 files, 81 tests passed |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .` passed with warnings (no icon; README has no marketplace install line). These are advisory directory checks and do not change the verdict |

**Gate Summary**: 3/3 passed, 0 failed, 0 incomplete. `steering/manifest.json` declares no smoke validation, so no smoke lifecycle evidence is required.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Clean checkout type-checks and tests | Pass | `scripts/sync-mod-types.mjs`. Live run: `npm run types:sync` printed "Wrote .claude-plugin/types/ for Claude Code 2.1.310."; the first line of `index.d.ts` is `// Written by Claude Code 2.1.310.`, matching `claude --version`; `git check-ignore` matches `.gitignore:22`; tree clean after sync; typecheck and tests pass |
| AC2 | Manifests mirror VERSION | Pass | `VERSION`, `package.json` and `.claude-plugin/plugin.json` are all `0.2.0` and equal each other; `hooks/hooks.json` is `{"modules":["./register.ts"]}`; `claude plugin validate .` passes. The literal `0.1.0` was the starting value when the spec was written. The delivery release bump to `0.2.0` follows the versioning steering, where `VERSION` is the single source; `tests/manifest/versions.test.ts:11-14` |
| AC3 | Anthropic request refused | Pass | `src/gateway/guard.ts:14-22`, `src/gateway/anthropic.ts`; `tests/gateway/guard.test.ts:7-15` (provider `anthropic`, `api.anthropic.com`, `anthropic/*`, `clinepass/claude-sonnet-5-5`, each naming the model); `tests/gateway/guarded-send.test.ts:6-15` (transport, `$.process` and `$.http` record zero calls) |
| AC4 | Spike fallback reproduced and blocked | Pass | `src/gateway/guarded-send.ts:10-15`; `tests/gateway/guarded-send.test.ts:17-23` (names both models, exactly one transport call, no content returned) |
| AC5 | No Anthropic provider | Pass | `src/providers/registry.ts:18-26`; `tests/providers/registry.test.ts` (id `anthropic`, `anthropic.com`, `claude.ai`, `console.claude.com` rejected and absent from `list()`) |
| AC6 | Credentials in each OS keyring | Pass | `src/credentials/keyring-{macos,windows,linux}.ts`; `tests/credentials/store.test.ts:25-53` (`describe.each` over macos/windows/linux, service `nmg-router`, account `opencode-go/<account>`, secret absent from argv and env). Probed live: `security -i` exits with the failing subcommand's status (44), so macOS save failures surface |
| AC7 | No keyring uses the vault; keyring failures refused | Pass | `src/credentials/vault.ts`, `src/credentials/store.ts:57-67`, `src/credentials/platform.ts:59-86`; `tests/credentials/store.test.ts:56-111` (`mkdir -p -m 700` before the first write, `chmod 600` after each file write, locked/failing keyrings throw `keyring_locked`/`keyring_failed` without the secret or stderr, nothing written); `tests/credentials/vault.test.ts` (256-bit key, 12-byte IV, AES-GCM round-trip, fresh IV, tamper → `vault_failed`) |
| AC8 | Anthropic never stored | Pass | `src/credentials/store.ts:30-37`; `tests/credentials/store.test.ts:115-124` (`anthropic_refused`, zero `$.process` calls, zero fs writes) |
| AC9 | Hygiene checks | Pass | `.github/workflows/gitleaks.yml` (push + pull_request, pinned v8.30.1, checksum-verified, `gitleaks git --redact --exit-code 1`); `tests/hygiene/gitleaks-workflow.test.ts`, `tests/hygiene/sentinel.test.ts` (6 scenarios covering every platform, the vault, and locked/failing keyrings), `tests/hygiene/fixtures.test.ts` |
| AC10 | README explains credential security | Pass | `README.md` "Credential security" section covers every AC10 item; `tests/docs/readme-security.test.ts` (14 assertions) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Scaffold the plugin and toolchain | Complete | `package.json`, `plugin.json`, `hooks/*`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`; versions follow `VERSION` (see AC2) |
| T002 | Mod types sync script | Complete | pty via `script` on macOS/Linux, 90 s timeout with a trust hint, SIGTERM then SIGKILL after 5 s; ran live |
| T003 | Anthropic guard and guarded send | Complete | Pure, no `$` access; one transport call, no retry |
| T004 | Provider registry | Complete | `ProviderRejected` for id and host |
| T005 | OS keyring backends | Complete | Secret only on stdin (hex on macOS, base64 script on Windows, raw on Linux) |
| T006 | Keyfile vault | Complete | Per-OS directory, owner-only modes, AAD-bound AES-256-GCM, never regenerates a key over existing entries |
| T007 | Credential store facade | Complete | Backend resolved once; index updated only after backend success |
| T008 | gitleaks workflow | Complete | Pinned, checksum-verified CLI |
| T009 | README credential security section | Complete | |
| T010 | Engine fakes and sentinel harness | Complete | `tests/support/fake-engine.ts`, `tests/support/sentinel.ts` |
| T011 | Scaffold and version tests | Complete | Checks mirroring against the trimmed `VERSION` |
| T012 | Guard and registry tests | Complete | |
| T013 | Credential store tests | Complete | |
| T014 | Hygiene and README tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | One concern per file: model/host predicates, guard, send, registry, each keyring, vault, facade |
| Open/Closed | 4 | New platforms are added in `keyringFor`; a small switch, acceptable at this size |
| Liskov Substitution | 5 | Keyrings and the vault all satisfy `CredentialBackend` interchangeably |
| Interface Segregation | 4 | Narrow `Pick<EngineInterface, …>` dependencies; `CredentialHost.fs.read` is a local widening |
| Dependency Inversion | 4 | Host capabilities are injected; the transport is injected into `guardedSend` |

### Layer Separation

`hooks/register.ts` is thin and wires nothing, as the design states. `src/gateway` and `src/providers` are pure. `src/credentials` touches the host only through the injected `CredentialHost`. Nothing reads `~/.claude` or any oh-my-pi credential file.

### Dependency Flow

`credentials` and `providers` → `gateway/anthropic` → `errors`. No cycles, and no module imports from `hooks/`.

---

## Security Assessment

- [x] Authentication: no Claude credentials are read, stored or forwarded; the `anthropic` provider is refused by both the registry and the store
- [x] Authorization: the keyring/vault boundary is fail-closed. A locked or failing keyring never falls back to the vault
- [x] Input validation: provider and account ids match `^[a-z0-9][a-z0-9._-]{0,63}$` before any backend call, so the interpolation into the `security -i` line and the PowerShell single-quoted target is safe
- [x] Injection prevention: argv arrays only, no shell; secrets go through stdin as hex or base64, never through argv or env
- [x] Data protection: AES-256-GCM with a fresh IV and per-entry AAD; owner-only directory and files on POSIX; errors carry only code, platform, provider and exit code; sentinel tests cover every surface

---

## Performance Assessment

- [x] Async patterns: backend detection is memoized once per store instance
- [x] Caching: not applicable at this layer
- [x] Resource management: the sync script stops its child on success and on timeout
- [~] Concurrency: vault and index updates are unlocked read-modify-write operations (see Low issues)

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes | Yes (Vitest + live sync) | Yes |
| AC2 | Yes | Yes | Yes |
| AC3 | Yes | Yes | Yes |
| AC4 | Yes | Yes | Yes |
| AC5 | Yes | Yes | Yes |
| AC6 | Yes | Yes | Yes |
| AC7 | Yes | Yes | Yes |
| AC8 | Yes | Yes | Yes |
| AC9 | Yes | Yes | Yes |
| AC10 | Yes | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios (one Scenario Outline)
- Step definitions: implemented as Vitest suites, following the steering's testing standards
- Unit tests: 81 tests in 10 files, all passing
- Integration tests: the live `npm run types:sync` check (AC1); no live provider calls, as the steering requires

---

## Exercise Test Results

Not applicable. This change touches no nmg-sdlc plugin `workflows/` or `agents/`.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None this cycle. The publication scope for this step allows only this report | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Performance / Error Handling |
| **Location** | `src/credentials/vault.ts:146-157`, `src/credentials/store.ts:74-77` |
| **Issue** | The vault document and the `credentials.index` are updated by unlocked read-modify-write |
| **Impact** | Two saves running at once in the same store could drop one index entry or vault entry |
| **Reason Not Fixed** | The spec does not cover concurrency, and there are no callers yet; better handled when login wiring lands |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `src/credentials/keyring-linux.ts:7-9` |
| **Issue** | The `/locked\|dismissed/i` stderr test would also match the word "unlocked" |
| **Impact** | A rare `keyring_failed` could be reported as `keyring_locked`. Both refuse with no fallback, so safety is unaffected |
| **Reason Not Fixed** | Cosmetic error classification; outside this step's publication scope |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `tests/gateway/guarded-send.test.ts:6-15` |
| **Issue** | The zero-call refusal through `guardedSend` is shown only for the relayed-Claude case; the provider, host and `anthropic/*` cases are tested through the pure `checkRequest` |
| **Impact** | None today, because `guardedSend` calls `checkRequest` first; parameterizing the test would guard against a future reorder |
| **Reason Not Fixed** | Outside this step's publication scope |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Packaging |
| **Location** | `.claude-plugin/plugin.json`, `README.md` |
| **Issue** | `claude plugin validate .` warns that there is no icon and that the README has no marketplace install line |
| **Impact** | Advisory only; validation passes |
| **Reason Not Fixed** | Marketplace packaging belongs to a later issue |

---

## Positive Observations

- Fail-closed choices throughout: an unparsable URL counts as Anthropic, a response with no model is rejected, and a locked or failing keyring is refused, never sent to the vault.
- Secrets never reach argv or env on any platform. The sentinel harness proves this across six scenarios and every recorded surface.
- The vault binds each ciphertext to its key through AAD, and refuses to regenerate a key over existing entries.
- The gitleaks CLI is pinned and checksum-verified instead of using a licensed action.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Serialize vault and index writes when login wiring adds real callers

### Long Term (Could)
- [ ] Tighten the Linux locked-keyring stderr match; parameterize the `guardedSend` zero-call test; add a plugin icon and a marketplace install line

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/gateway/anthropic.ts`, `guard.ts`, `guarded-send.ts` | 0 | |
| `src/providers/registry.ts` | 0 | |
| `src/errors/errors.ts` | 0 | |
| `src/credentials/platform.ts`, `keyring-macos.ts`, `keyring-windows.ts` | 0 | |
| `src/credentials/keyring-linux.ts` | 1 | Low |
| `src/credentials/vault.ts`, `store.ts` | 1 | Low (concurrency) |
| `hooks/register.ts`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, `package.json`, `tsconfig.json`, `VERSION` | 1 | Low (validator warnings) |
| `scripts/sync-mod-types.mjs` | 0 | Ran live |
| `.github/workflows/gitleaks.yml` | 0 | |
| `README.md` | 0 | |
| `tests/**` | 1 | Low |

---

## Recommendation

**Ready for PR**

All registered gates passed with complete coverage at `71a119bf2211f539852ac87071bba20217f0f2ab`. Every AC, FR and task is implemented and tested, and only Low-severity follow-ups remain.
