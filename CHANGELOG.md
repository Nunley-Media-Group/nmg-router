# Changelog

## [Unreleased]

## [0.10.2] - 2026-10-27

### Fixed

- Fix ClinePass HTTP 400 on paid models and arrow-key navigation in the /model hub (#31)

## [0.10.1] - 2026-10-27

### Fixed

- Bound the routed in-place summary and clear the routed status line on Claude steps (#26)

## [0.10.0] - 2026-10-27

### Changed

- Document install and usage and package the marketplace (#6)

## [0.9.0] - 2026-10-27

### Changed

- Replace /model with an oh-my-pi-style model hub (#5)

## [0.8.0] - 2026-10-26

### Changed

- Keep routed sessions working with routed compaction, subagents and auto-mode permissions (#4)

## [0.7.0] - 2026-10-26

### Changed

- Keep routed sessions working with routed compaction, subagents and auto-mode permissions (#4)

## [0.6.0] - 2026-10-26

### Changed

- Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors (#3)

## [0.5.0] - 2026-10-26

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
