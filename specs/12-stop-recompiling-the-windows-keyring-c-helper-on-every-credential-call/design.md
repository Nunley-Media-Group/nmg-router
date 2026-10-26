# Root Cause Analysis: Stop recompiling the Windows keyring C# helper on every credential call

**Issue**: #12
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Root Cause

`script()` in `src/credentials/keyring-windows.ts` embeds `NATIVE_SOURCE` in an `Add-Type -TypeDefinition` block in every generated script. `createWindowsKeyring` runs that script in a fresh `powershell.exe` through `runKeyringTool` (`src/credentials/platform.ts`) for each `save`, `read` and `delete`. A compiled type lives only as long as its PowerShell process, so nothing is reused between calls and every call recompiles.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/credentials/keyring-windows.ts` | `script()`, `createWindowsKeyring()` | Builds the per-call script that compiles the helper |
| `src/credentials/store.ts` | `createWindowsKeyring(deps)` call | Passes the engine; it already carries `env` |
| `tests/support/fake-engine.ts` | `powershell.exe` emulation | Parses `$mode`, `$target`, `$blob`; unchanged |

## Fix Strategy

The TypeScript side resolves the cache path and the hashed name; the PowerShell side loads or builds the DLL.

**TypeScript (`keyring-windows.ts`):**
- `createWindowsKeyring(deps: PlatformDeps)` (env + process).
- `export async function helperDllName(source: string): Promise<string>` → `NmgRouterCredential-<first 16 hex of SHA-256(source)>.dll`, using `globalThis.crypto.subtle.digest("SHA-256", …)`.
- `helperDllPath(deps)` → `${LOCALAPPDATA}\nmg-router\${await helperDllName(NATIVE_SOURCE)}`, or `""` when `LOCALAPPDATA` is unset or empty. Resolved once per backend and memoized.
- `script(mode, target, secretBase64, dllPath)` keeps the `$mode`, `$target` and `$blob` lines exactly as today and adds `$dll = '<dllPath>'`, with `'` doubled to `''` for PowerShell single-quoted literals. The C# source goes into a here-string `$source = @" … "@` used by every compile path.

**PowerShell loader (in the generated script, before the mode branch):**
1. `$state = ''`. If `$dll` is non-empty and the file exists with length > 0, `try { Add-Type -LiteralPath $dll; $state = 'cache' } catch {}`.
2. If `$state` is still empty and `$dll` is non-empty, `try`:
   - create the parent directory (`New-Item -ItemType Directory -Force`);
   - compile `$source` to a per-process temp file beside it (`"$dll.$PID.tmp"`) with `Add-Type -TypeDefinition $source -OutputAssembly $tmp -OutputType Library`;
   - copy the temp file over `$dll` (`Copy-Item -Force`), then remove the temp file;
   - make the type available: if `'NmgRouterCredential' -as [type]` is null, `Add-Type -LiteralPath $dll`;
   - `$state = 'compiled'`.
   `catch`: remove the temp file if present (errors ignored); if `'NmgRouterCredential' -as [type]` is non-null, `$state = 'compiled'`.
3. If `$state` is still empty, `Add-Type -TypeDefinition $source; $state = 'memory'`.
4. `[Console]::Error.Write("nmg-router-helper:$state")`. stderr is never copied into errors (`keyringError`), and the marker carries no secret or account.

The mode branch, exit codes (2 for `1168` not-found, 1 for other Win32 errors) and the stdout base64 for reads are unchanged. The secret stays only in the `$blob` literal on stdin; the DLL holds only compiled `NATIVE_SOURCE`, and `$dll` is built only from `LOCALAPPDATA` and the hash.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/credentials/keyring-windows.ts` | `helperDllName`, `helperDllPath`, `$dll`/`$source` script lines and the loader | AC1–AC4, FR1–FR3 |
| `src/credentials/store.ts` | Pass `PlatformDeps` to `createWindowsKeyring` if its type needs widening | FR1 |
| `tests/credentials/keyring-windows.test.ts` | Cross-platform script and hash tests | AC2, AC4, AC5 |
| `tests/credentials/keyring-windows.windows.test.ts` | Real `powershell.exe` tests, run only on Windows | AC1–AC5 |
| `.github/workflows/windows-keyring.yml` | Windows CI job running the Windows test | FR5 |

**Cross-platform test (`tests/credentials/keyring-windows.test.ts`)**, run with the fake engine and by calling exported helpers:
- `helperDllName(NATIVE_SOURCE)` matches `^NmgRouterCredential-[0-9a-f]{16}\.dll$`; a source differing by one character yields a different name (AC2).
- With `LOCALAPPDATA = C:\Users\tester\AppData\Local`, the recorded stdin has `$dll = 'C:\Users\tester\AppData\Local\nmg-router\NmgRouterCredential-<hash>.dll'`; with `LOCALAPPDATA` unset, `$dll = ''` and the round trip still succeeds (AC4).
- A `LOCALAPPDATA` containing `'` is emitted with `''`.
- The loader text tries `Add-Type -LiteralPath $dll` before any `-OutputAssembly` compile, and the in-memory `Add-Type -TypeDefinition $source` is the last resort.
- Save/read/delete through `createCredentialStore` on the fake still round-trips under target `nmg-router:opencode-go/default`, not-found reads return `undefined`, a failing keyring raises `keyring_failed`, and the sentinel secret is absent from argv, env and the `$dll` line (AC5).

**Windows test (`tests/credentials/keyring-windows.windows.test.ts`)**, `describe.runIf(process.platform === "win32")`:
- A `ProcessDeps` adapter over `node:child_process` `spawn` runs the real `powershell.exe` with stdin and returns `{ exitCode, stdout, stderr }`; a missing executable rejects with an `ENOENT` message. `env.get` reads from a per-test map whose `LOCALAPPDATA` is a fresh temp directory.
- Providers use a random test account (`nmg-test-<random>`), and every credential is deleted in `afterEach`.
- AC1: the first `save` reports `nmg-router-helper:compiled` and creates the DLL; the following `read` and `delete` report `nmg-router-helper:cache`, and the DLL's modified time is unchanged.
- AC2: a DLL placed under a different hash name is ignored; the call reports `compiled` and creates the current name.
- AC3: with a zero-byte file and then a garbage-bytes file at the current name, the call succeeds, reports `compiled`, and the file is replaced by one that a later call loads (`cache`).
- AC4: with `LOCALAPPDATA` unset, and with `LOCALAPPDATA` pointing at a regular file (so the directory cannot be created), the call succeeds and reports `memory`.
- AC5: a credential saved with `LOCALAPPDATA` unset (in-memory helper) is read back through the cached helper; a read of an unknown account returns `undefined`; the secret appears in neither argv, env nor the DLL bytes.

**CI (`.github/workflows/windows-keyring.yml`):** workflow `windows keyring`, job id and name `windows-keyring`, `on: pull_request` with `paths` for `src/credentials/**`, `tests/credentials/**`, `tests/support/**`, `.github/workflows/windows-keyring.yml`, `package.json` and `package-lock.json`; `runs-on: windows-latest`; `actions/checkout`, `actions/setup-node` with Node 24, `npm ci`, then `npx vitest run tests/credentials/keyring-windows.windows.test.ts`. `permissions: contents: read`.

## Blast Radius

Only the Windows keyring backend's generated script and its constructor type change. macOS, Linux and the vault are untouched. The fake engine still parses the same three script lines, so existing store tests keep their meaning.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Hash computed in TypeScript and embedded in the script | Selected | Testable on every OS; matches the vault's `LOCALAPPDATA` resolution |
| Hash computed inside PowerShell | Rejected | Only provable on Windows |
| Compile directly to `$dll` | Rejected | A concurrent call could load a half-written file; a per-process temp file plus copy avoids it |
| A long-lived PowerShell process | Rejected | Out of scope in the issue |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #12 | 2026-10-25 | Initial defect design |
