# Design: Lay the mod foundation with the Anthropic guard and OS keyring credentials

**Issue**: #1
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Overview

This issue creates the plugin scaffold and three pure-or-injected building blocks that later issues wire into hooks: the Anthropic guard (`src/gateway/`), the provider registry (`src/providers/`) and the credential store (`src/credentials/`). `hooks/register.ts` exports a typed `register` that wires no hooks yet. Everything that touches the host takes a narrow `Pick<EngineInterface, ...>` dependency so tests pass fakes.

## Architecture

```text
hooks/register.ts            export const register: Register = () => {}
src/gateway/anthropic.ts     isAnthropicModel(id), isAnthropicHost(url), isAnthropicProvider(id)
src/gateway/guard.ts         checkRequest(req), checkResponse(requested, resp)  (pure)
src/gateway/guarded-send.ts  guardedSend(transport, req): checkRequest → transport once → checkResponse
src/providers/registry.ts    createProviderRegistry(): register/get/list; rejects Anthropic
src/credentials/platform.ts  detectPlatform(deps) → 'macos' | 'windows' | 'linux' | 'other'
src/credentials/keyring-macos.ts | keyring-windows.ts | keyring-linux.ts   KeyringBackend
src/credentials/vault.ts     keyfile AES-256-GCM vault backend
src/credentials/store.ts     createCredentialStore(deps): picks backend once, refuses anthropic, keeps index
src/errors/errors.ts         typed errors
scripts/sync-mod-types.mjs   pty launch of `claude --plugin-dir <repo>`
.github/workflows/gitleaks.yml
```

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `isAnthropicModel(id)` | model id string | boolean | True when the id starts with `anthropic/`, or when the name after the last `/` contains the token `claude`, or matches `(opus\|sonnet\|haiku\|fable)[-_.]?\d`, case-insensitive |
| `isAnthropicHost(url)` | URL string | boolean | True for `anthropic.com`, `claude.ai`, `claude.com` and their subdomains; an unparsable URL counts as true (fail closed) |
| `checkRequest({ provider, model, baseUrl? })` | routed request | `void` / throws `AnthropicRequestRefused` (`code: 'anthropic_request_refused'`, `model`) | Refuses on provider `anthropic`, Anthropic host or Anthropic model |
| `checkResponse(requestedModel, { model })` | requested id, response | `void` / throws `AnthropicResponseRejected` (`requested`, `returned`) | Rejects an Anthropic response model, or a missing response model |
| `guardedSend(transport, request)` | `(req) => Promise<{ model, content }>`, request | content / throws | Calls `checkRequest` before the transport, calls the transport exactly once, and returns content only after `checkResponse` passes; never retries |
| `createProviderRegistry()` | — | `{ register(def), get(id), list() }` | `register` throws `ProviderRejected` for id `anthropic` or an Anthropic base URL |
| `createCredentialStore(deps)` | `{ process, env, fs, store }` | `{ save(provider, account, secret), read(provider, account), delete(provider, account), list(provider?) }` | Provider and account must match `^[a-z0-9][a-z0-9._-]{0,63}$`; provider `anthropic` throws `CredentialError('anthropic_refused')` before any backend call; `read` resolves `undefined` when absent |
| `CredentialError` | — | `code: 'anthropic_refused' \| 'invalid_id' \| 'keyring_locked' \| 'keyring_failed' \| 'vault_failed'`, `platform`, `provider` | Message names the platform and provider only; never the secret or child stderr |

## Data / Storage Changes

**Platform detection** (`detectPlatform`): `$.env.get("OS") === "Windows_NT"` → windows. Otherwise `$.process.run(["uname", "-s"])`: `Darwin` → macos, `Linux` → linux, else other. The backend is resolved once per store instance.

**Keyring backends** (service `nmg-router`, account `<provider>/<account>`; any secret is passed only through `stdin`):
- macOS: save runs `security -i` with the stdin line `add-generic-password -U -s nmg-router -a <provider>/<account> -X <hex secret>`. Read runs `security find-generic-password -s nmg-router -a <key> -w` (stdout, trailing newline trimmed; exit 44 → `undefined`). Delete runs `security delete-generic-password -s nmg-router -a <key>` (exit 44 → no-op). Stderr containing `User interaction is not allowed` or exit 36/51 → `keyring_locked`. A missing `security` → no keyring.
- Windows: `powershell.exe -NoProfile -NonInteractive -Command -`, with a stdin script that `Add-Type`s the advapi32 `CredWriteW`/`CredReadW`/`CredDeleteW` P/Invoke and targets the generic credential `nmg-router:<provider>/<account>`. For save, the secret is embedded in the stdin script as a base64 literal. A read writes base64 to stdout, and not-found exits 2 → `undefined`. A missing `powershell.exe` → no keyring.
- Linux: `secret-tool store --label "nmg-router <key>" service nmg-router account <key>` with the secret on stdin; `secret-tool lookup service nmg-router account <key>` (exit 1 with empty stdout → `undefined`); `secret-tool clear service nmg-router account <key>`. No keyring when `secret-tool` cannot start, `DBUS_SESSION_BUS_ADDRESS` is unset, or stderr names `org.freedesktop.secrets` as not provided or D-Bus autolaunch failing. Stderr naming a locked or dismissed unlock → `keyring_locked`.
- Any other non-zero exit → `keyring_failed` (carries the exit code only). A locked or failing keyring never falls back to the vault.

**Keyfile vault** (only when no supported keyring is found, or platform `other`):
- Directory: macOS `$HOME/Library/Application Support/nmg-router`; Linux `${XDG_DATA_HOME:-$HOME/.local/share}/nmg-router`; Windows `%LOCALAPPDATA%\nmg-router`.
- POSIX: before any write, `mkdir -p -m 700 <dir>` then `chmod 700 <dir>`; after each file write, `chmod 600 <file>`. A failure of any of these → `vault_failed`, with nothing further written.
- `vault.key`: base64 of 32 bytes from `crypto.getRandomValues`, created on first save. A present but malformed key → `vault_failed`, and the key is never regenerated over existing entries.
- `vault.json`: `{ "version": 1, "entries": { "<provider>/<account>": { "iv": b64(12 bytes), "ct": b64 } } }`, AES-256-GCM via `crypto.subtle`, AAD `nmg-router:<provider>/<account>`, and a fresh IV per write. Delete removes the entry.

**Index**: `$.store` key `credentials.index` holds `{ provider, account }[]` (no secrets). It is updated only after a backend save or delete succeeds, and `list` reads it.

## State and UI Behavior

No UI in this issue. `hooks/register.ts` registers nothing. Errors carry the typed codes above for later login and routing issues to surface.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Pty launch of `claude --plugin-dir` for types | Selected | Only path where the installed Claude Code lays `.claude-plugin/types/` |
| Copy plugin-authoring skill types | Rejected | Exists only after the skill loads in the current process |
| Keyfile vault fallback | Selected | Works on every OS with no extra tools and no prompt |
| Passphrase vault / refuse when no keyring | Rejected | User chose no per-session prompt and universal support |
| `gitleaks/gitleaks-action` | Rejected | Needs a license for organization repositories; pinned CLI used instead |
| `gdbus` Secret Service fallback on Linux | Rejected | The vault covers machines without `secret-tool` |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #1 | 2026-10-24 | Initial feature design |
