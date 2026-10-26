# Verification Report: Store provider credentials in the encrypted vault on every OS

**Date**: 2026-10-26
**Issue**: #19
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 8722d57dd1dd93d7c54fdc321c72b9a1e7c97bb7

---

## Executive Summary

The credential store now uses the AES-256-GCM keyfile vault on every OS. The three keyring backends, the keyring routing, the keyring errors and the keyring simulation in the test fake are gone. The README describes the vault on every OS. All five acceptance criteria pass, with unit-test evidence and interactive evidence from a herdr session. All three registered validations passed at the verification head.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 4 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 1 (advisory, non-blocking)

---

## Issue Scope

- Active issue: #19
- Spec: `specs/19-store-provider-credentials-in-the-encrypted-vault-on-every-os`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":19,"specPath":"specs/19-store-provider-credentials-in-the-encrypted-vault-on-every-os","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --base main --controller-run-id 460715cf-36a7-4871-874a-bf7c0763b1a1`
- Artifact: `.nmg-sdlc/verification/19.json`, head `8722d57dd1dd93d7c54fdc321c72b9a1e7c97bb7`, tree clean
- Ceiling: none. Coverage: declared 3, recorded 3, complete `true`, no missing, duplicate or unknown results

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| `repository.typecheck` | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| `repository.tests` | builtin.command | yes | passed | `npm test`: 10 files, 96 tests passed |
| `repository.plugin-manifest` | builtin.command | yes | passed | `claude plugin validate .`: "Validation passed with warnings" (advice only: README has no marketplace install line) |

No `repository.nmg-sdlc-smoke` or `project.nmg-sdlc-smoke` validation is declared in `steering/manifest.json`, so there is no smoke lifecycle requirement.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | The vault is used on every OS | Pass | `src/credentials/store.ts:41-46` memoizes `detectPlatform(deps).then((platform) => createVault(deps, platform))`. `tests/credentials/store.test.ts` "encrypted vault on every OS" runs save, read, list and delete on macos, windows, linux and other. It asserts `vault.key` and `vault.json` under each OS directory, no plaintext in `vault.json`, the entry removed after delete, and no `security`, `powershell.exe` or `secret-tool` process |
| AC2 | Vault protections are unchanged | Pass | `src/credentials/vault.ts` is unchanged by this branch. `store.test.ts` "vault protections on POSIX through the store" checks that `mkdir -p -m 700` runs before the first write, that `chmod 600` follows each write, that a failing `mkdir` raises `vault_failed` with no write, and that a malformed `vault.key` beside entries raises `vault_failed` with no write. `vault.test.ts` keeps its 10 protection tests |
| AC3 | The keyring backends are removed | Pass | `src/credentials/` holds only `platform.ts`, `store.ts` and `vault.ts`. `grep -rniE "keyring\|NoKeyring\|secret-tool\|powershell" src` finds nothing. `CredentialErrorCode` is `"anthropic_refused" \| "invalid_id" \| "vault_failed"` (`src/errors/errors.ts:5`). The keyring simulation is gone from `tests/support/fake-engine.ts` |
| AC4 | The store's interface is unchanged for callers | Pass | `CredentialStore`, `CredentialStoreDeps` and `StoredCredential` are unchanged (`src/credentials/store.ts:7-16`). `guard` refuses Anthropic and invalid ids before `resolve()` runs. `store.test.ts` "refusals before any backend" asserts no process, fs or store write. `tests/hygiene/sentinel.test.ts` runs the store scenario and the vault-file scenario on all four platforms |
| AC5 | README describes the vault on every OS | Pass | The `README.md` "Credential security" section says "encrypted vault on every OS", lists the macOS, Linux and Windows directories, says the key file is "protected only by file permissions", and keeps the four hardening steps. `tests/docs/readme-security.test.ts` (19 tests) requires those terms and rejects Keychain, Credential Manager, Secret Service, secret-tool, libsecret and keyring |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Route the credential store through the vault on every platform | Complete | No keyring imports, `keyringFor` or `routeThrough`. `platform.ts` no longer exports `ProcessDeps`, `KEYRING_SERVICE`, `runKeyringTool` or `keyringError` |
| T002 | Delete the keyring backends and keyring errors | Complete | Three modules deleted. `NoKeyringError`, the `exitCode` detail and the keyring messages are removed |
| T003 | Remove the keyring simulation from the test fake | Complete | `run` answers `uname`, `mkdir` and `chmod`, applies `options.run` first, and throws `spawn <cmd> ENOENT` otherwise. The `DBUS_SESSION_BUS_ADDRESS` default is removed |
| T004 | Cover the vault-only store on every OS | Complete | Store, vault and sentinel suites updated as specified |
| T005 | Rewrite the README credential security section | Complete | README and doc test updated |

Also delivered: the version bump to 0.3.0 in `VERSION`, `package.json` and `.claude-plugin/plugin.json`, and a `CHANGELOG.md` entry.

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The store handles validation, the index and backend resolution. The vault handles encryption and files. `platform.ts` handles detection and encoding |
| Open/Closed | 5 | The `CredentialBackend` seam is kept, so another backend can be added without changing callers |
| Liskov Substitution | 5 | The vault satisfies `CredentialBackend` on every platform |
| Interface Segregation | 5 | `CredentialStoreDeps` is a narrow `Pick` of `EngineInterface` |
| Dependency Inversion | 5 | All process, fs, env and store access goes through injected `deps`, which the tests fake |

### Layer Separation

`src/credentials/` reads nothing under `~/.claude`, and provider access stays behind the gateway. Removing the keyring code took about 270 lines of platform-specific code out of `src/`.

### Dependency Flow

`store.ts` imports `platform.ts` and `vault.ts`, and `vault.ts` imports `platform.ts`. There are no cycles.

---

## Security Assessment

- [x] Authentication: not applicable. The store never touches Claude or Anthropic credentials, and `anthropic_refused` is enforced before any I/O
- [x] Authorization: the vault directory is owner-only (0700) and both files are 0600 on POSIX, unchanged
- [x] Input validation: `ID_PATTERN` validates provider and account ids. An invalid id is not echoed in the error
- [x] Injection prevention: no secret or id reaches child argv. The only processes are `uname`, `mkdir` and `chmod` with fixed or path arguments
- [x] Data protection: AES-256-GCM with a fresh IV per write. The sentinel tests find no secret in UI, telemetry, store, settings, errors, argv, env or the vault files on any platform

Score 4 rather than 5: the design accepts that the key file is protected only by file permissions. That tradeoff is stated plainly in the README.

---

## Performance Assessment

- [x] Async patterns: the backend promise is memoized once per store
- [x] Caching: platform detection runs once per store instance
- [x] Resource management: each operation runs no subprocess beyond the one-time `uname` and the POSIX mode commands on write
- [x] Query optimization: not applicable

---

## Error Handling Assessment

All vault failures raise `CredentialError("vault_failed")` with platform and provider detail and no stderr or secret. A malformed or missing key over existing entries is never regenerated. Removing `keyring_locked` and `keyring_failed` takes away two failure modes that used to block saves.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001, Scenario Outline over 4 platforms) | Yes (Vitest `store.test.ts`) | Yes |
| AC2 | Yes (SCN002) | Yes (`store.test.ts`, `vault.test.ts`) | Yes |
| AC3 | Yes (SCN003) | Yes (grep and absence of modules, typecheck) | Yes |
| AC4 | Yes (SCN004) | Yes (`store.test.ts` refusals, `sentinel.test.ts`) | Yes |
| AC5 | Yes (SCN005) | Yes (`readme-security.test.ts`) | Yes |

### Coverage Summary

- Feature files: 5 scenarios
- Step definitions: implemented as Vitest suites
- Unit tests: 96 tests in 10 files, all passing

---

## Interactive Verification (herdr)

The procedure follows `steering/snippets/project-verification.md`. `herdr tab list` answered. Tab `verify-19` was created with `--no-focus` at the worktree, and Claude Code v2.1.310 was started with `--plugin-dir .`. No folder-trust or other startup dialog appeared. The tab was closed after the run.

This change has no user-facing hook. `hooks/register.ts` registers no hooks yet, and nothing calls the credential store at runtime. Each scenario therefore drove the session as a user would, asking it to exercise and inspect the store in the loaded worktree.

| Scenario | Prompt sent | Observed outcome | Excerpt from `herdr agent read` |
|----------|-------------|------------------|-------------------------------|
| Plugin load | `/plugin`, then the Errors tab | The mod loaded with no errors | "2 mods active · nmg-router, nmg-sdlc" … "No plugin errors" |
| AC1, AC2 | Run `npx vitest run tests/credentials/store.test.ts tests/credentials/vault.test.ts`, then report the round trip and vault directory per OS and any keyring tool use in `src/credentials` | 19/19 tests passed. Round trip passed on all four platforms. Only `uname`, `mkdir` and `chmod` run | "The store round-trip test passed on all four platforms. Both files ran clean: 19 of 19 tests passed" … "nothing in src/credentials ever calls security, powershell.exe or secret-tool" |
| AC3 | Check whether `src/credentials/keyring-*.ts` exists, and grep for keyring terms in `src` and `tests/support` | No files and no hits | "Keyring files: none … The folder holds only platform.ts, store.ts and vault.ts." "Grep: no hits." |
| AC4 | Run the sentinel test, then confirm the `CredentialStore` shape and the Anthropic refusal | 10/10 sentinel tests passed. The interface is unchanged, and `guard()` refuses Anthropic before platform detection | "save, read and delete all go through guard(), which checks the ids and refuses Anthropic providers … before the platform is detected or any backend runs" |
| AC5 | Run the README doc test and read the "Credential security" section | 19/19 tests passed. No keyring wording, three directories and four hardening steps | "it doesn't mention Keychain, Credential Manager, Secret Service, secret-tool, libsecret or installing a keyring" |

No token, key, account id or email address appeared in the captured output.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Advisory
- `README.md` "Credential security": the directory list labels the XDG path "Linux", but the code also uses it on other non-macOS, non-Windows platforms (`src/credentials/vault.ts`). AC5 asks for the vault directory per OS, and the three supported OSes are covered, so this is not a failure. A later docs pass could label the path "Linux and other platforms".
- `claude plugin validate .` advises adding a marketplace install line to the README. That belongs to issue #6 (install docs and marketplace packaging), not this issue.

---

## Overall Status: Pass

All five acceptance criteria, all four functional requirements and all five tasks are met at `8722d57dd1dd93d7c54fdc321c72b9a1e7c97bb7`. All three required registered validations passed with complete coverage, and interactive evidence covers every AC.

### Recommendation

Ready for PR.
