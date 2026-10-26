# Requirements: Add the provider catalog with provider-aware /login and /logout

**Issue**: #2
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/1-lay-the-mod-foundation-with-the-anthropic-guard-and-os-keyring-credentials/

## User Story

**As a** developer with OpenCode Go, ClinePass, ChatGPT/Codex and xAI plans
**I want** to sign in to each provider from Claude Code's `/login` and have the mod discover the models those logins can use
**So that** every provider's models are known, with their capabilities, without any other tool

## Background

Provider handling aims for parity with oh-my-pi, minus model roles. oh-my-pi's sources are the reference for each part, and none of its code is copied.

- **Providers:** each provider has a base URL, a wire format, a login kind (API key or OAuth) and a model-list endpoint. OpenCode Go serves GLM, Kimi and DeepSeek over OpenAI Chat Completions, GPT and Grok over OpenAI Responses, and MiniMax and Qwen over Anthropic Messages, so the wire format can differ from model to model.
- **Pluggable providers:** each provider is one self-contained module behind a small set of interfaces: identity, login method, model source and wire resolver. Adding a built-in provider means adding one module and one registry entry. A custom provider from the user config is adapted into the same interface.
- **Models:** each model has an id, a context window, a max output, supported reasoning efforts, vision support and a price.
- **Login selector** (oh-my-pi's): it is titled "Select provider to login" or "Select provider to logout". Fuzzy search turns on when there are more than 10 rows, and each row shows a status ("✓ logged in", "invalid", "not logged in").
  - API-key providers take a key in a masked field and validate it before saving.
  - OAuth providers show the login URL and accept the pasted redirect URL or code. The mods API cannot listen on a port, so OAuth finishes by paste.
- **Accounts:** an API-key provider holds one account, `default`, and a new key replaces it. An OAuth provider holds one account per identity. The latest login becomes the provider's active account.
- **Anthropic:** choosing Anthropic runs Claude Code's built-in login or logout unchanged.

The #1 foundation exists: the Anthropic guard (`src/gateway/`), the provider registry (`src/providers/registry.ts`) and the credential store (`src/credentials/store.ts`). There are no provider definitions, no model discovery and no command hooks yet.

## Acceptance Criteria

### AC1: Built-in providers

**Given** no user configuration
**When** providers are listed
**Then** `opencode-go` (OpenCode Go), `cline-pass` (ClinePass), `openai-codex` (OpenAI Codex, ChatGPT plan) and `xai` (xAI) are present, each with a base URL, a login kind and a per-model wire format, and none is Anthropic

### AC2: Model discovery

**Given** a stored credential for `opencode-go` and a faked model-list response listing `glm-5.1`, `kimi-k3`, `gpt-5.5`, `minimax-m2.5` and `claude-haiku-5-5`
**When** discovery runs
**Then** each model appears as `opencode-go/<model>` with its wire format (`openai-completions`, `openai-completions`, `openai-responses`, `anthropic-messages`), and with its context window, max output, reasoning efforts, vision flag and price wherever the provider response or bundled metadata supplies them; `opencode-go/claude-haiku-5-5` is dropped

### AC3: Cache, refresh and failure states

**Given** a cached model list, and providers whose model list returns 401, 404, an empty list or a network error
**When** the catalog loads and a refresh runs
**Then** the load uses the cache and makes no network call, the refresh replaces the cache, and each failing provider records `unauthenticated`, `unavailable`, `empty` or `offline` while its cached models are kept and marked as cached

### AC4: Custom providers and filters

**Given** a user config file that defines a custom OpenAI-compatible provider with non-secret headers and models, sets `disabledProviders: ["xai"]`, and sets `enabledModels` patterns
**When** the catalog loads
**Then** the custom provider appears, xAI is hidden, only the matching models are listed, and a config entry holding an API key or token is rejected with a message that names the entry, points to `/login`, and does not echo the value

### AC5: Login picker and Anthropic

**Given** the catalog
**When** the user runs `/login`
**Then** a picker titled "Select provider to login" lists Anthropic and every enabled routed provider with its login status, and offers fuzzy search when there are more than 10 rows; choosing Anthropic calls `next(e)` so Claude Code's built-in login runs unchanged, and the mod reads, stores and forwards nothing for it

### AC6: API-key login

**Given** the user chooses OpenCode Go
**When** they enter a key in the masked input
**Then**:
- the key is validated against the provider's model list and saved to the credential vault as the provider's `default` account only if valid;
- an invalid key saves nothing and shows an error;
- success shows "Logged in to OpenCode Go" and refreshes that provider's models.

### AC7: OAuth login and refresh

**Given** the user chooses OpenAI Codex
**When** the mod shows the login URL and the user pastes the redirect URL or code
**Then** the tokens and their expiry are saved to the credential vault under the account's id, and the account's email is shown, without opening a listening port; a pasted URL whose state does not match is refused, and an expired token is refreshed and saved before the next request that needs it

### AC8: Accounts and logout

**Given** two stored OpenAI Codex accounts
**When** the user runs `/logout`
**Then**:
- the picker lists Anthropic and only the providers with stored credentials;
- the account picker marks the active account `(active)`;
- the chosen credential is deleted from the credential vault, and the remaining account becomes active;
- choosing Anthropic runs Claude Code's built-in logout through `next(e)`.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Built-in provider plugins for OpenCode Go, ClinePass, OpenAI Codex and xAI, with per-model wire format, each in its own module behind the `ProviderPlugin` interface | Must |
| FR2 | Model ids use `provider/model` | Must |
| FR3 | Per-provider model discovery with capability metadata, cache, refresh and status | Must |
| FR4 | A user config file for custom providers, `disabledProviders` and `enabledModels`, which never holds a credential | Must |
| FR5 | `command.run` hooks for `login` and `logout` with a provider picker; Anthropic always goes through `next(e)` | Must |
| FR6 | An API-key flow with masked input and validation; an OAuth flow by pasted redirect URL or code, with refresh | Must |
| FR7 | One API-key account per provider, which a new key replaces; one OAuth account per identity; an active-account marker | Must |
| FR8 | No credential in UI text, logs, `$.store`, settings or config | Must |

## Out of Scope

- Local model servers
- Device-code OAuth
- Automatic account rotation on rate limits
- Model roles
- Answering routed turns over each wire format
- The `/model` picker rows

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #2 | 2026-10-25 | Initial feature spec |
