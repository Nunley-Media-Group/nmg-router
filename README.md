# nmg-router

A Claude Code mod that puts models from other providers (OpenCode Go, ClinePass, ChatGPT/Codex, xAI and more) into Claude Code's `/model` picker alongside Claude, so one Claude Code toolchain drives every model.

Claude models keep using your own Claude login, sent straight to Anthropic by Claude Code itself. Other models are answered by the mod through each provider's own credentials. The mod never handles Claude credentials.

Status: early development.

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
