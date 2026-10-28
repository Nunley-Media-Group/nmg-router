# Design: Read image input support from each provider's own model data

**Issue**: #35
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Overview

Image encoding already works on every wire (`src/translate/adapters/*`), and the router already forwards images when `CatalogModel.vision` is true (`src/routing/router.ts`, `normalizeMessages`). This change only fills `vision`. A shared modality reader parses the common list shapes. An optional per-provider capability source supplies image support when the listing does not carry it. The catalog merges both with bundled metadata in a fixed order. Router, hub and adapters are unchanged.

## Architecture

```text
catalog.refresh(provider)
  ├─ plugin.models.list()            → RawModel[] (vision from the list via visionOf, or undefined)
  ├─ plugin.capabilities?.read()     → CapabilityIndex | undefined   (only after an ok list; failure → undefined)
  └─ buildModels(plugin, raws, index)
       vision = raw.vision ?? index?.(raw.id)?.vision ?? metadataFor(id)?.vision
```

- `src/models/modalities.ts` (new, pure): `inputModalitiesOf(entry: unknown): readonly string[] | undefined` reads, in order, `input_modalities`, `architecture.input_modalities`, `modalities.input` (string arrays, lower-cased), then `architecture.modality` (`"text+image->text"` → the part before `->`, split on `+`). `visionOf(entry): boolean | undefined` is `undefined` when no shape is present, else whether `image` is among them.
- `src/models/capability-sources.ts` (new): the two reusable sources.
  - `listedCapabilities({ url, headers, parse })` fetches with `getJson` and `requestHeaders(headers(context), context.auth?.token)` from `src/providers/http.ts`. It returns `parse(body)` on an `ok` outcome and `undefined` on any other outcome.
  - `staticCapabilities(table)` looks raw ids up in a frozen table with `Object.hasOwn`.
- `src/catalog/catalog.ts`: `refreshOne` reads the capability source only after an `ok` listing, in a `try`. A throw or `undefined` result leaves the index `undefined`, and the failure is logged with `deps.ui.log(..., { to: "debug" })` only, never to the transcript. `buildModels` takes the index and applies the FR3 order.
- `src/models/openai-models-list.ts`: `parseOpenAiModelList` sets `vision: visionOf(record)`. This covers OpenCode Go, xAI's listing and live-listed custom providers (AC3).
- `src/providers/builtin/openai-codex.ts`: `parseCodexModels` sets `vision: visionOf(item)` (FR7).
- `src/providers/builtin/cline-pass.ts`: `capabilities: listedCapabilities({ url: `${BASE_URL}/ai/cline/models`, headers: ({ platform }) => clientHeaders(platform), parse: parseClineModelData })`.
  - `parseClineModelData(body)` reads `data[]` entries by `id`. It returns `undefined` when `data` is not an array.
  - Its index applies FR4. First it tries the exact raw id. Otherwise it takes the entries whose normalized last path segment equals the alias's normalized last segment. Normalizing removes a trailing `:free` or `-free`. When the alias's own prefix (`nvidia/…`) is not `cline-pass` or `cline-free` and entries from that vendor exist, it keeps only those.
  - It returns `{ vision }` only when there is at least one candidate, every candidate's `visionOf` is defined, and all agree. Otherwise it returns `undefined`.
- `src/providers/builtin/xai.ts`: `capabilities: listedCapabilities({ url: `${BASE_URL}/language-models`, headers: () => HEADERS, parse: parseXaiLanguageModels })`. The parser reads `models[]` (or `data[]`) and indexes each entry's `id` and each string in `aliases` to `visionOf(entry)`, skipping undefined verdicts. The listing stays on `/models`.
- `src/providers/builtin/opencode-go.ts`: `capabilities: staticCapabilities(OPENCODE_GO_VISION)`. OpenCode Go exposes no modality data. The table is reference data from oh-my-pi's bundled catalog (`pi-catalog` `models.json`, `opencode-go`), the same source `src/providers/metadata.ts` cites:
  - vision `true`: `gpt-5.6-luna`, `grok-4.5`, `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k3`, `mimo-v2-omni`, `mimo-v2.5`, `minimax-m3`, `qwen3.5-plus`, `qwen3.6-plus`, `qwen3.7-plus`, `qwen3.8-max`
  - vision `false`: `deepseek-v4-flash`, `deepseek-v4-pro`, `glm-5`, `glm-5.1`, `glm-5.2`, `glm-5.3`, `hy3`, `mimo-v2-pro`, `mimo-v2.5-pro`, `minimax-m2.5`, `minimax-m2.7`, `qwen3.7-max`

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `ModelCapabilities` (`src/providers/types.ts`) | — | `{ readonly vision?: boolean }` | Capability facts a source can supply; new facts are added as optional fields |
| `CapabilityIndex` (`src/providers/types.ts`) | raw model id as listed | `ModelCapabilities \| undefined` | Lookup by the provider's own id |
| `CapabilitySource` (`src/providers/types.ts`) | `HttpDeps`, `ProviderContext` | `Promise<CapabilityIndex \| undefined>` | `read(deps, context)` |
| `ProviderPlugin.capabilities?` | — | `CapabilitySource` | Optional; absent means no extra source |
| `visionOf` / `inputModalitiesOf` (`src/models/modalities.ts`) | list entry | `boolean \| undefined` / `string[] \| undefined` | FR1 |
| `listedCapabilities` / `staticCapabilities` (`src/models/capability-sources.ts`) | options / table | `CapabilitySource` | FR2, FR6 |
| `parseClineModelData` (`cline-pass.ts`), `parseXaiLanguageModels` (`xai.ts`) | JSON body | `CapabilityIndex \| undefined` | FR4, FR5 |

## Data / Storage Changes

None. `CatalogModel.vision` already exists in the catalog cache. Models cached before this change gain image support at their provider's next refresh.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Provider-native capability sources behind one optional plugin hook | Selected | Chosen in the issue interview. Each provider keeps its own source, and the catalog stays provider-agnostic |
| models.dev at runtime or as a bundled snapshot | Rejected | Out of scope for #35. A single 6 MB download, and not the provider's own data |
| Fold capability fetches into each provider's `models.list` | Rejected | Would couple listing failure to capability failure (AC6) and repeat the merge in every provider |
| Fuzzy single-best ClinePass match | Rejected | Can claim vision for the wrong model. FR4 requires agreement or unknown |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #35 | 2026-10-27 | Initial feature design |
