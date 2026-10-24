# Tasks: Lay the mod foundation with the Anthropic guard and OS keyring credentials

**Issue**: #1
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Implementation Tasks

### T001: Scaffold the plugin and toolchain

**File(s)**: `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
**Type**: Create
**Depends**: none
**Acceptance**:
- `package.json`: name `nmg-router`, version `0.1.0`, `"type": "module"`, `engines.node >=24`, scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `types:sync` (`node scripts/sync-mod-types.mjs`), devDependencies TypeScript 5, Vitest 3 and `yaml` 2 (FR1, FR3)
- `.claude-plugin/plugin.json` declares name `nmg-router`, version `0.1.0` and a description; `hooks/hooks.json` is `{ "modules": ["./register.ts"] }`; `hooks/register.ts` exports `register` typed as `Register` from `claude-code` and wires no hooks (AC2)
- `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json` and includes `hooks`, `src`, `scripts` and `tests`; `.gitignore` adds `.claude-plugin/types/` (FR2)

### T002: Mod types sync script

**File(s)**: `scripts/sync-mod-types.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Reads the installed version from `claude --version`, removes `.claude-plugin/types/`, and starts `claude --plugin-dir <repo root>` in a pseudo-terminal (`script -q /dev/null …` on macOS, `script -qec … /dev/null` on Linux)
- Polls for `.claude-plugin/types/claude-code/index.d.ts` and `.claude-plugin/types/tsconfig.json` whose declaration's first line is `// Written by Claude Code <version>.`, then stops the child (SIGTERM, then SIGKILL after 5 s) and exits 0
- After 90 s without matching types, stops the child and exits non-zero with a message telling the developer to open `claude --plugin-dir .` once to trust the folder; on Windows exits non-zero saying the script supports macOS and Linux (AC1)

### T003: Anthropic guard and guarded send

**File(s)**: `src/gateway/anthropic.ts`, `src/gateway/guard.ts`, `src/gateway/guarded-send.ts`, `src/errors/errors.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `isAnthropicModel`, `isAnthropicHost`, `checkRequest`, `checkResponse` and `guardedSend` behave as the design's interface table states, with no `$` access (FR4)
- `guardedSend` never calls the transport for a refused request, calls it at most once, and never returns content from a rejected response (AC3, AC4)

### T004: Provider registry

**File(s)**: `src/providers/registry.ts`
**Type**: Create
**Depends**: T003
**Acceptance**:
- `register` rejects id `anthropic` and base URLs on Anthropic hosts with `ProviderRejected`; `list` and `get` never return a rejected provider (AC5, FR5)

### T005: OS keyring backends

**File(s)**: `src/credentials/platform.ts`, `src/credentials/keyring-macos.ts`, `src/credentials/keyring-windows.ts`, `src/credentials/keyring-linux.ts`
**Type**: Create
**Depends**: T003
**Acceptance**:
- Each backend implements save/read/delete with the design's commands, passing any secret only through `stdin` and never through argv or `env` (AC6, FR6)
- Each backend reports no-keyring, locked (`keyring_locked`) and other failures (`keyring_failed`) per the design, without the secret or stderr text in the error (AC7)

### T006: Keyfile vault

**File(s)**: `src/credentials/vault.ts`
**Type**: Create
**Depends**: T003
**Acceptance**:
- Creates the per-OS directory owner-only before writing; writes `vault.key` and AES-256-GCM `vault.json` as the design states, then sets 0600 on POSIX; save, read and delete round-trip (AC7, FR7)
- Any directory, permission, key or decrypt failure throws `vault_failed`, with no plaintext written anywhere

### T007: Credential store facade

**File(s)**: `src/credentials/store.ts`
**Type**: Create
**Depends**: T005, T006
**Acceptance**:
- Validates ids, refuses provider `anthropic` before any backend call (AC8), resolves the keyring backend once and uses the vault only on no-keyring (AC7)
- Maintains the `credentials.index` `$.store` index after successful backend writes only; `list(provider?)` filters it (FR6)

### T008: gitleaks workflow

**File(s)**: `.github/workflows/gitleaks.yml`
**Type**: Create
**Depends**: none
**Acceptance**:
- Triggers on `push` and `pull_request`, checks out with full history, downloads a pinned gitleaks v8 Linux release, verifies it against that release's published checksums, and runs `gitleaks git --redact --exit-code 1` (AC9, FR8)

### T009: README credential security section

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T007
**Acceptance**:
- Adds a "Credential security" section that covers each AC10 item: keyring per OS, when the vault is used, its file-permission-only protection, the vault directory per OS, keeping the directory owner-only, excluding `vault.key` from backups and sync, full-disk encryption, installing a Secret Service keyring (`secret-tool`/libsecret) on Linux, and deleting the vault directory to remove credentials (AC10, FR10)

### T010: Engine fakes and sentinel harness

**File(s)**: `tests/support/fake-engine.ts`, `tests/support/sentinel.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `fakeEngine()` returns recording fakes for `$.http`, `$.process` (scriptable per argv, with a per-platform keyring simulation), `$.env`, `$.fs` (in-memory), `$.session`, `$.store`, `$.ui` and `$.telemetry`, and never touches the real host (FR9)
- `assertNoSentinel(engine, sentinel, extra?)` scans every recorded call, argv, env, stored value, settings write, UI/telemetry text, captured console output and given error messages (FR8)

### T011: Scaffold and version tests

**File(s)**: `tests/manifest/versions.test.ts`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- AC2: asserts `package.json` and `.claude-plugin/plugin.json` versions equal the trimmed `VERSION`, and `hooks/hooks.json` lists `./register.ts`
- AC1: asserts `.gitignore` ignores `.claude-plugin/types/` and that `package.json` defines `types:sync`, `typecheck` and `test`; the live check is `npm run types:sync && npm run typecheck && npm test`, plus `git check-ignore .claude-plugin/types/claude-code/index.d.ts`

### T012: Guard and registry tests

**File(s)**: `tests/gateway/guard.test.ts`, `tests/gateway/guarded-send.test.ts`, `tests/providers/registry.test.ts`
**Type**: Create
**Depends**: T003, T004, T010
**Acceptance**:
- AC3: provider `anthropic`, base URL `https://api.anthropic.com`, `anthropic/claude-opus-5-5` and `clinepass/claude-sonnet-5-5` are refused with the model named; the transport and the `$.http`/`$.process` fakes record zero calls; `opencode-go/kimi-k3.1-pro` passes
- AC4: a fake transport answering `opencode-go/kimi-k3.1-pro` with model `anthropic/claude-opus-5-5` makes `guardedSend` reject, naming both models, with no content returned and exactly one transport call
- AC5: registering id `anthropic` or base URLs on `anthropic.com`, `claude.ai` or `claude.com` subdomains is rejected and absent from `list()`

### T013: Credential store tests

**File(s)**: `tests/credentials/store.test.ts`, `tests/credentials/vault.test.ts`
**Type**: Create
**Depends**: T007, T010
**Acceptance**:
- AC6: for each of macos, windows and linux, save/read/delete of `opencode-go` round-trips through the faked keyring tool with service `nmg-router` and account `opencode-go/<account>`, and the secret is absent from every recorded argv and env
- AC7: with no keyring, save/read round-trips through `vault.json`/`vault.key`, the POSIX `mkdir -m 700` precedes any write and `chmod 600` follows, and neither file contains the plaintext; locked and failing keyrings throw `keyring_locked`/`keyring_failed` naming platform and provider, and leave the fake fs, `$.store` and settings unchanged
- AC8: saving provider `anthropic` throws `anthropic_refused` with zero `$.process` calls and zero fs writes

### T014: Hygiene and README tests

**File(s)**: `tests/hygiene/gitleaks-workflow.test.ts`, `tests/hygiene/sentinel.test.ts`, `tests/hygiene/fixtures.test.ts`, `tests/fixtures/.gitkeep`, `tests/docs/readme-security.test.ts`
**Type**: Create
**Depends**: T008, T009, T010, T013
**Acceptance**:
- AC9: parses `.github/workflows/gitleaks.yml` with `yaml` and asserts `push` and `pull_request` triggers and a step running `gitleaks`; a runtime-built sentinel secret driven through save/read/delete/failure paths on every platform and the vault passes `assertNoSentinel`; the fixture scanner rejects runtime-built token-, key- and account-id-shaped samples and finds none under `tests/fixtures/`
- AC10: asserts the README "Credential security" section mentions Keychain, Credential Manager, Secret Service, `vault.key`, each per-OS vault directory, backups/sync exclusion, full-disk encryption, and deleting the vault directory

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #1 | 2026-10-24 | Initial feature tasks |
