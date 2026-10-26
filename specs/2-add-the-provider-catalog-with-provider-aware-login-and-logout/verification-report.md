# Verification Report: Add the provider catalog with provider-aware /login and /logout

**Date**: 2026-10-26
**Issue**: #2
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec (re-verification after vault fix bf8ee5e and release commit 0f56790, with the supervisor's live sign-in evidence and the user's decision on AC8)
**Verification head**: 0f5679061b38b9dde31022e4bbe567fc4b35e003

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.0 |

### Implementation Status: Pass
**Total Issues**: 2 (0 critical, 0 high, 0 medium, 2 low)

All three registered validations pass at the verification head, with 241 unit tests in 26 files. No code defect was found in this run.

- **The vault fix works live.** bf8ee5e replaced the vault's crypto.subtle calls with a vendored AES-256-GCM (@noble/ciphers 2.4.0, MIT, unmodified). The previous code failed with `vault_failed` after a valid key. Since the fix, the user has saved a real OpenCode Go key. `/login` now shows `OpenCode Go — ✓ logged in`. The mod's store holds only `credentials.index: [{provider: "opencode-go", account: "default"}]` and `accounts.active: {opencode-go: "default"}`, and no secret.
- **AC2 is now shown live.** The login refreshed the catalog. `catalog.cache` holds 37 `opencode-go/<model>` entries with status `ok`. Their wire formats are 27 `openai-completions`, 4 `openai-responses` and 6 `anthropic-messages` (the MiniMax and Qwen models). No Claude or Anthropic model is listed. Bundled metadata adds the context window, max output, reasoning efforts, vision flag and price where it has them. For example, `glm-5.1` has 202752 / 32768, efforts minimal to xhigh, and a price.
- **AC6, AC7 and AC8 success paths are shown live.** The nmg-sdlc supervisor and the user ran them today in a live herdr session (`claude --plugin-dir .` on this branch, with the vault fix loaded). The user typed or authorized every credential, and no credential, code or token is recorded here. This run rechecked the resulting state live and on disk, and it matches.

**User decision (recorded as the user's):** the two-account part of AC8 (the `(active)` marker, and removing one account leaves the other active) is accepted on unit-test evidence, because the user has no second ChatGPT account.

AC3's failure states (401, 404, empty, offline) are specified against faked responses in AC3's own Given, so the unit tests are their oracle, as the supervisor's guidance notes. AC3's cache paths are shown live.

The registered gate is complete and green. Every acceptance criterion has interactive evidence, and the parts on unit evidence are either the user's explicit decision (AC8's two-account part) or defined by the spec against faked responses (AC3's failure states). The status is **Pass**.

---

## Issue Scope

- Active issue: #2
- Spec: `specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC8]; FR [FR1–FR8]; tasks [T001–T013]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":2,"specPath":"specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs` ran at the verification head on a clean tree (controller run id `3dae437e-cbc6-429b-b393-702530618736`). `.nmg-sdlc/verification/2.json` reports `ceiling: null` and coverage `declared: 3, recorded: 3, complete: true`.

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| repository.typecheck | builtin.command (`npm run typecheck`) | yes | passed |
| repository.tests | builtin.command (`npm test`) | yes | passed (26 files, 241 tests) |
| repository.plugin-manifest | builtin.command (`claude plugin validate .`) | yes | passed (advisory warnings only: no author, no icon, CLAUDE.md at the plugin root, no install line in the README) |

The steering manifest declares no smoke validation. The registered gate puts no ceiling on the status. The `project.verification` interactive rule is met: every AC has interactive evidence, AC3's failure states rest on unit evidence as their Given specifies, and the user accepted AC8's two-account part on unit evidence.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Built-in providers | Pass | `src/providers/builtin/index.ts`; `tests/providers/builtin.test.ts`. Live, with no user config: the picker lists OpenCode Go, ClinePass, OpenAI Codex and xAI, and none is Anthropic |
| AC2 | Model discovery | Pass | `src/catalog/catalog.ts`, `src/providers/builtin/opencode-go.ts`; `tests/catalog/discovery.test.ts` (the faked list, including dropping `claude-haiku-5-5`). Live: after the user's OpenCode Go login, `catalog.cache` held 37 `opencode-go/*` models with per-model wire formats (27 completions, 4 responses, 6 anthropic-messages for MiniMax and Qwen), 0 Claude models, and bundled metadata on the models it covers |
| AC3 | Cache, refresh and failure states | Pass (failure states on unit evidence, per AC3's faked-response Given) | `src/catalog/catalog.ts`; `tests/catalog/catalog.test.ts`. Live: the login's refresh wrote the cache (`fetchedAt` 2026-10-26T17:09:19Z). This run's `/login` and `/logout` both ran `load()`, and `fetchedAt` did not change, so the load used the cache. The 401, 404, empty and network-error states need a refresh after a successful login against a failing provider, and no credential-free path reaches them. The spec's Given defines them against faked responses, so `tests/catalog/catalog.test.ts` is their oracle |
| AC4 | Custom providers and filters | Pass | `src/config/user-config.ts`, `src/providers/custom.ts`; `tests/config/user-config.test.ts`. Live in the previous run at 1d37f72, which had no config code change since: the custom provider was listed, xAI hidden, and `Config entry providers.leaky.apiKey looks like a credential and was ignored. Use /login to sign in to leaky.` was shown without the value |
| AC5 | Login picker and Anthropic | Pass | Live this run: `Select provider to login`, with `Anthropic (Claude Code login)`, `OpenCode Go — ✓ logged in`, and ClinePass, OpenAI Codex and xAI each `not logged in`. Live in the previous run: fuzzy search at 11 rows, and the Anthropic row opened Claude Code's own "Select login method" dialog |
| AC6 | API-key login | Pass | Unit: `tests/login/login-command.test.ts`, `tests/login/pane.test.ts`, `tests/credentials/vault.test.ts`, plus `host-tests/vault.test.ts` for the hooks environment. Live: masked input and the invalid-key refusal in the previous run. Success: the user's real key is now saved in the vault as `opencode-go/default` (vault.json written after bf8ee5e), it is the active account, the status reads `✓ logged in`, and the models were refreshed. Supervisor session with the user: only bullets were drawn, `Logged in to OpenCode Go` was shown, and `vault.json` was created with mode 600, holding only `opencode-go/default` and no plaintext. Rechecked here: mode `-rw-------`, entries `[opencode-go/default]`, `OpenCode Go — ✓ logged in` |
| AC7 | OAuth login and refresh | Pass | Unit: `tests/login/oauth-code-login.test.ts` (including expired-token refresh). Live in the previous run: the authorize URL (PKCE S256 with a state), and refusal of a wrong-state paste with nothing saved. Supervisor session with the user: after a browser sign-in, the pasted `localhost:1455` redirect with a matching state gave `Logged in to OpenAI Codex as <email>`. `/login` then showed `OpenAI Codex — ✓ logged in`, and the vault held an `openai-codex` entry with no plaintext code or token. A second sign-in with the same identity updated that entry and created no duplicate. No port was opened: the mod received the redirect by paste |
| AC8 | Accounts and logout | Pass (the two-account part on unit evidence, by the user's decision) | Unit: `tests/login/logout-command.test.ts`. Live this run: `Select provider to logout` listed `Anthropic (Claude Code login)` and `OpenCode Go`, the only provider with a stored credential, and Esc gave `Logout cancelled.` The OpenCode Go row was not picked, because a single account is deleted without a second prompt and that would remove the user's key. Supervisor session with the user: `/logout` listed only Anthropic, OpenCode Go and OpenAI Codex. Picking OpenAI Codex, which had one account, logged it out at once (`Logged out of OpenAI Codex (<email> (pro))`). The vault entry was removed, and `/logout` then listed only Anthropic and OpenCode Go. Rechecked here: the vault holds no `openai-codex` entry, the store has no Codex index, label or cache, and `/logout` lists Anthropic and OpenCode Go. The `(active)` marker and the handover to the remaining account are covered by `tests/login/logout-command.test.ts`, which the user accepted because they have no second ChatGPT account |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001–T006 | Interfaces, HTTP, providers, auth, config, catalog | Complete | The vault now seals entries with vendored AES-256-GCM, byte-compatible with the WebCrypto format |
| T007 | Pane controller, fuzzy filter and masked input | Complete | |
| T008 | /login and /logout commands and hook wiring | Complete | |
| T009–T013 | Fakes, fixtures and tests | Complete | Added `host-tests/vault.test.ts` (runs under `claude plugin test .`) and extended `tests/credentials/vault.test.ts` |

Also delivered: the release bump to 0.5.0 in `VERSION`, `package.json` and `.claude-plugin/plugin.json`, with a `CHANGELOG.md` entry.

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `command-flow.ts` owns the flow lifecycle and `pane.ts` the view. `hooks/register.ts` only wires |
| Open/Closed | 5 | Adding a provider takes one module plus one registry entry |
| Liskov Substitution | 4 | Custom and built-in plugins are interchangeable |
| Interface Segregation | 4 | `FlowHost`, `PaneHost` and `HostPort` are narrow |
| Dependency Inversion | 4 | Nothing under `src/` uses `$` directly |

### Layer Separation and Dependency Flow

The vault change is contained: `seal` and `open` became synchronous wrappers around `gcm(key, iv, aad)`, with the same AAD (`nmg-router:<id>`), 12-byte IV and 128-bit tag after the ciphertext. Vendored code sits under `src/vendor/noble-ciphers/` with its licence, unmodified.

---

## Security Assessment

- [x] Provider keys live only in the encrypted vault. The mod's store holds the account index, the active account and the model cache, and no secret (checked against the live store file)
- [x] AES-256-GCM comes from a widely used audited library, vendored unmodified at a pinned version. Fresh random IV per entry
- [x] Masked input, OAuth PKCE and state check, and refusal of credentials in the config (confirmed live in earlier runs; no code change since)
- [x] Anthropic login and logout go through `next(e)`
- Low (L1, carried over): the OAuth authorize URL is also written to the transcript. It holds no secret

---

## Performance Assessment

- [x] `load()` reads the cache and does not refetch (`fetchedAt` unchanged across this run's `/login` and `/logout`)
- [x] Refresh runs only for the provider that was just logged in

---

## Error Handling Assessment

- Esc in either picker ends with `Login cancelled.` or `Logout cancelled.` and changes nothing (live).
- Low (L3, carried over): the warning for a refused config entry is logged again on every `/login` and `/logout`.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1, AC2, AC4, AC5, AC6, AC7 | Yes | Yes (Vitest) | Unit yes / live yes |
| AC3 | Yes | Yes (Vitest) | Unit yes / live: the cache paths (failure states on unit evidence) |
| AC8 | Yes | Yes (Vitest) | Unit yes / live: single-account logout (two-account part on unit evidence, by the user's decision) |

- Unit tests: 241 in 26 files, all passing.

---

## Interactive Verification (herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-2 --no-focus`, then `herdr agent start verify-2 --kind claude --pane <pane> -- --plugin-dir .`. Keys were sent with `herdr pane send-text` and `send-keys`, and the screen was read with `herdr agent read --source recent-unwrapped`. The tab was closed afterwards |
| **Startup** | Claude Code v2.1.310. No folder-trust dialog, and no hook or plugin load errors |
| **Setup** | No user config file. The user's own OpenCode Go login was already stored. No credential was typed |

| # | Prompt / keys | Observed outcome | Excerpt |
|---|---------------|------------------|---------|
| 1 | `/login` | All four built-ins shown with status, OpenCode Go logged in | `Select provider to login` / `Anthropic (Claude Code login)` / `OpenCode Go — ✓ logged in` / `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` |
| 2 | Esc | Cancelled, nothing changed | `nmg-router: Login cancelled.` |
| 3 | `/logout` | Only Anthropic and the provider with a credential are listed | `Select provider to logout` / `Anthropic (Claude Code login)` / `OpenCode Go` |
| 4 | Esc | Cancelled, nothing deleted | `nmg-router: Logout cancelled.` |

The store file `~/.claude/plugins/store/nmg-router_inline-*.json` was read for key names and model metadata only: keys `credentials.index`, `accounts.active` and `catalog.cache`, and no secret. The vault file was not read.

A second session after the supervisor's evidence repeated `/login` and `/logout` and showed the same state: `OpenCode Go — ✓ logged in`, `OpenAI Codex — not logged in`, `/logout` listing Anthropic and OpenCode Go, then `Login cancelled.` and `Logout cancelled.` with no load errors. Anthropic logout was not driven, because it would sign the user out of Claude.

### Supervisor-gathered evidence (2026-10-26)

The nmg-sdlc supervisor gathered this with the user in a live herdr session running `claude --plugin-dir .` in this checkout. The user typed or authorized every credential.

| Step | Observed outcome |
|------|------------------|
| `/login` → OpenCode Go with the user's key | Only bullets drawn; `Logged in to OpenCode Go`; `vault.json` created with mode 600, holding only `opencode-go/default` and no plaintext; `/login` shows `OpenCode Go — ✓ logged in` |
| `/login` → OpenAI Codex, browser sign-in, paste of the `localhost:1455` redirect | `Logged in to OpenAI Codex as <email>`; `OpenAI Codex — ✓ logged in`; the vault holds an `openai-codex` entry and no plaintext code or token |
| Second Codex sign-in, same identity | The entry was updated, with no duplicate |
| `/logout` | Only Anthropic, OpenCode Go and OpenAI Codex listed |
| `/logout` → OpenAI Codex (one account) | `Logged out of OpenAI Codex (<email> (pro))`; vault entry removed; `/logout` then lists Anthropic and OpenCode Go |

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None was needed. No code defect was found | — | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security hygiene |
| **Location** | `src/login/login-command.ts` |
| **Issue** | L1 (carried over): the OAuth authorize URL is also written to the transcript. It holds no secret |
| **Reason Not Fixed** | Optional; a product choice |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error handling (UX) |
| **Location** | `src/login/login-command.ts`, `src/login/logout-command.ts` |
| **Issue** | L3 (carried over): the warning for a refused config entry is logged again on every `/login` and `/logout` |
| **Reason Not Fixed** | The spec only requires the message. Showing it once per session is optional |

---

## Positive Observations

- The vault fix is small and keeps the stored format unchanged. A host-environment test locks in the hooks-environment constraint that caused the defect.
- A real provider login now works from start to finish: key saved, account active, models discovered with per-model wire formats, and Anthropic models dropped.

---

## Recommendations Summary

### Before PR (Must)
- None

### Long Term (Could)
- [ ] L1: drop the transcript copy of the OAuth URL
- [ ] L3: log each config warning once per session
- [ ] Consider a confirmation before `/logout` deletes a provider's only account

---

## Recommendation

**Ready for PR**

The code meets every acceptance criterion in unit tests, and every acceptance criterion has live evidence. That includes real OpenCode Go and OpenAI Codex sign-ins, model discovery, and logout. The user accepted AC8's two-account part on unit evidence, and AC3's failure states are verified against the faked responses their Given specifies. The registered gate is complete and green at the verification head.
