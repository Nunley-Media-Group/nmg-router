# Design: Document install and usage and package the marketplace

**Issue**: #6
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## Overview

The README is rewritten around the user's path: requirements, install, login, model choice, thinking, permissions, configuration, limits and the credential boundary. The existing Credential security and Contributing sections are kept. A new test, `tests/docs/readme-sections.test.ts`, checks the headings and each section's key terms. `claude plugin validate .` (registered validation `repository.plugin-manifest`) keeps covering the plugin manifest.

The plugin is listed in the `nmg-plugins` marketplace, and its code stays in this repository, as nmg-sdlc does. This repository has no marketplace file of its own. Install takes two commands, which the README shows:

```text
/plugin marketplace add Nunley-Media-Group/nmg-plugins
/plugin install nmg-router@nmg-plugins
```

## README

Level-2 headings, in order, and the facts each section carries:

| Heading | Content |
|---------|---------|
| (intro, no heading) | Existing one-paragraph summary and the Claude login paragraph; the "Status: early development." line is kept |
| `## Requirements` | Claude Code 2.1.310 or later; a supported OS keyring: macOS Keychain, Windows Credential Manager, Linux Secret Service through `secret-tool` (libsecret); nothing else to install: no proxy, service, port or separate app. A system `curl` gives streaming; without it, replies arrive whole. |
| `## Installation` | The two `/plugin` commands above; update with `/plugin marketplace update nmg-plugins`; uninstall with `/plugin uninstall nmg-router@nmg-plugins`; try a local checkout with `claude --plugin-dir .` |
| `## Logging in to providers` | `/login` opens "Select provider to login" with Anthropic and every enabled provider and its login status. Anthropic runs Claude Code's own login unchanged. API-key providers (OpenCode Go, ClinePass, xAI) take a masked key that is checked before saving; OpenAI Codex (ChatGPT plan) uses OAuth by pasting the redirect URL or code. `/logout` lists Anthropic and providers with stored credentials and marks the `(active)` account. |
| `## Choosing a model` | `/model` with no arguments opens the hub: "All models", Claude, then providers with counts; providers without a login are dimmed and offer "Log in to …". Type to search; Enter selects; Esc clears the search, then closes. Routed ids are `provider/model`, such as `opencode-go/kimi-k3.1-pro`. `/model <id>` switches directly. Switching keeps the conversation. Routed models also appear in Claude Code's picker through `modelPicker` rows the mod keeps in user settings. |
| `## Thinking levels` | Use Claude Code's effort level as for Claude. The mod sends each provider's own reasoning field, clamped to the levels the routed model supports (for example `max` becomes `medium` on a model with only `low` and `medium`); non-reasoning models get none. The status line shows the routed model and the effective level. |
| `## Auto-mode permissions` | The `/config` row "Routed auto-mode permissions" (`routedAutoPermissions`): `claude-classifier` asks a Claude model for allow, ask or deny on routed calls that no rule settles; `server-classifier-off` answers ask so Claude Code's own dialog decides. Unset, it is `claude-classifier` with a Claude login and `server-classifier-off` without. Rules and Claude-model calls are unchanged. |
| `## Custom providers and filters` | `config.json` paths per OS (macOS `~/Library/Application Support/nmg-router/config.json`, Linux `${XDG_CONFIG_HOME:-~/.config}/nmg-router/config.json`, Windows `%APPDATA%\nmg-router\config.json`); the example from spec #2 with a custom provider, `disabledProviders` and `enabledModels`; `api` values `openai-completions`, `openai-responses`, `anthropic-messages`; the file never holds a key — an entry with a key or token is rejected and `/login` stores keys. |
| `## Known limits` | Routed models are weaker than Claude at Claude Code's tool use; background work such as session titles still uses Claude; MCP tools are sent only when the mods API exposes their schema; the mods API is new and may change between Claude Code releases; using the ChatGPT plan through the Codex login carries a small OpenAI-side account risk; a failed routed request shows an error and never falls back to another provider or to Claude. |
| `## Credential boundary` | Claude credentials stay with Claude Code: Claude models go straight to Anthropic on the user's own login, and the mod never reads, stores or forwards them. Provider credentials stay in the OS keyring (or the encrypted vault where no keyring exists, see Credential security), never in settings, logs, `config.json` or the mod's store. |
| `## Credential security` | Existing section, unchanged |
| `## Contributing` | Existing section, unchanged |

The README names the dependency only as "oh-my-pi" where it names it at all.

## Tests

`tests/docs/readme-sections.test.ts` (AC1, AC2):
- collects lines matching `^## ` and expects them to equal the eleven headings in order;
- a `section(heading)` helper slices from the heading to the next `\n## `, as `readme-security.test.ts` does;
- `it.each` rows assert each section contains its terms from AC1 and AC2 (for example Installation contains `/plugin marketplace add Nunley-Media-Group/nmg-plugins` and `/plugin install nmg-router@nmg-plugins`).

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Install from the `nmg-plugins` marketplace | Selected | The plugin is distributed like nmg-sdlc: listed in nmg-plugins, code in its own repository |
| A `.claude-plugin/marketplace.json` in this repository | Rejected | A second marketplace would split the install path from the other Nunley-Media-Group plugins |
| Merge the credential boundary into Credential security | Rejected | The issue asks for a boundary section; the existing section's test slices it as its own level-2 section |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #6 | 2026-10-25 | Initial feature design |
