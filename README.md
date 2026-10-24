# nmg-router

A Claude Code mod that puts models from other providers (OpenCode Go, ClinePass, ChatGPT/Codex, xAI and more) into Claude Code's `/model` picker alongside Claude, so one Claude Code toolchain drives every model.

Claude models keep using your own Claude login, sent straight to Anthropic by Claude Code itself. Other models are answered by the mod through each provider's own credentials. The mod never handles Claude credentials.

Status: early development.

## Credential security

Provider credentials are kept in your operating system's keyring, never in plain text, and never in the mod's settings, logs or fixtures.

- **macOS**: the login Keychain, through the `security` tool.
- **Windows**: Credential Manager, through `powershell.exe`.
- **Linux**: the Secret Service, through `secret-tool` (libsecret), which needs a running keyring such as GNOME Keyring or KeePassXC.

The encrypted vault is used only when no supported keyring is found. It is two files in the vault directory: `vault.json` holds the credentials as AES-256-GCM ciphertext, and `vault.key` holds the random key that decrypts them. The key file protects the vault only as far as file permissions do, so anyone who can read both files can read the credentials.

The vault directory is:

- macOS: `~/Library/Application Support/nmg-router`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/nmg-router`
- Windows: `%LOCALAPPDATA%\nmg-router`

To keep the vault safe:

1. Keep the vault directory owner-only (mode 0700). The mod sets this on Linux and macOS; do not loosen it.
2. Exclude `vault.key` from backups and sync, such as Time Machine, iCloud Drive or Dropbox. A backup of `vault.json` without the key is unreadable; a backup of both files exposes the credentials.
3. Use full-disk encryption (FileVault, BitLocker or LUKS) so a stolen disk does not expose the files.
4. On Linux, install a Secret Service keyring (`secret-tool` from libsecret, with GNOME Keyring or KeePassXC) so the vault is not used at all.
5. To remove the credentials in the vault, delete the vault directory. Credentials held by the OS keyring are removed with the keyring's own tools.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue, spec and verification workflow.
