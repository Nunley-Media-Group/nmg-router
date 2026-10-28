# Requirements: Read image input support from each provider's own model data

**Issue**: #35
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## User Story

**As a** developer who routes Claude Code turns to non-Claude models
**I want** each routed model's image input support to come from its provider's own model data
**So that** images I paste or tools read reach models that accept them, and only text-only models get the omission note

## Background

A routed turn forwards an image only when the catalog marks the model `vision`; otherwise the image becomes `(image omitted: <model> has no image input)`. Every wire format already encodes images. Today only OpenAI Codex reads image support from its own list. OpenCode Go, ClinePass, xAI and live-listed custom providers fall back to five bundled entries or to text-only, so image-capable models such as `cline-pass/kimi-k3` never receive images.

## Acceptance Criteria

### AC1: ClinePass image models take images

**Given** ClinePass's model data lists `moonshotai/kimi-k3` with image input and the recommended list offers `cline-pass/kimi-k3`
**When** the catalog refreshes and a routed turn to `cline-pass/kimi-k3` carries an image
**Then** the model is marked vision, its `/model` hub detail shows `vision`, and the request carries the image

### AC2: xAI image models take images

**Given** xAI's language-model data lists `grok-4.6` with image input
**When** the catalog refreshes
**Then** `xai/grok-4.6` is marked vision

### AC3: OpenAI-compatible lists that state modalities are read

**Given** a custom provider or any OpenAI-compatible list whose entries carry `input_modalities`, `architecture.input_modalities` or `modalities.input`
**When** the catalog refreshes
**Then** each model with `image` among them is marked vision and each without it is marked text-only

### AC4: OpenCode Go models carry known image support

**Given** OpenCode Go lists `kimi-k3` and `glm-5.3`
**When** the catalog refreshes
**Then** `opencode-go/kimi-k3` is marked vision and `opencode-go/glm-5.3` text-only, from the bundled reference data

### AC5: Text-only and unknown models keep the omission note

**Given** a routed model that is text-only or whose image support no source states, such as an ambiguous ClinePass alias
**When** a routed turn carries an image
**Then** the image is replaced with the existing omission note and the turn still completes

### AC6: A failed capability lookup does not break the catalog

**Given** a provider's capability data request fails, is refused or returns an unreadable body
**When** the catalog refreshes
**Then** the provider's models are still listed with image support from the remaining sources, and no error is shown

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | One shared reader derives image support from `input_modalities`, `architecture.input_modalities`, `modalities.input` or `architecture.modality`, and returns unknown when none is present | Must |
| FR2 | A provider may declare an optional capability source that the catalog consults after a successful listing; adding one for a new provider needs no catalog change | Must |
| FR3 | Image support resolves in order: the provider's own list, its capability source, bundled metadata, then text-only | Must |
| FR4 | ClinePass maps a recommended alias to its model data only when every matching entry agrees; otherwise image support is unknown | Must |
| FR5 | xAI reads image support from its language-model data, matching model ids and aliases | Must |
| FR6 | A capability request sends the provider's listing headers and stored credential and nothing else | Must |
| FR7 | Codex keeps its current image support results, read through the shared reader | Should |

## Out of Scope

- models.dev or any other cross-provider catalog at runtime
- PDF, audio and video input
- Per-model user overrides of image support for built-in providers
- Context windows and prices from the new capability data

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #35 | 2026-10-27 | Initial feature spec |
