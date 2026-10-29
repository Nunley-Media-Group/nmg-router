# nmg-router

A Claude Code mod that puts models from other providers (OpenCode Go, ClinePass, ChatGPT/Codex, xAI and more) into Claude Code's `/model` picker alongside Claude, so one Claude Code toolchain drives every model.

Claude models keep using your own Claude login, sent straight to Anthropic by Claude Code itself. Other models are answered by the mod through each provider's own credentials. The mod never handles Claude credentials.

Status: early development.

## Requirements

- Claude Code 2.1.310 or later.
- Nothing else needs installing: there is no proxy, service, port or separate app to run.
- A system `curl` gives streaming replies. Without it, replies arrive whole.

## Installation

In Claude Code, run these two commands:

```text
/plugin marketplace add Nunley-Media-Group/nmg-plugins
/plugin install nmg-router@nmg-plugins
```

Update with `/plugin marketplace update nmg-plugins`, and uninstall with `/plugin uninstall nmg-router@nmg-plugins`.

To try a local checkout of this repository instead, run `claude --plugin-dir .` from its root.

## Logging in to providers

Run `/login` to open "Select provider to login". It lists Anthropic and every enabled provider, with each one's login status.

- Choosing Anthropic runs Claude Code's own login, unchanged.
- OpenCode Go, ClinePass and xAI take an API key. The key is masked as you type and checked before it is saved.
- OpenAI Codex (ChatGPT plan) signs in with OAuth. Paste the redirect URL or the code it gives you.

Run `/logout` to remove a login. It lists Anthropic and each provider with stored credentials, and marks the `(active)` account.

## Choosing a model

Run `/model` with no arguments to open the model hub. It lists "All models", then Claude, then each provider with its model count. A provider that needs a login is listed only after you log in to it, with `/login`.

- Type to search. Enter selects the highlighted model. Esc clears the search, and a second Esc closes the hub.
- A routed model id is `provider/model`, such as `opencode-go/kimi-k3.1-pro`. `/model <id>` switches straight to one.
- Switching models keeps the conversation.

Routed models also appear in Claude Code's own picker. The mod keeps a `modelPicker` row for each one in your user settings, because Claude Code lists only model ids containing "claude" on its own.

## Thinking levels

Set the effort level with Claude Code's effort setting, as you would for Claude. The mod sends each provider's own reasoning field, and the level is clamped to what the routed model supports: `max` becomes `medium` on a model that supports only `low` and `medium`. A model with no reasoning levels gets none.

The status line shows the routed model and the effective level.

### Status-line snapshot

Claude Code's status-line input carries rate limits only for Claude, so a custom `statusLine` command cannot see a routed model's plan usage from it. The mod also writes the selected routed model's usage windows to a file for that command to read.

- macOS and Linux: `<config dir>/nmg-router/status/<session id>.json`. Windows: `<config dir>\nmg-router\status\<session id>.json`.
- The config dir is `CLAUDE_CONFIG_DIR` when it is set, else `~/.claude` (`%USERPROFILE%\.claude` on Windows).
- The file is JSON with `version` (1), `sessionId`, `provider`, `model` and `windows`. Each window has a `label`, a `usedPercent` and, when the provider reports it, `resetsAt` in epoch milliseconds. It holds no token, key or account.
- Read it only when its `sessionId` and `model` match the status-line input's `session_id` and `model.id`.
- A failed routed step leaves `windows` empty. A Claude model's step clears the file to `version`, `sessionId` and an empty `windows`, with no provider or model. A subagent's step leaves the file as it is.

## Auto-mode permissions

The `/config` row "Routed auto-mode permissions" (`routedAutoPermissions`) decides how auto mode handles tool calls from routed models.

- `claude-classifier` asks a Claude model to answer allow, ask or deny for each routed call that no rule settles.
- `server-classifier-off` answers ask, so Claude Code's own permission dialog decides.

Unset, the row is `claude-classifier` when you have a Claude login and `server-classifier-off` when you do not. Rules and calls to Claude models are unchanged.

## Custom providers and filters

The mod reads `config.json` from the folder for your OS:

- macOS: `~/Library/Application Support/nmg-router/config.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/nmg-router/config.json`
- Windows: `%APPDATA%\nmg-router\config.json`

This example adds a custom provider, hides the xAI provider with `disabledProviders`, and limits the models shown with `enabledModels`:

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

- `api` is `openai-completions`, `openai-responses` or `anthropic-messages`. `auth` is `api-key` (the default) or `none`.
- `enabledModels` patterns match `provider/model` or the bare model id, ignoring case. `*` matches any run of characters and `?` matches one. Leave it out to allow every model.
- The file never holds a key. An entry that holds a key, a token, a password or an authorization header is rejected, and nothing from it is registered. Run `/login` to store a key.

## Known limits

- Routed models are weaker than Claude at Claude Code's tool use.
- Background work such as session titles still uses Claude.
- MCP tools are sent only when the mods API exposes their schema.
- The mods API is new and may change between Claude Code releases.
- Using the ChatGPT plan through the Codex login carries a small OpenAI-side account risk.
- A failed routed request shows an error. It never falls back to another provider or to Claude.

## Credential boundary

Claude credentials stay with Claude Code: Claude models go straight to Anthropic on your own login, and the mod never reads, stores or forwards that login.

Provider credentials stay in the encrypted vault (see Credential security). They never reach Claude Code's settings, logs, `config.json` or the mod's own store.

## Credential security

Provider credentials are kept in the encrypted vault on every OS. They never go into Claude Code's settings, logs, fixtures or the mod's own store. Anthropic and Claude credentials are never stored, and the mod never reads them.

The vault stores each credential as AES-256-GCM ciphertext in `vault.json`. It is decrypted with a random 256-bit key in `vault.key`, which sits beside it. The key file is protected only by file permissions, so the vault is exactly as safe as the permissions on its directory and the security of your user account.

The vault directory for each OS:

- macOS: `~/Library/Application Support/nmg-router`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/nmg-router`
- Windows: `%LOCALAPPDATA%\nmg-router`

To keep the vault secure:

1. Keep the vault directory owner-only (mode 700 on macOS and Linux). Do not loosen its permissions.
2. Exclude `vault.key` from backups and sync, such as Time Machine exclusions, iCloud Drive, Dropbox or OneDrive. A copy of `vault.key` together with `vault.json` lets anyone decrypt the credentials.
3. Turn on full-disk encryption (FileVault, BitLocker or LUKS) so the files are unreadable while the machine is off.
4. To remove every credential, delete the vault directory.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue, spec and verification workflow.
