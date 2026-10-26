# Tasks: Store provider credentials in the encrypted vault on every OS

**Issue**: #19
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Implementation Tasks

### T001: Route the credential store through the vault on every platform

**File(s)**: `src/credentials/store.ts`, `src/credentials/platform.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `createCredentialStore` memoizes `detectPlatform(deps).then((platform) => createVault(deps, platform))` and has no keyring imports, `keyringFor` or `routeThrough` (FR1, AC1)
- `guard` still validates ids and refuses Anthropic before the platform is probed or any vault file is touched; exported types and `list` are unchanged (FR3, AC4)
- `platform.ts` no longer exports `ProcessDeps`, `KEYRING_SERVICE`, `runKeyringTool` or `keyringError`, and no comment in it mentions a keyring (FR2, AC3)

### T002: Delete the keyring backends and keyring errors

**File(s)**: `src/credentials/keyring-macos.ts`, `src/credentials/keyring-windows.ts`, `src/credentials/keyring-linux.ts`, `src/errors/errors.ts`
**Type**: Delete
**Depends**: T001
**Acceptance**:
- The three keyring modules are deleted (FR2, AC3)
- `CredentialErrorCode` is `"anthropic_refused" | "invalid_id" | "vault_failed"`; the `keyring_locked` and `keyring_failed` messages, the `exitCode` detail and field, and `NoKeyringError` are removed (FR2, AC3)
- `grep -rniE "keyring|NoKeyring|secret-tool|powershell" src` finds nothing
- `npm run typecheck` passes

### T003: Remove the keyring simulation from the test fake

**File(s)**: `tests/support/fake-engine.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- `KeyringState`, the `keyring` option, `keyringRun`, the keyring map and the `DBUS_SESSION_BUS_ADDRESS` default are removed; `run` answers `uname`, `mkdir` and `chmod`, applies `options.run` first, and throws `spawn <cmd> ENOENT` for any other command (AC3)

### T004: Cover the vault-only store on every OS

**File(s)**: `tests/credentials/store.test.ts`, `tests/credentials/vault.test.ts`, `tests/hygiene/sentinel.test.ts`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- `store.test.ts` drops the keyring round-trip, keyring-refusal and no-keyring blocks and, for each of `macos`, `windows`, `linux` and `other`, saves, reads, lists and deletes `opencode-go/default` through `createCredentialStore`, asserting `vault.json` and `vault.key` are written under that OS's directory (`/Users/tester/Library/Application Support/nmg-router`, `C:\Users\tester\AppData\Local\nmg-router`, `/home/tester/.local/share/nmg-router` for linux and other), `vault.json` holds no plaintext, the read returns the secret, the delete leaves `vault.json` without the entry, and no recorded process is `security`, `powershell.exe` or `secret-tool` (AC1)
- `store.test.ts` asserts, through the store on Linux, that `mkdir -p -m 700` precedes the first write, each written file is followed by `chmod 600`, a failing `mkdir` raises `vault_failed` with no write, and a malformed `vault.key` with existing entries raises `vault_failed` and writes nothing (AC2)
- `store.test.ts` keeps the Anthropic and invalid-id refusal tests with no process, file or store write (AC4)
- `vault.test.ts` passes without any `keyring` option; `sentinel.test.ts` runs its store scenario on `macos`, `windows`, `linux` and `other` vault paths and keeps its detector self-tests (AC2, AC4)
- `npm test` passes

### T005: Rewrite the README credential security section

**File(s)**: `README.md`, `tests/docs/readme-security.test.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- The "Credential security" section says provider credentials are kept in the encrypted vault on every OS, lists the three vault directories, says the key file is protected only by file permissions, and keeps the owner-only, backups and sync, full-disk encryption and delete-the-vault-directory steps, with no keyring wording or install-a-keyring step (FR4, AC5)
- `readme-security.test.ts` requires "every OS", "vault.key", "vault.json", the three directory strings, "owner-only", "file permissions", "backups", "sync", "full-disk encryption" and "delete the vault directory", and requires the section not to contain "Keychain", "Credential Manager", "Secret Service", "secret-tool" or "libsecret" (AC5)
- `npx vitest run tests/docs/readme-security.test.ts` passes

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #19 | 2026-10-26 | Initial feature tasks |
