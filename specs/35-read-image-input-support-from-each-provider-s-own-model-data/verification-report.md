# Verification Report: Read image input support from each provider's own model data

**Date**: 2026-10-27
**Issue**: #35
**Reviewer**: Claude Code (standalone `/sdlc-verify-code`)
**Scope**: Implementation verification against spec
**Verification head**: 8de9b9e64037d59453b7380a18b051d621b76d89

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 3 informational

A shared reader (`src/models/modalities.ts`) derives image support from the four common list shapes. Providers can declare an optional `capabilities` source (`src/providers/types.ts`), which the catalog reads after a successful listing (`src/catalog/catalog.ts`). Image support resolves from the list, then the capability source, then bundled metadata.

Sources added:
- ClinePass reads `/ai/cline/models` and matches its aliases to vendor entries. It gives an answer only when every matching entry agrees.
- xAI reads `/language-models`, by id and alias.
- OpenCode Go uses a bundled table from oh-my-pi's catalog.
- OpenAI-style lists (including live-listed custom providers) and Codex now share the reader.

The registered gate is green at the verification head: typecheck, 579/579 tests, and `claude plugin validate .`.

In a live herdr session running this branch with `--plugin-dir`:
- `opencode-go/kimi-k3` read a PNG and described it correctly.
- `opencode-go/glm-5.3` received `(image omitted: opencode-go/glm-5.3 has no image input)` and the turn completed.

<!-- nmg-sdlc-issue-scope: {"issueNumber":35,"specPath":"specs/35-read-image-input-support-from-each-provider-s-own-model-data","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Issue Scope

- Active issue: #35
- Spec: `specs/35-read-image-input-support-from-each-provider-s-own-model-data`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC1–AC6; FR1–FR7; T001–T009; SCN001–SCN006
- Regression: none

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | ClinePass image models take images | Pass | `src/providers/builtin/cline-pass.ts` (`parseClineModelData`, `capabilities`). `tests/catalog/discovery.test.ts` "marks each alias by its vendor entry" passed. `tests/routing/images.test.ts` (AC1) passed: an `image_url` part is sent and the hub detail line shows `vision`. Live parsers run against the public endpoints: `cline-pass/kimi-k3` → true |
| AC2 | xAI image models take images | Pass | `src/providers/builtin/xai.ts` (`parseXaiLanguageModels`, `capabilities`). `tests/catalog/discovery.test.ts` "marks a model by its id and by an alias" passed |
| AC3 | OpenAI-compatible lists that state modalities are read | Pass | `src/models/openai-models-list.ts` (`vision: visionOf(record)`). `tests/models/modalities.test.ts` passed (7 tests). The custom-provider test in `tests/catalog/discovery.test.ts` passed |
| AC4 | OpenCode Go models carry known image support | Pass | `src/providers/builtin/opencode-go.ts` (`OPENCODE_GO_CAPABILITIES`). The `tests/catalog/discovery.test.ts` AC4 test passed. In the live refresh, `kimi-k3` was marked vision and `glm-5.3` text-only |
| AC5 | Text-only and unknown models keep the omission note | Pass | `tests/routing/images.test.ts` (AC5) passed for `cline-pass/glm-5.3` (text-only) and `cline-pass/qwen3.8-max` (unknown). The live `opencode-go/glm-5.3` turn received the note and completed |
| AC6 | A failed capability lookup does not break the catalog | Pass | `src/catalog/catalog.ts` (`capabilitiesOf`). In `tests/catalog/discovery.test.ts`, the cases for HTTP 500, offline, unreadable body, unexpected shape, xAI 403 and a throwing source all keep status `ok`, log to debug only, and leave the transcript empty |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Shared modality reader | Complete | `src/models/modalities.ts` |
| T002 | Capability source types, reusable sources and catalog merge | Complete | `src/providers/types.ts`, `src/models/capability-sources.ts`, `src/catalog/catalog.ts` |
| T003 | Read modalities from OpenAI-style and Codex lists | Complete | `src/models/openai-models-list.ts`, `src/providers/builtin/openai-codex.ts`. The existing Codex discovery test still yields `vision: true` |
| T004 | ClinePass capability source | Complete | `src/providers/builtin/cline-pass.ts` |
| T005 | xAI capability source | Complete | `src/providers/builtin/xai.ts`. The listing stays on `/models` |
| T006 | OpenCode Go bundled image support | Complete | `src/providers/builtin/opencode-go.ts`, 25 entries |
| T007 | Modality reader tests | Complete | `tests/models/modalities.test.ts` |
| T008 | Discovery tests for every provider | Complete | `tests/catalog/discovery.test.ts`, `tests/fixtures/cline-pass-models.json`, `tests/fixtures/xai-language-models.json` |
| T009 | Routed image forwarding tests | Complete | `tests/routing/images.test.ts` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Modality parsing, source construction, provider-specific matching and catalog merging each live in one module |
| Open/Closed | 5 | A new provider adds image support by declaring `capabilities`, with no catalog change. A new capability fact is a new optional field on `ModelCapabilities` |
| Liskov Substitution | 5 | `listedCapabilities`, `staticCapabilities` and ad-hoc sources are interchangeable `CapabilitySource`s |
| Interface Segregation | 5 | `CapabilitySource` has one method, and the plugin field is optional |
| Dependency Inversion | 5 | The catalog depends on the `CapabilitySource` type. Sources take `HttpDeps`, never `$` directly |

### Layer Separation

Parsing (`visionOf`, `parseClineModelData`, `parseXaiLanguageModels`) is pure and tested without Claude Code. HTTP goes only through `getJson` and `requestHeaders` in `src/providers/http.ts`. Router, hub and wire adapters are unchanged.

### Dependency Flow

Provider modules → `src/models/capability-sources.ts` → `src/providers/http.ts`. The catalog sees only the plugin interface.

---

## Security Assessment

- [x] Authentication: a capability request carries the provider's stored bearer token to that provider's own host only, the same as its listing (FR6, tested).
- [x] Authorization: no new credential handling. No credential reaches logs, `$.store` or fixtures; the hygiene fixture test passed.
- [x] Input validation: every response body is treated as untrusted. Non-object entries, non-string ids and non-array lists are skipped.
- [x] Injection prevention: no response data reaches a shell, URL or header.
- [x] Data protection: the debug log line names only the provider (`ClinePass capability data unavailable`).

---

## Performance Assessment

- [x] Async patterns: one extra GET per refresh, and only for providers with a listed capability source (ClinePass, xAI). It runs during catalog refresh, never inside `turn.step`.
- [x] Caching: the result is folded into the existing catalog cache, with no extra persistence.
- [x] Resource management: ClinePass's `/ai/cline/models` is about 546 KB per ClinePass refresh. The hub refreshes a provider once per session, plus explicit refreshes.
- [x] Query optimization: ClinePass lookups use maps by id and model key.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (`tests/catalog/discovery.test.ts`, `tests/routing/images.test.ts`) | Yes |
| AC2 | Yes (SCN002) | Yes (`tests/catalog/discovery.test.ts`) | Yes |
| AC3 | Yes (SCN003) | Yes (`tests/models/modalities.test.ts`, `tests/catalog/discovery.test.ts`) | Yes |
| AC4 | Yes (SCN004) | Yes (`tests/catalog/discovery.test.ts`) | Yes |
| AC5 | Yes (SCN005) | Yes (`tests/routing/images.test.ts`) | Yes |
| AC6 | Yes (SCN006) | Yes (`tests/catalog/discovery.test.ts`) | Yes |

### Coverage Summary

- Feature file: 6 scenarios (`feature.gherkin`), realized as Vitest tests
- New or changed tests: 30 in `tests/models/modalities.test.ts`, `tests/catalog/discovery.test.ts` and `tests/routing/images.test.ts`, all passed
- Against the pre-change `src/`, 11 of the new behavior tests fail; with the change they pass
- Full suite: `npm test` passed (579 tests, 68 files)

### Registered validations (`.nmg-sdlc/verification/35.json`, coverage 3/3 complete)

| Validation | Command | Result |
|------------|---------|--------|
| `repository.typecheck` | `npm run typecheck` | passed (exit 0) |
| `repository.tests` | `npm test` | passed (579 tests) |
| `repository.plugin-manifest` | `claude plugin validate .` | passed (exit 0, standard hooks-module warnings) |

### Live verification (herdr tab `verify-35`, `claude --plugin-dir <repo>`, Claude Code 2.1.312)

| Check | Model | Result |
|-------|-------|--------|
| Catalog refresh applies the OpenCode Go table | `opencode-go/*` | Passed: 9 listed models marked vision (including `kimi-k3`, `qwen3.8-max`, `minimax-m3`), 9 text-only (including `glm-5.3`), and 19 not in the table left unknown |
| Image reaches a vision model (AC1 path, AC4) | `opencode-go/kimi-k3` | Passed: after `Read` of a slicer screenshot, it described pipe fittings on the build plate and the `CREALITY` brand |
| Omission note for a text-only model (AC5) | `opencode-go/glm-5.3` | Passed: the tool result read `(image omitted: opencode-go/glm-5.3 has no image input)` and the turn completed |
| ClinePass alias mapping against the live public endpoints (AC1, FR4) | 20 `cline-pass/*` aliases | Passed: 13 vision (e.g. `kimi-k3`, `deepseek-v4.1-flash`, `qwen3.7-plus`), 5 text-only (`glm-5.3`, `deepseek-v4-pro`, `qwen3.7-max`, `nemotron-3.5-lightning-free`, `solar-mini4`), 2 unknown (`qwen3.8-max`, `beam-free`) |

No credentials or account ids were recorded.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Testing |
| **Location** | `src/providers/builtin/xai.ts` |
| **Issue** | xAI's `/language-models` response shape is covered by a fixture only. No xAI account is signed in on this machine, so it was not exercised live |
| **Impact** | If the live shape differs, the parser returns undefined, and xAI falls back to bundled metadata (AC6 behavior). Nothing breaks |
| **Reason Not Fixed** | Needs an xAI login, which only the user can provide |

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **Location** | `src/providers/builtin/opencode-go.ts` |
| **Issue** | OpenCode Go publishes no modality data, and oh-my-pi's bundled table covers 18 of the 37 models OpenCode Go lists today. Newer models such as `kimi-k3.1-pro` and `deepseek-v4.1-flash` stay unknown, so they are treated as text-only |
| **Impact** | Those models receive the omission note instead of images until the table is extended |
| **Reason Not Fixed** | The issue scope chose provider-native sources only. Extending the table needs a new reference source |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `src/providers/builtin/cline-pass.ts` |
| **Issue** | No live routed ClinePass image turn was run. The `--plugin-dir` load has its own store, which holds no ClinePass login |
| **Impact** | The routed path is covered by `tests/routing/images.test.ts` and the live OpenCode Go turn, which uses the same wire. ClinePass's mapping was checked against its live endpoints |
| **Reason Not Fixed** | Needs the user's ClinePass key in the development store |

---

## Positive Observations

- ClinePass's agreement rule (FR4) declines to guess. `qwen3.8-max` and `beam-free` stay unknown rather than borrowing a sibling's verdict.
- Capability failure is isolated from listing failure, so a provider never loses its models over an optional endpoint.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Confirm xAI `/language-models` live once an xAI account is signed in
- [ ] Extend OpenCode Go's table as new reference data appears

### Long Term (Could)
- [ ] Carry further capability facts (PDF, audio) through `ModelCapabilities`

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/models/modalities.ts` | 0 | |
| `src/models/capability-sources.ts` | 0 | |
| `src/providers/types.ts` | 0 | |
| `src/catalog/catalog.ts` | 0 | |
| `src/models/openai-models-list.ts` | 0 | |
| `src/providers/builtin/openai-codex.ts` | 0 | |
| `src/providers/builtin/cline-pass.ts` | 1 (low) | Live routed turn not run |
| `src/providers/builtin/xai.ts` | 1 (medium) | Live shape unconfirmed |
| `src/providers/builtin/opencode-go.ts` | 1 (medium) | Table coverage |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes at the verification head with complete registered coverage. The three informational items rely on credentials or reference data outside the repository and degrade safely.
