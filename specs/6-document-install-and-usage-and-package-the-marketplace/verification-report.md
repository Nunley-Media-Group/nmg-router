# Verification Report: Document install and usage and package the marketplace

**Date**: 2026-10-27
**Issue**: #6
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec

**Verification head**: c60e05bbca89157855643d921bdaccea91e8ad41

---

## Executive Summary

The README was rewritten around the user's path with the eleven level-2 sections AC2 lists, in order. Installation gives the two `nmg-plugins` marketplace commands. The Credential security and Contributing sections are byte-identical to `main`. A new Vitest suite checks the headings and each section's terms. All three registered validations pass at the verification head, and an interactive herdr session loaded the mod with no hook or plugin errors and showed the `/model` hub, `/login` picker and `/config` row behaving as the README describes.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #6
- Spec: `specs/6-document-install-and-usage-and-package-the-marketplace`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001, SCN002]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":6,"specPath":"specs/6-document-install-and-usage-and-package-the-marketplace","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact

`sdlc-verify-steering.mjs --base main --controller-run-id 8988ce07-37f3-4dd4-8e0b-a5038bd242a7` wrote `.nmg-sdlc/verification/6.json`:

- `ok: true`, `ceiling: null`
- Identity: head `c60e05bbca89157855643d921bdaccea91e8ad41`, tree clean
- Coverage: declared 3, recorded 3, complete `true`; no missing, duplicate or unknown results
- No `repository.nmg-sdlc-smoke` or `project.nmg-sdlc-smoke` validation is declared in `steering/manifest.json`, so no smoke lifecycle evidence applies.

| Validation | Provider | Required | Status |
|------------|----------|----------|--------|
| `repository.typecheck` (`npm run typecheck`) | builtin.command | yes | passed |
| `repository.tests` (`npm test`) | builtin.command | yes | passed |
| `repository.plugin-manifest` (`claude plugin validate .`) | builtin.command | yes | passed |

**Gate Summary**: 3/3 passed, 0 failed, 0 incomplete

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Installation gives `/plugin marketplace add Nunley-Media-Group/nmg-plugins` and `/plugin install nmg-router@nmg-plugins`; `claude plugin validate .` passes | Pass | `README.md` `## Installation` code block; `tests/docs/readme-sections.test.ts` rows for both commands; `repository.plugin-manifest` passed |
| AC2 | Eleven level-2 headings in order, with each section's required terms; Credential security keeps its tested terms | Pass | `README.md` headings Requirements → Contributing; `tests/docs/readme-sections.test.ts` heading-order test and 19 term rows; `tests/docs/readme-security.test.ts` passes; `diff` of `main:README.md` vs `README.md` from `## Credential security` to end is empty |

AC2 term checks, each confirmed in the section text:

- Requirements: "Claude Code 2.1.310 or later", "Nothing else needs installing".
- Logging in to providers: `/login`, `/logout`, "Choosing Anthropic runs Claude Code's own login".
- Choosing a model: `/model` hub, `provider/model` ids.
- Thinking levels: "clamped to what the routed model supports".
- Auto-mode permissions: "Routed auto-mode permissions", `claude-classifier`, `server-classifier-off`.
- Custom providers and filters: `config.json`, `disabledProviders`, `enabledModels`, "The file never holds a key".
- Credential boundary: "Claude credentials stay with Claude Code", "Provider credentials stay in the encrypted vault".

The README's claims also match the code: the `/login` title is `Select provider to login` in `src/login/login-command.ts:15`. The `/config` row title "Routed auto-mode permissions" and its two values are in `.claude-plugin/plugin.json:8-9`. The `api` values `openai-responses` and `anthropic-messages` are adapters in `src/translate/adapters/index.ts`, and the per-OS config paths are in `src/config/user-config.ts`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Rewrite the README | Complete | Sections in order; Credential security and Contributing unchanged; the README does not name the dependency, so the oh-my-pi naming rule is met; `claude plugin validate .` passes |
| T002 | README section tests | Complete | `tests/docs/readme-sections.test.ts` created; `npm test` (65 files, 537 tests) and `npm run typecheck` pass |

The version bump to 0.10.0 is consistent across `VERSION`, `package.json` and `.claude-plugin/plugin.json`, with a matching `CHANGELOG.md` entry.

---

## Architecture Assessment

This change is documentation plus one test file, with no runtime code.

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The new test covers only README structure and terms; credential terms stay in `readme-security.test.ts` |
| Open/Closed | 5 | Heading list and term rows are data tables; adding a section is a row change |
| Liskov Substitution | 5 | N/A, no type hierarchy |
| Interface Segregation | 5 | N/A, no interfaces |
| Dependency Inversion | 5 | N/A, no runtime dependencies |

### Layer Separation

No `src/` or `hooks/` changes. `hooks/register.ts` is untouched.

### Dependency Flow

The test reads `README.md` through `node:fs` only, with no new dependencies.

---

## Security Assessment

- [x] Authentication: no change. The README states that Claude credentials stay with Claude Code and that provider credentials stay in the encrypted vault.
- [x] Authorization: no change.
- [x] Input validation: no change. The README documents that `config.json` entries holding a key are rejected.
- [x] Injection prevention: no change.
- [x] Data protection: no credentials, tokens or account ids in the diff. The README example uses `relay.example.com` and no key.

---

## Performance Assessment

- [x] Async patterns: N/A
- [x] Caching: N/A
- [x] Resource management: the test reads the README once at module load
- [x] Query optimization: N/A

---

## Error Handling Assessment

No runtime paths changed. The test's `section()` helper returns `""` for a missing heading, so a removed section fails its term assertions with a clear diff instead of throwing.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Vitest rows in `tests/docs/readme-sections.test.ts`; plugin validate in `repository.plugin-manifest`) | Yes |
| AC2 | Yes (SCN002) | Yes (heading-order test and term rows in `tests/docs/readme-sections.test.ts`) | Yes |

### Coverage Summary

- Feature files: 2 scenarios (`feature.gherkin`), carried out as Vitest assertions, as the project's earlier specs are
- Unit tests: `tests/docs` 2 files, 39 tests passed; full suite 65 files, 537 tests passed
- Integration tests: N/A

---

## Interactive Verification (herdr)

Run as the interactive-verification steering requires. `herdr tab list` answered. Tab `verify-6` was created with `--no-focus` at the repository root, and Claude started with `herdr agent start verify-6 --kind claude --pane <pane> -- --plugin-dir .`. The tab was closed after the run.

| Scenario | Prompt sent | Observed outcome | Excerpt |
|----------|-------------|------------------|---------|
| Plugin loads with no errors (docs change) | session start with `--plugin-dir .` | Prompt ready. No hook, plugin or load error on screen. Status line shows `model: Opus`, `auto mode on` | `❯ Try "how do I log an error?"` |
| Choosing a model (AC2) | `/model` | Hub opens with "All models", then Claude, then each provider with its model count. Routed ids show as `provider/model`. Search and Esc hints match the README | `[ All models (43) ]` / `[ Claude (5) ]` / `[ OpenCode Go (37) ]` … `[ opencode-go/kimi-k3.1-pro ]` · `Enter switch · Tab/↑↓ move · type to search · Esc clear/close` |
| Logging in to providers (AC2) | `/login` | "Select provider to login" lists Anthropic (Claude Code login) and every enabled provider with its login status. Cancelled without entering a credential | `Select provider to login` / `Anthropic (Claude Code login)` / `ClinePass — not logged in` / `nmg-router: Login cancelled.` |
| Auto-mode permissions (AC2) | `/config`, filter `Routed` | The README's row is present | `❯ Routed auto-mode permissions · nmg-router  ›` |

Installation from the `nmg-plugins` marketplace (AC1) is checked by the README text and `claude plugin validate .`. A live `/plugin install` was not run because it would change the user's installed plugins, and the spec's AC1 asks only for the documented commands and a passing manifest validation. The run switched no models, so no `/model` round trip between Claude and a routed model was performed. This change does not touch routing, the model picker or `/login`.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| — | — | — | None | — |

## Recommendation

Ready for PR.
