# Verification Report: Lay the mod foundation with the Anthropic guard and OS keyring credentials

**Date**: 2026-10-25
**Issue**: #1
**Reviewer**: Claude Code (nmg-sdlc verify worker, run b61ba017-1267-4689-b499-9961d6c41f97)
**Scope**: Implementation verification against spec

**Verification head**: ebe6931c96d641ae9f817f80d3e9a408ed753ad9

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 4 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 6 (all Low or Info, none blocking)

All 10 acceptance criteria pass. Each one has unit-test evidence and interactive evidence from a fresh herdr Claude session started with `--plugin-dir .`. All three registered steering validations passed at the verification head. No code changes were needed. The six remaining items are Low or Info observations.

---

## Issue Scope

- Active issue: #1
- Spec: `specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC10]; FR [FR1–FR10]; tasks [T001–T014]; scenarios [SCN001–SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":1,"specPath":"specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 1 --spec specs/1-… --base main --controller-run-id b61ba017-1267-4689-b499-9961d6c41f97`
- Artifact: `.nmg-sdlc/verification/1.json`. Identity: head `ebe6931c96d641ae9f817f80d3e9a408ed753ad9`, tree clean, steering `sha256:75b22afe…c49da`, spec `sha256:c2e14a0e…3782f`
- Coverage: declared 3, recorded 3, complete `true`; missing, duplicate and unknown are all empty
- Ceiling: `null`

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| `repository.typecheck` | builtin.command | yes | passed | `npm run typecheck` exited 0 (`tsc --noEmit`) |
| `repository.tests` | builtin.command | yes | passed | `npm test` exited 0: 10 files, 101 tests |
| `repository.plugin-manifest` | builtin.command | yes | passed | `claude plugin validate .` exited 0, "Validation passed with warnings" |

**Gate Summary**: 3/3 passed, 0 failed, 0 incomplete. No `nmg-sdlc-smoke` validation is declared, so none applies.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Clean checkout type-checks and tests | Pass | `scripts/sync-mod-types.mjs`. A live `npm run types:sync` printed "Wrote mod type declarations for Claude Code 2.1.310". `index.d.ts` line 1 is `// Written by Claude Code 2.1.310.`, which matches `claude --version` 2.1.310. `git check-ignore` matches the file. typecheck and tests pass and the tree stays clean. `tests/manifest/versions.test.ts` |
| AC2 | Manifests mirror VERSION | Pass | `VERSION`, `package.json` and `.claude-plugin/plugin.json` all read `0.2.0`. The delivery commit ebe6931 bumped them from 0.1.0 together, so the mirror invariant holds. `hooks/hooks.json` is `{"modules":["./register.ts"]}`. `claude plugin validate .` passes with warnings |
| AC3 | Anthropic request refused | Pass | `src/gateway/guard.ts:12`, `src/gateway/anthropic.ts:11`. Live: provider `anthropic`, base URL `https://api.anthropic.com` and `clinepass/claude-sonnet-5-5` are each refused with the model named and `calls=0`. `tests/gateway/guarded-send.test.ts` also asserts zero `$.http` and `$.process` calls |
| AC4 | Spike fallback reproduced and blocked | Pass | `src/gateway/guarded-send.ts:11`. Live: a `opencode-go/kimi-k3.1-pro` request answered by `anthropic/claude-opus-5-5` gives `AnthropicResponseRejected` naming both models, returns no content and records `calls=1` |
| AC5 | No Anthropic provider | Pass | `src/providers/registry.ts:19`. Live: `anthropic`, `api.anthropic.com`, `claude.ai` and `console.claude.com` are rejected with `ProviderRejected`. `list()` returns only `["opencode-go"]` |
| AC6 | Credentials in each OS keyring | Pass | `src/credentials/keyring-{macos,windows,linux}.ts`. `tests/credentials/store.test.ts` "keyring round trip" covers macOS, Windows and Linux with service `nmg-router` and account `opencode-go/<account>`, and the secret is absent from argv and env. Live probe: `security -i` passes the subcommand's exit code through (`delete-generic-password` on a missing item returns 44, the same as a direct call), so the macOS stdin save path detects failures |
| AC7 | No keyring uses the vault; keyring failures refused | Pass | `src/credentials/vault.ts`, `src/credentials/store.ts:50`. Live run of the real store on the real filesystem with a temp HOME and no keyring: directory `700`, `vault.key` `600`, `vault.json` `600`, key 32 bytes, no plaintext in either file, read matches, delete removes the entry. Locked and failing keyrings raise `keyring_locked` or `keyring_failed` with no vault fallback, and the fs, `$.store` and settings are unchanged (store.test.ts "keyring refusals") |
| AC8 | Anthropic never stored | Pass | `src/credentials/store.ts:101`. Live: `save("anthropic", …)` gives `anthropic_refused: Anthropic credentials are never stored.` store.test.ts asserts zero `$.process` calls and zero fs writes |
| AC9 | Hygiene checks | Pass | `.github/workflows/gitleaks.yml` triggers on `push` and `pull_request`, pins v8.30.1, verifies the checksum and runs `gitleaks git --redact --exit-code 1`. `tests/hygiene/gitleaks-workflow.test.ts`, `sentinel.test.ts` (keyring, locked, failing and vault paths) and `fixtures.test.ts` all pass |
| AC10 | README credential security | Pass | `README.md` "Credential security" covers the keyring per OS, when the vault is used, protection by file permissions only, the per-OS directory, owner-only mode, backup and sync exclusion, full-disk encryption, Secret Service on Linux and deleting the vault directory. `tests/docs/readme-security.test.ts` passes (17 assertions) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Scaffold the plugin and toolchain | Complete | Version is now 0.2.0 after the delivery bump |
| T002 | Mod types sync script | Complete | Verified live on macOS |
| T003 | Anthropic guard and guarded send | Complete | |
| T004 | Provider registry | Complete | |
| T005 | OS keyring backends | Complete | |
| T006 | Keyfile vault | Complete | |
| T007 | Credential store facade | Complete | |
| T008 | gitleaks workflow | Complete | |
| T009 | README credential security section | Complete | |
| T010 | Engine fakes and sentinel harness | Complete | `tests/support/fake-engine.ts`, `sentinel.ts` |
| T011 | Scaffold and version tests | Complete | |
| T012 | Guard and registry tests | Complete | |
| T013 | Credential store tests | Complete | |
| T014 | Hygiene and README tests | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The guard, the guarded send, the registry, each keyring backend, the vault and the store facade each live in their own file |
| Open/Closed | 5 | Backends share the `CredentialBackend` interface. Adding a platform means adding a backend, not editing the others |
| Liskov Substitution | 5 | The vault and every keyring are interchangeable behind `routeThrough` |
| Interface Segregation | 5 | Deps are narrow `Pick<EngineInterface, …>` slices |
| Dependency Inversion | 5 | All `$` access is injected. The guard and registry are pure, with no `$` |

### Layer Separation

`hooks/register.ts` stays thin and wires no hooks. All logic is under `src/` with one concern per directory. Nothing reads `~/.claude` or the credential files of other tools.

### Dependency Flow

`credentials → gateway/anthropic` (for `isAnthropicProvider`) and `providers → gateway/anthropic`. There are no cycles.

---

## Security Assessment

- [x] Secrets travel only on stdin: macOS uses a `security -i` command with a hex payload, Windows sends a script on stdin, and Linux uses `secret-tool store` on stdin. The sentinel harness covers this.
- [x] Injection prevention: ids are restricted to `^[a-z0-9][a-z0-9._-]{0,63}$` before they are put into the macOS command or the PowerShell script. The base64 payload cannot contain quotes.
- [x] Errors never carry stderr, the secret or an id (`src/errors/errors.ts`). An invalid id is not echoed.
- [x] Fail closed: an unparsable or host-less URL counts as Anthropic, and so does a response with no model. There is no retry and no fallback.
- [x] Vault: AES-256-GCM with a random 96-bit IV per write, AAD bound to `nmg-router:<provider>/<account>`, the key never regenerated over existing entries, and the directory set to 0700 before any write.
- [ ] Minor: `vault.key` and `vault.json` are written with the default umask and then chmodded to 0600. The 0700 parent directory shuts out other users during that window (Low, see Remaining Issues).

## Performance Assessment

- [x] Async patterns: the backend is resolved once per store and cached.
- [x] Resource management: one subprocess per keyring operation, no long-lived processes.
- [ ] Windows: each operation runs `Add-Type` and compiles the P/Invoke class again, which adds roughly a second per call. That is acceptable for credential operations (Low).

## Testability

Pure guards are tested directly. `fakeEngine()` records `$.http`, `$.process`, `$.env`, `$.fs`, `$.session`, `$.store`, `$.ui` and `$.telemetry`. Tests never call a real provider. Every safety rule from the technical steering has a test.

## Error Handling

Typed errors are used throughout: `AnthropicRequestRefused`, `AnthropicResponseRejected`, `ProviderRejected`, and `CredentialError` with codes `anthropic_refused`, `invalid_id`, `keyring_locked`, `keyring_failed` and `vault_failed`. The internal `NoKeyringError` is never surfaced to callers. A timeout or hang counts as `keyring_failed`, not as no keyring, so a hung keyring never falls back to the vault.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Vitest (`versions.test.ts`) plus a live run | Yes |
| AC2 | SCN002 | Vitest (`versions.test.ts`) | Yes |
| AC3 | SCN003 | Vitest (`guard.test.ts`, `guarded-send.test.ts`) | Yes |
| AC4 | SCN004 | Vitest (`guarded-send.test.ts`) | Yes |
| AC5 | SCN005 | Vitest (`registry.test.ts`) | Yes |
| AC6 | SCN006 | Vitest (`store.test.ts`) | Yes |
| AC7 | SCN007 | Vitest (`store.test.ts`, `vault.test.ts`) | Yes |
| AC8 | SCN008 | Vitest (`store.test.ts`) | Yes |
| AC9 | SCN009 | Vitest (`hygiene/*.test.ts`) | Yes |
| AC10 | SCN010 | Vitest (`readme-security.test.ts`) | Yes |

### Coverage Summary

- Feature file: `feature.gherkin` (10 scenarios). The project's technical steering uses Vitest with no Gherkin runner, so the scenarios are carried out by matching Vitest suites.
- Unit tests: 101 across 10 files, all passing.

---

## Interactive Verification (herdr)

- `herdr tab list` answered. Tab `verify-1` was created with `--cwd <repo> --no-focus` (pane `wQ:pF`), and `herdr agent start verify-1 --kind claude --pane wQ:pF -- --plugin-dir .` started Claude Code v2.1.310. No folder-trust dialog or any other startup dialog appeared. The tab was closed afterwards.

| Scenario | Prompt sent | Observed outcome | Excerpt |
|----------|-------------|------------------|---------|
| Plugin load | `/plugin`, then the Errors tab | The mod loads and reports no errors | "2 mods active · nmg-router, nmg-sdlc" … "No plugin errors" |
| AC2 | Show raw output of `cat VERSION`, both manifest versions, `cat hooks/hooks.json`, `claude plugin validate .` | Versions mirror each other and validation passes | "0.2.0 / 0.2.0 / 0.2.0 … \"modules\": [\"./register.ts\"] … ✔ Validation passed with warnings" |
| AC3–AC5 | Run the scratch driver `guard-live.mjs "$PWD"`, which imports the real `src/` modules | Refusals before the transport; spike response rejected; registry rejects Anthropic | "clinepass claude: AnthropicRequestRefused … \"clinepass/claude-sonnet-5-5\": it names an Anthropic model. calls=0" · "kimi answered by opus: AnthropicResponseRejected … \"anthropic/claude-opus-5-5\". calls=1" · "list: [\"opencode-go\"]" |
| AC7, AC8 | Run `vault-live.mjs "$PWD"`: the real store, real fs and processes, temp HOME, no keyring | Owner-only vault, ciphertext only, round trip, Anthropic refused | "dir mode 700; vault.key 600; vault.json 600 / key bytes 32 / plaintext in files: false / read matches: true / after delete: undefined / anthropic save: anthropic_refused" |
| AC6, AC7, AC9, AC10, AC1 | `npx vitest run tests/credentials tests/hygiene tests/docs tests/manifest --reporter=verbose`, plus the types header, `claude --version`, `git check-ignore`, typecheck and `git status --short` | 63/63 pass; types match 2.1.310 and are ignored; typecheck is clean; tree is clean | "Test Files 7 passed (7) Tests 63 passed (63)" · "// Written by Claude Code 2.1.310." · "2.1.310 (Claude Code)" · ".claude-plugin/types/claude-code/index.d.ts" |

This change has no hooks and no routing, so no `/model` switch applies. No credential was typed and no real provider was contacted. The excerpts contain no tokens or account ids.

---

## Fixes Applied

None. Every finding is Low or Info, and the verify publication scope allows writes only to this report.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | security | `src/credentials/vault.ts:77` | Files are written with the default umask and then chmodded to 0600, which leaves a brief window. The 0700 parent directory blocks other users during it. | Mitigated by the directory mode; `$.fs.write` takes no mode argument |
| Low | correctness | `src/credentials/store.ts:107` | If `$.store.set` fails after a successful backend write, `list()` drifts from what is actually stored. The credential itself is safe. | The spec accepts this ("after successful backend writes only"); a follow-up could reconcile it |
| Low | performance | `src/credentials/keyring-windows.ts:93` | `Add-Type` compiles the C# class on every call | Acceptable for credential operations |
| Low | packaging | `.claude-plugin/plugin.json` | `claude plugin validate .` warns about a missing `author` and icon, a root CLAUDE.md, and a README with no marketplace install line | Warnings do not fail validation; outside this issue's scope |
| Info | spec | `requirements.md` AC2 | AC2 names `0.1.0`, but the delivery bump made every manifest `0.2.0` | The invariant (manifests mirror VERSION) holds |
| Info | testing | `feature.gherkin` | No `tests/features/*.feature` file or step definitions; the scenarios run as Vitest suites | Matches the project's Vitest-only technical steering |

## Recommendation

Ready for PR.
