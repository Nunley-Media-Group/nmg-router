# Tasks: Stop recompiling the Windows keyring C# helper on every credential call

**Issue**: #12
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `src/credentials/keyring-windows.ts`, `src/credentials/store.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `helperDllName` and the memoized `helperDllPath` follow the design; the script carries `$dll` and `$source` and keeps the `$mode`, `$target` and `$blob` lines unchanged (FR1)
- The loader loads a cached non-empty DLL, otherwise compiles to a per-process temp file and copies it into place, otherwise compiles in memory, and writes the `nmg-router-helper:<state>` marker to stderr (AC1–AC4, FR1–FR3)
- Target format, exit codes, error kinds and stdin-only secret path are unchanged (AC5, FR4)
- `npm run typecheck` passes

### T002: Add Behavioral Regression Coverage

**File(s)**: `tests/credentials/keyring-windows.test.ts`, `tests/credentials/keyring-windows.windows.test.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The cross-platform test covers the hash name and its change with the source (AC2), `$dll` with and without `LOCALAPPDATA` and quote escaping (AC4), the loader order, and the fake-engine round trip with the secret absent from argv, env and `$dll` (AC5)
- The Windows-only test covers AC1–AC5 against real `powershell.exe` and Credential Manager as the design lists, and is skipped on other platforms
- `npm test` passes, including `tests/credentials/store.test.ts`

### T003: Run the Windows tests in CI

**File(s)**: `.github/workflows/windows-keyring.yml`
**Type**: Create
**Depends**: T002
**Acceptance**:
- A `pull_request` workflow with job `windows-keyring` on `windows-latest` and Node 24 runs `npm ci` and `npx vitest run tests/credentials/keyring-windows.windows.test.ts`, with the design's `paths` filter and read-only `contents` permission (FR5)
- On this issue's pull request, the `windows-keyring` check run passes (AC1–AC5)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #12 | 2026-10-25 | Initial defect tasks |
