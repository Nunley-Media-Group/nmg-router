# Design: Store provider credentials in the encrypted vault on every OS

**Issue**: #19
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Overview

The credential store stops routing through OS keyrings. `createCredentialStore` detects the platform once, on first use, and hands every save, read and delete to `createVault(deps, platform)`. The vault itself (`src/credentials/vault.ts`) is not changed. The keyring backends, the keyring process helpers and the keyring error codes are deleted, and the test fake loses its keyring simulation.

## Architecture

```text
createCredentialStore(deps)
  ├─ guard(provider, account): assertIds → refuseAnthropic   (before any probe or file access)
  ├─ resolve(): detectPlatform(deps) once → createVault(deps, platform)
  │     detectPlatform: env OS === "Windows_NT" → windows; `uname -s` → macos | linux; else other
  ├─ save/read/delete → vault backend
  └─ index of { provider, account } in $.store "credentials.index" (unchanged)
```

`src/credentials/store.ts`:
- Drop the imports of the three keyring modules and `NoKeyringError`, and delete `keyringFor` and `routeThrough`.
- `resolve()` becomes `backend ??= detectPlatform(deps).then((platform) => createVault(deps, platform));`, keeping the once-per-store memoization comment.
- `guard`, the index handling, `list`, and every exported type stay as they are. `CredentialStoreDeps` stays `Pick<EngineInterface, "env" | "fs" | "process" | "store">` because the vault and platform detection still use all four.

`src/credentials/platform.ts` keeps `Platform`, `PlatformDeps`, `CredentialBackend`, `accountKey`, `detectPlatform`, `toBase64` and `fromBase64`. It removes `ProcessDeps`, `KEYRING_SERVICE`, `isMissingTool`, `runKeyringTool` and `keyringError`, and the keyring wording in the `CredentialBackend` comment and in `detectPlatform`'s catch comment ("uname did not start, so the platform is unknown").

Deleted: `src/credentials/keyring-macos.ts`, `src/credentials/keyring-windows.ts`, `src/credentials/keyring-linux.ts`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `createCredentialStore(deps)` | `CredentialStoreDeps` | `CredentialStore` | Unchanged signature; every platform uses the vault |
| `CredentialStore.save/read/delete/list` | provider, account, secret | same as before; failures are `invalid_id`, `anthropic_refused` or `vault_failed` | No `keyring_locked` or `keyring_failed` can be raised |
| `CredentialErrorCode` (`src/errors/errors.ts`) | — | `"anthropic_refused" \| "invalid_id" \| "vault_failed"` | `keyring_locked` and `keyring_failed` removed with their messages |
| `CredentialErrorDetail` / `CredentialError` | `platform?`, `provider?` | — | `exitCode` removed; only the keyring paths set it |
| `NoKeyringError` | — | — | Removed |

The header comment of `src/errors/errors.ts` keeps its rule that messages never carry a secret, a response body or a child process's stderr.

## Data / Storage Changes

None. `vault.json` (`{ version: 1, entries: { "<provider>/<account>": { iv, ct } } }`), `vault.key` (base64 of 32 random bytes), the per-OS directory, the AAD `nmg-router:<provider>/<account>`, the POSIX `mkdir -p -m 700` + `chmod 700` before writes and `chmod 600` after each file write, the refusal to regenerate a missing or malformed key over existing entries, and the single `vault_failed` error all stay as implemented in `src/credentials/vault.ts`.

## Test Support Changes

`tests/support/fake-engine.ts` removes `KeyringState`, the `keyring` option, `keyringRun`, the keyring map and the Linux `DBUS_SESSION_BUS_ADDRESS` default. `run` answers `uname`, `mkdir` and `chmod` as today, applies `options.run` overrides first, and throws `spawn <cmd> ENOENT` for any other command. Tests drop every `keyring:` option.

## Documentation

README "Credential security" is rewritten: provider credentials are kept in the encrypted vault on every OS; the vault stores AES-256-GCM ciphertext in `vault.json` decrypted with the random 256-bit key in `vault.key` beside it, and the key file is protected only by file permissions; the per-OS directory list is unchanged; the hardening list keeps owner-only directory, excluding `vault.key` from backups and sync, full-disk encryption, and deleting the vault directory to remove every credential. The keyring bullets, the "used only when no supported keyring is found" paragraph, the install-a-keyring step and the keyring-removal sentence are removed.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep the keyring modules but stop calling them | Rejected | AC3 requires the backends and their error codes to be gone |
| Pass the platform into `createCredentialStore` instead of detecting it | Rejected | Changes the caller interface that FR3 keeps unchanged |
| Store directly calls `createVault` after `detectPlatform`, memoized per store | Selected | Smallest change; keeps the lazy, once-per-store probe and the refuse-before-probe ordering |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #19 | 2026-10-26 | Initial feature design |
