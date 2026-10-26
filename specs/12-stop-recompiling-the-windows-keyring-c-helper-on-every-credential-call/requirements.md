# Defect Report: Stop recompiling the Windows keyring C# helper on every credential call

**Issue**: #12
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Reproduction

1. On Windows with Credential Manager available, start Claude Code with the mod loaded.
2. Save a provider credential, then read it back, then delete it.
3. Each of the three calls compiles the `NmgRouterCredential` C# helper again with `Add-Type -TypeDefinition` in a new `powershell.exe`, so each one takes roughly the compile time.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The helper is compiled once into a DLL cached under `%LOCALAPPDATA%\nmg-router`; later calls load the cached DLL without compiling; save, read and delete behave as before |
| **Actual** | Every credential call compiles the helper from source |

## Acceptance Criteria

### AC1: The helper is compiled once and reused

**Given** no cached helper DLL exists under `%LOCALAPPDATA%\nmg-router`
**When** the first Windows credential call runs, and then further save, read or delete calls run
**Then** the first call compiles the helper to `%LOCALAPPDATA%\nmg-router\NmgRouterCredential-<hash>.dll` and completes the operation, and the later calls load that DLL without compiling the C# source

### AC2: A changed helper source is recompiled

**Given** a cached helper DLL built from an earlier version of the C# source
**When** a credential call runs with a changed source
**Then** the DLL file name, which carries the first 16 hex characters of the SHA-256 of the C# source, no longer matches, so the call compiles and uses a new DLL instead of loading the stale one

### AC3: A broken cached DLL is rebuilt

**Given** the cached helper DLL with the matching name is empty or cannot be loaded
**When** a credential call runs
**Then** the call recompiles the helper, replaces the cached DLL with a loadable one and completes the operation without reporting a keyring failure

### AC4: The helper still works without a cache directory

**Given** `LOCALAPPDATA` is unset, or the cache directory cannot be created or written
**When** a credential call runs
**Then** the helper is compiled in memory as today and the operation completes

### AC5: Existing credential behavior is preserved

**Given** credentials saved by the Windows keyring
**When** they are read or deleted after the fix
**Then** they are found under the same Credential Manager target `nmg-router:<provider>/<account>`; a missing credential still reports not-found (exit code 2); Credential Manager failures still raise `keyring_failed`; and the secret travels only on stdin, never in argv, the environment, the DLL path or the cached DLL

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Compile `NATIVE_SOURCE` to `NmgRouterCredential-<hash>.dll` under `%LOCALAPPDATA%\nmg-router`, where `<hash>` is the first 16 hex characters of the source's SHA-256, and load that DLL on later calls instead of compiling | Must |
| FR2 | Recompile and replace the cached DLL when it is missing, empty or fails to load | Must |
| FR3 | Compile in memory, as today, when `LOCALAPPDATA` is unset or the cache cannot be written | Must |
| FR4 | Keep the Credential Manager target format, exit-code mapping, error kinds and the stdin-only secret path unchanged | Must |
| FR5 | A Windows CI job runs the real `powershell.exe` keyring tests on pull requests that touch the credential code | Must |

## Out of Scope

- Replacing the C# P/Invoke helper with a different credential API or moving stored credentials
- Keeping a long-lived PowerShell process across calls
- Changes to the macOS and Linux keyring backends or the vault

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #12 | 2026-10-25 | Initial defect report |
