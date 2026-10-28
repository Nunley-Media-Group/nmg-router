# Tasks: Read image input support from each provider's own model data

**Issue**: #35
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Implementation Tasks

### T001: Shared modality reader

**File(s)**: `src/models/modalities.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- FR1: `inputModalitiesOf` reads `input_modalities`, `architecture.input_modalities`, `modalities.input` and `architecture.modality` in that order. `visionOf` returns `true` or `false` from them, and `undefined` when none is present or the entry is not an object.

### T002: Capability source types, reusable sources and catalog merge

**File(s)**: `src/providers/types.ts`, `src/models/capability-sources.ts`, `src/catalog/catalog.ts`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- FR2: `ModelCapabilities`, `CapabilityIndex`, `CapabilitySource` and optional `ProviderPlugin.capabilities` exist. `listedCapabilities` and `staticCapabilities` build sources.
- FR3: `buildModels` sets `vision: raw.vision ?? index?.(raw.id)?.vision ?? metadata?.vision`.
- FR6: `listedCapabilities` sends the provider's headers and stored bearer token through `requestHeaders`, and nothing else.
- AC6: the source is read only after an `ok` listing. A throw or non-ok outcome leaves the index `undefined`, the listing is recorded as `ok`, and nothing is logged to the transcript.

### T003: Read modalities from OpenAI-style and Codex lists

**File(s)**: `src/models/openai-models-list.ts`, `src/providers/builtin/openai-codex.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC3: `parseOpenAiModelList` sets `vision` from `visionOf`.
- FR7: `parseCodexModels` uses `visionOf`, and the Codex fixture still yields `vision: true` for `gpt-5.5`.

### T004: ClinePass capability source

**File(s)**: `src/providers/builtin/cline-pass.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC1, FR4: `parseClineModelData` and the plugin's `capabilities` read `${BASE_URL}/ai/cline/models` with the ClinePass client headers. `cline-pass/kimi-k3` resolves to `moonshotai/kimi-k3`'s verdict, and an alias with no match or disagreeing matches resolves to `undefined`.

### T005: xAI capability source

**File(s)**: `src/providers/builtin/xai.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC2, FR5: `parseXaiLanguageModels` and the plugin's `capabilities` read `${BASE_URL}/language-models` and index ids and aliases. The listing URL stays `${BASE_URL}/models`.

### T006: OpenCode Go bundled image support

**File(s)**: `src/providers/builtin/opencode-go.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC4: the plugin's `capabilities` is `staticCapabilities` over the 25-entry table in design.md. `kimi-k3` is `true` and `glm-5.3` is `false`.

### T007: Modality reader tests

**File(s)**: `tests/models/modalities.test.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- AC3, FR1: each of the four shapes yields vision true and false. A missing shape and a non-object yield `undefined`.

### T008: Discovery tests for every provider

**File(s)**: `tests/catalog/discovery.test.ts`, `tests/fixtures/cline-pass-models.json`, `tests/fixtures/xai-language-models.json`
**Type**: Create | Modify
**Depends**: T003, T004, T005, T006
**Acceptance**:
- AC1, FR4: with a trimmed `/ai/cline/models` fixture, `cline-pass/kimi-k3` is vision and `cline-pass/glm-5.3` is not. An alias with no matching entry has `vision` undefined. Two matching entries that disagree give `undefined`.
- AC2, FR5: with a `language-models` fixture, `xai/grok-4.6` is vision, including when it is matched by an alias.
- AC3: a custom provider listed live with `input_modalities` gets vision true and false per model.
- AC4: `opencode-go/kimi-k3` is vision and `opencode-go/glm-5.3` is not.
- AC6: when the capability URL answers 500, is offline or is malformed, the provider's status is `ok` and its models are listed with vision from the list or the bundled metadata.
- FR3: a list verdict beats the capability source, which beats bundled metadata.
- FR6: the capability request carries the stored bearer token and the provider's headers.
- FR7: the existing Codex discovery test still passes.

### T009: Routed image forwarding tests

**File(s)**: `tests/routing/images.test.ts`
**Type**: Create
**Depends**: T004
**Acceptance**:
- AC1: after a ClinePass refresh with the capability fixture, a routed step to `cline-pass/kimi-k3` whose user message holds a base64 image sends an `image_url` content part. The hub detail line for that row contains `vision`.
- AC5: the same step to `cline-pass/glm-5.3`, and to an alias with unknown image support, sends the text `(image omitted: <model> has no image input)`, and the step completes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #35 | 2026-10-27 | Initial feature tasks |
