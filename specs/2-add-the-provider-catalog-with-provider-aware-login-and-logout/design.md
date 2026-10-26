# Design: Add the provider catalog with provider-aware /login and /logout

**Issue**: #2
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Overview

Providers become plugins. Each built-in provider is one module that exports a `ProviderPlugin`. A `ProviderPlugin` is composed of small, separately typed parts: identity, login method, model source and wire resolver. The catalog, the login commands and the token refresher depend only on these interfaces, never on a concrete provider:

- **Open-closed:** adding a provider is one file plus one line in `src/providers/builtin/index.ts`.
- **Interface segregation:** a login method or model source can be reused across providers (`apiKeyLogin`, `openAiModelsList`).
- **Dependency inversion:** every host call goes through a narrow `Pick<EngineInterface, ...>` dependency, so tests pass fakes.

`hooks/register.ts` stays thin. It builds the services once and wires `command.run` (`login`, `logout`), `ui.render` and `ui.close` to functions in `src/`.

oh-my-pi's sources are the reference for every component. Each is cited below by path relative to the installed `@oh-my-pi/` package directory; the binary-only 18.12.6 additions are cited by name. No code is copied.

## Architecture

```text
hooks/register.ts                 builds services; on("command.run",{command:"login"|"logout"}); on("ui.render"/"ui.close") → pane controller
src/providers/types.ts            ProviderPlugin, ProviderIdentity, LoginMethod, ModelSource, WireResolver, CatalogModel, WireFormat, Effort
src/providers/registry.ts         (modify) registers ProviderPlugin values; keeps Anthropic id/host rejection
src/providers/builtin/index.ts    BUILTIN_PROVIDERS: readonly ProviderPlugin[]  (the one list to extend)
src/providers/builtin/opencode-go.ts | cline-pass.ts | openai-codex.ts | xai.ts
src/providers/custom.ts           customProvider(entry) → ProviderPlugin
src/providers/metadata.ts         bundled per-model capability metadata for built-in providers
src/providers/http.ts             getJson / postForm over $.http → HttpOutcome (ok | status | offline | malformed)
src/models/model-id.ts            toModelId(provider, model), parseModelId(id)
src/models/openai-models-list.ts  parse {data|models|result|items:[…]} or a bare array → model ids + live limits
src/models/patterns.ts            enabledModels matcher
src/catalog/catalog.ts            createCatalog(deps, providers, config) → load(), refresh(providerId?), models(), status(providerId)
src/catalog/cache.ts              $.store "catalog.cache" read/write (no credentials)
src/config/user-config.ts         configPath(deps), loadUserConfig(deps) → { config, problems[] }
src/auth/accounts.ts              credential secret encode/decode; active account and labels in $.store
src/auth/api-key-login.ts         apiKeyLogin({ validate }) → LoginMethod
src/auth/oauth-code-login.ts      oauthCodeLogin(OAuthCodeConfig) → LoginMethod (PKCE, paste, exchange, refresh)
src/auth/pkce.ts | jwt.ts         PKCE S256 verifier/challenge; JWT payload decode (no verification)
src/auth/access-token.ts          resolveCredential(deps, plugin, account): refresh-if-expiring, then return
src/login/fuzzy.ts                fuzzyFilter(rows, query)
src/login/masked-input.ts         pure masked-field reducer
src/login/pane.ts                 pane controller: one focused pane, views select | secret | text | message
src/login/login-command.ts        handleLogin($, e, next, services)
src/login/logout-command.ts       handleLogout($, e, next, services)
src/errors/errors.ts              (modify) LoginError, ConfigProblem
```

### Reference map (oh-my-pi, reference only)

| Component | oh-my-pi reference |
|-----------|--------------------|
| `ProviderPlugin` split (identity, login, discovery) | `pi-ai/src/registry/types.ts`, `pi-ai/src/registry/registry.ts`, `pi-catalog/src/provider-models/descriptor-types.ts`, `pi-catalog/src/model-manager.ts` |
| OpenCode Go wire resolution | `pi-catalog/src/provider-models/openai-compat.ts` (`createOpenCodeApiResolution`); 18.12.6 `behavior.apiRoutes` |
| ClinePass provider, headers, model list | 18.12.6 `catalog/src/wire/cline-pass.ts`, `provider-models/cline-pass.ts`, `auth/cline-pass.kdl` |
| Codex OAuth, refresh, paste parsing | `pi-ai/src/registry/oauth/openai-codex.ts`, `pi-ai/src/registry/oauth/pkce.ts`, `pi-ai/src/registry/oauth/callback-server.ts` (`parseCallbackInput`) |
| Codex model list | `pi-catalog/src/discovery/codex.ts` |
| xAI | `pi-ai/src/registry/xai.ts`, `pi-catalog/src/provider-models/openai-compat.ts` |
| API-key validation | `pi-ai/src/registry/api-key-validation.ts`, `pi-ai/src/registry/api-key-login.ts` |
| OpenAI-compatible list parsing | `pi-catalog/src/discovery/openai-compatible.ts` |
| Model metadata shape | `pi-catalog/src/types.ts`, `pi-catalog/src/effort.ts`, `pi-catalog/src/models.json` |
| Cache and discovery status | `pi-catalog/src/model-cache.ts`, `pi-coding-agent/src/config/model-provider-discovery.ts` |
| Account replace / upsert | `pi-ai/src/auth-storage.ts` (`set` replaces API keys; `#upsertOAuthCredential`) |
| Config filters | `pi-coding-agent/src/config/settings-schema.ts`, `pi-coding-agent/src/config/model-resolver.ts` |
| Custom providers | `pi-coding-agent/src/config/models-config-schema-bundle.ts`, `pi-coding-agent/src/config/model-registry.ts` |
| Login/logout selector, accounts | `pi-coding-agent/src/modes/components/oauth-selector.ts`, `logout-account-selector.ts`, `pi-coding-agent/src/slash-commands/helpers/logout.ts`, `pi-tui/src/fuzzy.ts` |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `ProviderPlugin` | — | `{ identity: ProviderIdentity; login: LoginMethod; models: ModelSource; wire: WireResolver }` | The only shape catalog and login code see |
| `ProviderIdentity` | — | `{ id, name, baseUrl, headers?(ctx) }` | `id` matches `^[a-z0-9][a-z0-9._-]{0,63}$`; `headers` returns the provider's fixed request headers |
| `LoginMethod` | — | `{ kind: "api-key", validate(deps, key) } \| { kind: "oauth-code", config: OAuthCodeConfig } \| { kind: "none" }` | The login command switches on `kind` only |
| `ModelSource.list(deps, auth)` | `auth: { token, accountId? } \| undefined` | `DiscoveryOutcome`: `{ kind: "ok", models: RawModel[] } \| { kind: "unauthenticated" \| "unavailable" \| "empty" \| "offline" }` | 401/403 → `unauthenticated`; any other non-2xx or unparsable body → `unavailable`; `[]` → `empty`; a rejected fetch → `offline` |
| `WireResolver(modelId)` | bare model id | `{ wire: WireFormat, baseUrl }` | `WireFormat` = `openai-completions \| openai-responses \| anthropic-messages \| openai-codex-responses` |
| `CatalogModel` | — | `{ id, provider, model, name, wire, baseUrl, contextWindow?, maxOutput?, reasoningEfforts?, vision?, price?, cached? }` | `id` = `provider/model`; `reasoningEfforts` ⊆ `minimal \| low \| medium \| high \| xhigh \| max`; `price` is USD per million tokens `{ input, output, cacheRead?, cacheWrite? }` |
| `toModelId(provider, model)` | ids | `string` | `provider/model`; strips one leading `provider/` already present (ClinePass returns `cline-pass/<m>`) |
| `createCatalog(deps, providers, config)` | `deps: Pick<EngineInterface, "http" \| "store">` plus credential resolver | `{ load(), refresh(id?), models(), status(id) }` | See Data / Storage |
| `loadUserConfig(deps)` | `Pick<EngineInterface, "env" \| "fs" \| "process">` | `{ config, problems: ConfigProblem[] }` | A missing file gives empty config; malformed JSON gives one problem and empty config |
| `handleLogin($, e, next, services)` | `command.run` for `login` | `CommandRunResult` | Anthropic → `return next(e)`; otherwise runs the provider's login method and returns `{ text }` |
| `handleLogout($, e, next, services)` | `command.run` for `logout` | `CommandRunResult` | Anthropic → `return next(e)`; otherwise deletes the chosen credential |
| `resolveCredential(deps, plugin, account)` | — | `{ token, accountId? }` / throws `LoginError("refresh_failed")` | An OAuth credential with `now + 60 s >= expires` is refreshed and saved first |
| `LoginError` | code | `invalid_key \| validation_failed \| offline \| oauth_state_mismatch \| oauth_exchange_failed \| oauth_no_account \| refresh_failed \| cancelled` | Message names the provider and the HTTP status only, never a key, token, code or response body |

## Built-in Providers

| id | Name | Base URL | Login | Model list | Wire |
|----|------|----------|-------|------------|------|
| `opencode-go` | OpenCode Go | `https://opencode.ai/inference/go` | API key; validate `GET <base>/v1/models` | `GET <base>/v1/models` (OpenAI list) | per model (below); `anthropic-messages` models use the bare base, others `<base>/v1` |
| `cline-pass` | ClinePass | `https://api.cline.bot/api/v1` | API key; validate `GET <base>/users/me` | `GET <base>/ai/cline/recommended-models` → `{ clinePass: [{id}], free: [{id}] }` (free shown as `<name> (free)`) | `openai-completions` |
| `openai-codex` | OpenAI Codex | `https://chatgpt.com/backend-api` | OAuth code (below) | `GET <base>/codex/models?client_version=0.159.0` → `{ models\|data: [{ slug\|id, display_name, context_window, supported_reasoning_levels:[{effort}], input_modalities, visibility }] }`; `visibility` `hide`/`hidden` dropped; default context 272000, max output 128000 | `openai-codex-responses` |
| `xai` | xAI | `https://api.x.ai/v1` | API key; validate `GET <base>/models` | `GET <base>/models` (OpenAI list) | `openai-responses` |

**OpenCode Go wire resolution**, checked in order:
1. Per-id overrides: `deepseek-v4-flash` → `openai-responses`; `minimax-m2.7`, `minimax-m3`, `minimax-m3-free`, `qwen3.5-plus` and `qwen3.6-plus` → `openai-completions`.
2. Bundled metadata `wire`, when present.
3. Prefix: `gpt-` or `grok-` → `openai-responses`; `minimax-` or `qwen` → `anthropic-messages`.
4. Otherwise `openai-completions`.

**Request headers:**
- **All requests:** `Authorization: Bearer <token>` (when there is one) and `accept: application/json`.
- **OpenCode Go and xAI:** `User-Agent: nmg-router`.
- **ClinePass:** `HTTP-Referer: https://cline.bot`, `X-Title: Cline`, `X-IS-MULTIROOT: false`, `X-CLIENT-TYPE: cline-sdk`, `User-Agent: Cline/3.0.58`, `X-CLIENT-VERSION: 3.0.58`, `X-PLATFORM: <darwin|win32|linux>`, `X-PLATFORM-VERSION: 3.0.54`, `X-CORE-VERSION: 0.0.79`.
- **Codex:** `chatgpt-account-id: <accountId>`, `OpenAI-Beta: responses=experimental`, `originator: codex_cli_rs`, `version: 0.159.0`.

**Codex OAuth** (`OAuthCodeConfig`):
- **Endpoints:** client id `app_EMoamEEZ73f0CkXaXp7hrann`; authorize `https://auth.openai.com/oauth/authorize`; token `https://auth.openai.com/oauth/token`; redirect `http://localhost:1455/auth/callback` (never listened on).
- **Authorize request:** scopes `openid profile email offline_access`; PKCE S256 with a 96-byte random verifier, base64url-encoded; a random `state`. Extra params: `id_token_add_organizations=true`, `codex_cli_simplified_flow=true`, `originator=codex_cli_rs`.
- **Paste parsing:** accepts a full redirect URL, a `code=…&state=…` string, `code#state`, or a bare code. A present state that differs from the issued one → `oauth_state_mismatch`, and nothing is saved.
- **Exchange:** form POST `grant_type=authorization_code, client_id, code, code_verifier, redirect_uri`. The response must hold `access_token`, `refresh_token` and `expires_in`; otherwise `oauth_exchange_failed`.
- **Identity:** `accountId` comes from the access-token claim `["https://api.openai.com/auth"].chatgpt_account_id` (missing → `oauth_no_account`). `email` comes from `["https://api.openai.com/profile"].email`, lowercased. `plan` comes from `chatgpt_plan_type`.
- **Refresh:** form POST `grant_type=refresh_token, refresh_token, client_id`. An absent new refresh token keeps the old one. `expires = now + expires_in * 1000`.

## Data / Storage Changes

**Credential secrets** (keyring through `createCredentialStore`, one JSON string per account):
- API key: `{"type":"api-key","key":"…"}`, saved under account `default`. A new key replaces it, and any other accounts for that provider are deleted first.
- OAuth: `{"type":"oauth","access":"…","refresh":"…","expires":<epoch ms>,"accountId":"…"}`, saved under the account id. The account id is `accountId` lowercased, with each character outside `[a-z0-9._-]` replaced by `-`, cut to 64 characters, and a leading non-alphanumeric character replaced by `a`. A login for an existing account id overwrites it.

**`$.store` keys** (no secrets):
- `accounts.active`: `{ [provider]: account }`. Login sets the new account active. Deleting the active account makes the first remaining indexed account active, or removes the key when none remains.
- `accounts.labels`: `{ [provider]: { [account]: "<email> (<plan>)" } }`, for OAuth accounts.
- `catalog.cache`: `{ version: 1, providers: { [id]: { fetchedAt, status, models: CatalogModel[] } } }`.

**Catalog:**
- `load()` reads `catalog.cache` and the user config only, and makes no `$.http` call.
- `refresh(id?)` runs for each enabled provider (all, or one). A provider with no stored credential and login kind `api-key`/`oauth-code` records `not-logged-in`, makes no network call and keeps nothing.
- Otherwise it resolves the active account's credential (`resolveCredential`), calls `models.list`, and then:
  - drops every model where `isAnthropicModel(toModelId(...))` is true;
  - merges bundled metadata, with live `context_window`/`context_length` and `max_completion_tokens` overriding bundled values;
  - resolves the wire per model.
- `ok` replaces the provider's cached models and records `status: "ok"`.
- `unauthenticated`, `unavailable`, `empty` or `offline` records that status and keeps the previously cached models, each with `cached: true`.
- `models()` returns the cached models of enabled providers, filtered by `enabledModels`.

**Bundled metadata** (`src/providers/metadata.ts`): a table keyed by `provider/model`, giving `name`, `contextWindow`, `maxOutput`, `reasoningEfforts`, `vision`, `price` and an optional `wire` for each built-in provider's current models. It uses the same fields as oh-my-pi's `pi-catalog/src/models.json` (`input` containing `image` → `vision`; `thinking.efforts` → `reasoningEfforts`; `cost` → `price`).

**User config file** (`config.json`, read through `$.fs`):

| OS | Path |
|----|------|
| macOS | `$HOME/Library/Application Support/nmg-router/config.json` |
| Linux | `${XDG_CONFIG_HOME:-$HOME/.config}/nmg-router/config.json` |
| Windows | `%APPDATA%\nmg-router\config.json` |

```json
{
  "providers": {
    "my-relay": {
      "name": "My Relay",
      "baseUrl": "https://relay.example.com/v1",
      "api": "openai-completions",
      "auth": "api-key",
      "headers": { "X-Title": "nmg-router" },
      "models": [{ "id": "glm-5.1", "name": "GLM 5.1", "contextWindow": 200000, "maxOutput": 32000, "reasoningEfforts": ["low", "high"], "vision": false, "price": { "input": 0.5, "output": 2 } }]
    }
  },
  "disabledProviders": ["xai"],
  "enabledModels": ["opencode-go/glm-*", "my-relay/*"]
}
```

**Custom providers:**
- `api` is one of `openai-completions`, `openai-responses` or `anthropic-messages`; `auth` is `api-key` (the default) or `none`.
- With `models`, the list is static and needs no network call. Without them, discovery is `GET <baseUrl>/models` in the OpenAI list format.
- An entry is rejected, with a `ConfigProblem` and nothing registered, when:
  - its id fails the id pattern or names a built-in;
  - the registry refuses it (Anthropic id or host);
  - it holds a credential.

**Credential detection:** an entry holds a credential when any of these is true:
- any key at any depth matches `/^(api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|password|credentials?)$/i`;
- a header name matches `/^(authorization|proxy-authorization|x-api-key|api-key|cookie)$/i`;
- a header value starts with `Bearer ` or `Basic `.

The problem message reads `Config entry providers.<id>.<path> looks like a credential and was ignored. Use /login to sign in to <id>.` It names the path and never the value.

**Filters:**
- `disabledProviders` hides providers from the catalog and from the `/login` picker. `/logout` still lists them.
- `enabledModels` patterns match case-insensitively against `provider/model` and the bare model. `*` matches any run of characters and `?` matches one character; a pattern without them is an exact match.
- Absent or empty `enabledModels` allows everything. Patterns that match nothing list no models.

## State and UI Behavior

**Pane controller** (`src/login/pane.ts`):
- One pane, id `nmg-router-login`, opened with `focus`, `closeOnEscape` and `holdToasts`. It is drawn by the `ui.render` hook for `{ component: "Pane", requestId: "nmg-router-login" }` from the controller's current view.
- `open(view)` resolves when the user picks, submits, or closes the pane. Escape or close resolves `cancelled`, and the command returns `{ text: "Login cancelled." }` or `{ text: "Logout cancelled." }`.

**Login picker:**
- Title `Select provider to login`. Rows are Anthropic first (label `Anthropic (Claude Code login)`, no status), then every enabled provider in `BUILTIN_PROVIDERS` order followed by custom providers.
- Status per row:
  - `✓ logged in` when the active account has a stored credential and the provider's catalog status is not `unauthenticated`;
  - `invalid` when the status is `unauthenticated`;
  - `not logged in` otherwise.
- Status needs no network call and never reads a secret: it uses the index (`list`) and the cache.
- With more than 10 rows, an `Input` (key `search`, autoFocus, placeholder `Type to search`) sits above the `Select`, and each change filters the rows with `fuzzyFilter` over `"<name> <id> <status>"`. Matching is a case-insensitive subsequence within words, ranked by match span (reference `pi-tui/src/fuzzy.ts`). "No matching providers" shows when nothing matches.

**Anthropic:** the picked value `anthropic` makes the hook `return next(e)`. No `$.store`, credential, settings or file call happens for it.

**API-key flow:**
1. A secret view with label `<Name> API key`.
2. The masked reducer keeps the real text in memory and draws `•` for each character. On each `onInput(value)`, `k` is the length of the leading run of `•` characters; the secret becomes `secret.slice(0, k) + value.slice(k)`, and the field is redrawn as bullets. This covers typing, pasting and backspacing at the end.
3. On submit, an empty key returns an error. Otherwise `validate` runs:
   - 2xx → save (replace) → set active → `catalog.refresh(id)` → `{ text: "Logged in to <Name>" }`;
   - 401/403 → `invalid_key` (`Invalid <Name> API key; nothing was saved.`);
   - any other status → `validation_failed` (`Could not validate the <Name> key (HTTP <status>); nothing was saved.`);
   - a rejected fetch → `offline`.

**OAuth flow:**
1. Build the authorize URL. `$.ui.log` it to the transcript and show it in a text view with `Open this URL, sign in, then paste the redirect URL (or code):`. Try to open the browser with argv only (`open <url>` on macOS, `xdg-open <url>` on Linux, `rundll32 url.dll,FileProtocolHandler <url>` on Windows), ignoring any failure.
2. On submit: parse → exchange → save → set active → store the label → `catalog.refresh(id)` → `{ text: "Logged in to <Name> as <email>" }`.
3. No `$.process.spawn`, server or port is used.

**Logout:**
1. Title `Select provider to logout`. Rows are Anthropic first, then every provider with at least one indexed credential, including disabled ones.
2. Anthropic → `return next(e)`.
3. One account is deleted directly. Several open an account view titled `Select <Name> account to logout`, with rows labelled from `accounts.labels` (or the account id) and the active one suffixed ` (active)` and preselected.
4. Delete → update `accounts.active` → when no account remains, the provider's cache entry is removed → `{ text: "Logged out of <Name>" }` (with ` (<label>)` for OAuth).

**Errors:** login and logout errors return `{ text: <message> }`. Config problems are shown once per `load()` with `$.ui.log`. No text includes a key, token, code, verifier or response body.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `ProviderPlugin` modules composed from login/model/wire strategies | Selected | One file adds a provider; catalog and login code depend only on interfaces |
| Data-only provider rules interpreted by a generic engine (oh-my-pi 18.12.6 `rules.json`) | Rejected | Needs a rule language and hook registry; heavier than four providers warrant |
| One credential per API-key provider, OAuth upsert per identity | Selected | Matches oh-my-pi `auth-storage.ts` |
| Mirror oh-my-pi client headers for ClinePass and Codex | Selected | User choice; most likely to be accepted by the providers |
| `$.ui.ask` for the provider picker | Rejected | Limited to 2-4 options; no status or search |
| Loopback callback server for OAuth | Rejected | The mods API cannot listen on a port |
| YAML config | Rejected | JSON needs no runtime dependency in a no-build mod |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #2 | 2026-10-25 | Initial feature design |
