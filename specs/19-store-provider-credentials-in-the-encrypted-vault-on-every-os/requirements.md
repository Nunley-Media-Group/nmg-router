# Requirements: Store provider credentials in the encrypted vault on every OS

**Issue**: #19
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## User Story

**As a** developer who signs in to routed providers on macOS, Windows or Linux
**I want** my provider credentials kept in the same encrypted vault on every OS
**So that** credential storage behaves the same everywhere, needs no OS keyring tools, and never fails because a keyring is locked or missing

## Background

`createCredentialStore` in `src/credentials/store.ts` currently routes each save, read and delete to an OS keyring backend (`keyring-macos.ts` through `security`, `keyring-windows.ts` through a PowerShell C# helper, `keyring-linux.ts` through `secret-tool`) and uses the AES-256-GCM keyfile vault in `src/credentials/vault.ts` only when no keyring is found. A locked or failing keyring raises `keyring_locked` or `keyring_failed` and never reaches the vault. This feature makes the vault the only backend on every platform and removes the keyring code paths. This replaces spec #1's keyring requirements (its FR6, AC6 and the keyring half of AC7).

## Acceptance Criteria

### AC1: The vault is used on every OS

**Given** a faked `$.process`, `$.env` and `$.fs` for each of macOS, Windows, Linux and an other platform
**When** a credential for `opencode-go/<account>` is saved, read, listed and deleted through `createCredentialStore`
**Then** it is written as AES-256-GCM ciphertext to `vault.json` in that OS's per-user `nmg-router` data directory (`~/Library/Application Support/nmg-router` on macOS, `%LOCALAPPDATA%\nmg-router` on Windows, `${XDG_DATA_HOME:-~/.local/share}/nmg-router` on Linux and other platforms), keyed by the random 256-bit key in `vault.key` beside it; the read returns the saved value; the list returns the credential; the delete removes the entry from `vault.json`; and no `security`, `powershell.exe` or `secret-tool` process runs

### AC2: Vault protections are unchanged

**Given** a POSIX platform
**When** the first credential is saved through the store
**Then** the directory is created owner-only (0700) before any write, both files are set to 0600, a failure of any of these raises `vault_failed` with nothing further written, a malformed `vault.key` is never regenerated over existing entries, and neither file contains the plaintext secret

### AC3: The keyring backends are removed

**Given** the change is complete
**When** the source and tests are inspected
**Then** `src/credentials/keyring-macos.ts`, `src/credentials/keyring-windows.ts` and `src/credentials/keyring-linux.ts` and every keyring test and keyring simulation in the test support code are gone; the store has no keyring routing; and the `keyring_locked` and `keyring_failed` error codes and `NoKeyringError` are removed along with every message that names them

### AC4: The store's interface is unchanged for callers

**Given** code that uses `createCredentialStore` (save, read, delete, list by provider and account)
**When** it runs against the vault-only store
**Then** it behaves as before, Anthropic credentials and invalid ids are still refused before any process runs or any vault file is touched, and the sentinel-secret hygiene test still finds no secret in `$.ui`, `$.telemetry`, `$.store`, settings, error messages, child argv/env or the vault files on every platform

### AC5: README describes the vault on every OS

**Given** the README "Credential security" section
**When** it is read
**Then** it says provider credentials are kept in the encrypted vault on every OS, gives the vault directory per OS, says the key file protects it only as far as file permissions do, and keeps the hardening steps (owner-only directory, exclude `vault.key` from backups and sync, full-disk encryption, delete the vault directory to remove all credentials), with no mention of Keychain, Credential Manager, Secret Service, `secret-tool` or libsecret and no step about installing a keyring

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `createCredentialStore` uses the AES-256-GCM keyfile vault on every platform | Must |
| FR2 | Remove the macOS, Windows and Linux keyring backends, the keyring routing, the keyring helpers, and the `keyring_locked`, `keyring_failed` and `NoKeyringError` errors | Must |
| FR3 | Keep the vault's file format, location, permissions, error behavior and the store's public interface (`createCredentialStore`, `CredentialStore`, `CredentialStoreDeps`, `StoredCredential`) unchanged | Must |
| FR4 | Update the README "Credential security" section to the vault-everywhere design | Must |

## Out of Scope

- Migrating credentials already saved in an OS keyring
- A passphrase-protected vault or a per-session unlock prompt
- Changes to the vault's encryption, key handling or directory layout

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #19 | 2026-10-26 | Initial feature spec |
