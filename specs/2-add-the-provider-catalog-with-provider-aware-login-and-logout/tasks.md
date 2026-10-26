# Tasks: Add the provider catalog with provider-aware /login and /logout

**Issue**: #2
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## Implementation Tasks

### T001: Provider plugin interfaces and registry

**File(s)**: `src/providers/types.ts`, `src/providers/registry.ts`, `src/models/model-id.ts`, `src/errors/errors.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `ProviderPlugin`, `ProviderIdentity`, `LoginMethod`, `ModelSource`, `WireResolver`, `CatalogModel`, `WireFormat` and `Effort` are declared as the design states, with no `$` access (FR1)
- The registry registers `ProviderPlugin` values and still rejects the `anthropic` id and Anthropic hosts; existing registry tests keep passing
- `toModelId`/`parseModelId` produce and split `provider/model`, never doubling a provider prefix (FR2)
- `LoginError` and `ConfigProblem` carry the design's codes, with messages that hold no secret or response body (FR8)

### T002: HTTP helper and OpenAI list parser

**File(s)**: `src/providers/http.ts`, `src/models/openai-models-list.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `getJson`/`postForm` map `$.http.fetch` results to ok / status / offline / malformed outcomes and never include a response body in an error
- The list parser accepts `{data|models|result|items:[…]}` or a bare array and reads `id`, `context_length`/`context_window` and `max_completion_tokens`

### T003: Built-in provider plugins and bundled metadata

**File(s)**: `src/providers/builtin/index.ts`, `src/providers/builtin/opencode-go.ts`, `src/providers/builtin/cline-pass.ts`, `src/providers/builtin/openai-codex.ts`, `src/providers/builtin/xai.ts`, `src/providers/metadata.ts`
**Type**: Create
**Depends**: T002
**Acceptance**:
- Each module exports one `ProviderPlugin` with the design's id, name, base URL, headers, login kind, model source and wire resolver; `BUILTIN_PROVIDERS` lists them in the order opencode-go, cline-pass, openai-codex, xai (AC1, FR1)
- OpenCode Go resolves wires by the design's override, metadata, prefix and default order; Codex drops hidden models and applies the default limits; ClinePass reads `clinePass` and `free` and strips the `cline-pass/` prefix
- Bundled metadata covers at least one current model for each built-in provider, with the design's fields

### T004: PKCE, JWT, accounts and OAuth/API-key login methods

**File(s)**: `src/auth/pkce.ts`, `src/auth/jwt.ts`, `src/auth/accounts.ts`, `src/auth/api-key-login.ts`, `src/auth/oauth-code-login.ts`, `src/auth/access-token.ts`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- `apiKeyLogin` validates before saving, replaces the provider's credentials with account `default`, and sets it active (AC6, FR6, FR7)
- `oauthCodeLogin` builds the authorize URL, parses each pasted form, refuses a mismatched state, exchanges the code, derives account id, email and plan from the access token, saves the tokens and expiry, and upserts the account as active (AC7, FR6, FR7)
- `resolveCredential` refreshes and saves an OAuth credential when `now + 60 s >= expires` before returning it, and keeps the old refresh token when none is returned (AC7)

### T005: User config loader

**File(s)**: `src/config/user-config.ts`, `src/providers/custom.ts`, `src/models/patterns.ts`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- Reads `config.json` from the per-OS path in the design; a missing file gives empty config, and malformed JSON gives one problem (FR4)
- Custom providers become `ProviderPlugin` values; entries with a bad id, a built-in id, an Anthropic id or host, or a credential are rejected with a message that names the path and points to `/login`, without the value (AC4, FR8)
- `enabledModels` matching and `disabledProviders` filtering follow the design (AC4)

### T006: Catalog with cache, refresh and status

**File(s)**: `src/catalog/catalog.ts`, `src/catalog/cache.ts`
**Type**: Create
**Depends**: T003, T004, T005
**Acceptance**:
- `load()` reads `catalog.cache` and the config with no `$.http` call; `refresh()` replaces the cache on `ok` and records `unauthenticated`, `unavailable`, `empty`, `offline` or `not-logged-in`, keeping the previous models marked `cached: true` (AC3, FR3)
- Discovered models get `provider/model` ids, merged metadata and a resolved wire, and every Anthropic or Claude model is dropped (AC2)
- `models()` applies `disabledProviders` and `enabledModels`; the cache never holds a credential (AC4, FR8)

### T007: Pane controller, fuzzy filter and masked input

**File(s)**: `src/login/pane.ts`, `src/login/fuzzy.ts`, `src/login/masked-input.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The pane controller opens `nmg-router-login` focused, renders select / secret / text / message views from state, and resolves on pick, submit or close (cancelled) (FR5)
- `fuzzyFilter` ranks case-insensitive subsequence matches; the search field appears only when there are more than 10 rows (AC5)
- The masked reducer keeps the secret in memory and only ever draws `•` characters (AC6, FR8)

### T008: /login and /logout commands and hook wiring

**File(s)**: `src/login/login-command.ts`, `src/login/logout-command.ts`, `hooks/register.ts`
**Type**: Create
**Depends**: T006, T007
**Acceptance**:
- `/login` lists Anthropic plus enabled providers with status; Anthropic returns `next(e)` with no store, credential, settings or file call; API-key and OAuth flows return the design's success and error texts (AC5, AC6, AC7, FR5)
- `/logout` lists Anthropic plus providers with credentials, marks the active account `(active)`, deletes only the chosen credential, promotes the remaining account, and Anthropic returns `next(e)` (AC8, FR5, FR7)
- `hooks/register.ts` only builds the services and wires `command.run` (`login`, `logout`), `ui.render` and `ui.close` to `src/`

### T009: Fake engine extensions and fixtures

**File(s)**: `tests/support/fake-engine.ts`, `tests/support/jwt.ts`, `tests/fixtures/opencode-go-models.json`, `tests/fixtures/cline-pass-recommended-models.json`, `tests/fixtures/codex-models.json`, `tests/fixtures/xai-models.json`
**Type**: Create
**Depends**: none
**Acceptance**:
- `fakeEngine` takes a scripted `http` responder (by URL and method, returning a response or throwing), records each request's method, headers and body, and records `ui.open`/`ui.close`
- `tests/support/jwt.ts` builds unsigned test JWTs at run time; fixtures hold no token-, key- or account-id-shaped values, so `tests/hygiene/fixtures.test.ts` passes

### T010: Provider, discovery and catalog tests

**File(s)**: `tests/providers/builtin.test.ts`, `tests/catalog/discovery.test.ts`, `tests/catalog/catalog.test.ts`
**Type**: Create
**Depends**: T006, T009
**Acceptance**:
- AC1: with no config, the catalog's providers are opencode-go, cline-pass, openai-codex and xai, each with a base URL, login kind and wire resolver, and no Anthropic id or host
- AC2: a stored `opencode-go` key and the fixture list yield `opencode-go/glm-5.1`, `/kimi-k3` (`openai-completions`), `/gpt-5.5` (`openai-responses`) and `/minimax-m2.5` (`anthropic-messages`), with metadata where supplied, and no `claude-haiku-5-5`
- AC3: `load()` makes zero `$.http` calls; `refresh()` replaces the cache; responders returning 401, 404, `[]` and a thrown error give `unauthenticated`, `unavailable`, `empty` and `offline`, with the prior models kept and `cached: true`

### T011: Config tests

**File(s)**: `tests/config/user-config.test.ts`, `tests/models/patterns.test.ts`
**Type**: Create
**Depends**: T005, T006, T009
**Acceptance**:
- AC4: a config with a custom OpenAI-compatible provider (non-secret headers and models), `disabledProviders: ["xai"]` and `enabledModels` lists the custom provider, hides xAI and lists only the matching models; an entry with a sentinel `apiKey` or `Authorization` header is rejected with a message naming the path and `/login`, and the sentinel is not in the message, `$.ui` or `$.store`
- Per-OS config paths and glob, exact and empty-pattern matching are covered

### T012: Login and logout tests

**File(s)**: `tests/login/login-command.test.ts`, `tests/login/oauth-code-login.test.ts`, `tests/login/logout-command.test.ts`, `tests/login/fuzzy.test.ts`, `tests/login/masked-input.test.ts`
**Type**: Create
**Depends**: T008, T009
**Acceptance**:
- AC5: the picker title and rows (Anthropic plus enabled providers, with status) are asserted; search appears with 11 rows and not with 10; picking Anthropic returns the `next(e)` result, with zero store, keyring, settings and fs calls
- AC6: a 200 validation saves the key as `opencode-go/default`, returns "Logged in to OpenCode Go" and refreshes OpenCode Go; a 401 saves nothing and returns the invalid-key error; the masked field only ever draws `•`
- AC7: a pasted redirect URL exchanges the code and saves tokens and expiry under the account id, the result names the email, and `$.process.spawn` is never called; a mismatched state saves nothing; an expired credential is refreshed and saved before discovery uses it
- AC8: two Codex accounts list with the active one marked `(active)`; deleting one removes only that keyring entry and makes the other active; the logout picker lists only providers with credentials; Anthropic returns the `next(e)` result

### T013: Credential leak tests

**File(s)**: `tests/hygiene/login-sentinel.test.ts`
**Type**: Create
**Depends**: T012
**Acceptance**:
- FR8: a sentinel API key, access token, refresh token and authorization code driven through login, refresh, discovery, logout and every error path pass `assertNoSentinel`, and are absent from `catalog.cache`, `accounts.*` and the config problem messages

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #2 | 2026-10-25 | Initial feature tasks |
