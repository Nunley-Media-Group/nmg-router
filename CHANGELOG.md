# Changelog

## [Unreleased]

### Fixed

- Encrypt the credential vault with a vendored AES-256-GCM, because the hooks environment's crypto.subtle offers digest only (#2)

## [0.4.0] - 2026-10-26

### Changed

- Add the provider catalog with provider-aware /login and /logout (#2)

## [0.3.0] - 2026-10-26

### Changed

- Add the provider catalog with provider-aware /login and /logout (#2)
- Store provider credentials in the encrypted vault on every OS (#19)

## [0.2.0] - 2026-10-26

### Changed

- Lay the mod foundation with the Anthropic guard and OS keyring credentials (#1)
