# Requirements: Document install and usage and package the marketplace

**Issue**: #6
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## User Story

**As a** developer discovering nmg-router
**I want** install steps and a README that explains setup and use
**So that** I can add my provider plans to Claude Code without reading the source

## Background

nmg-router is installed as a Claude Code plugin from the Nunley-Media-Group `nmg-plugins` marketplace, with nothing else to install, and its code stays in this repository. Users sign in to providers with `/login`, pick models in the `/model` hub, and keep Claude on their own Claude Code login. The README is currently a short placeholder plus the credential security section.

The README describes behavior from the approved specs for #2 (provider catalog, `/login`, `/logout`, custom providers and filters), #3 (routed turns and thinking levels), #4 (auto-mode permissions) and #5 (the `/model` hub).

## Acceptance Criteria

### AC1: Installation instructions

**Given** the README
**When** a test reads its Installation section
**Then** it gives `/plugin marketplace add Nunley-Media-Group/nmg-plugins` and `/plugin install nmg-router@nmg-plugins`, and `claude plugin validate .` passes for the repository

### AC2: README content

**Given** the README
**When** a test checks its level-2 headings and their sections
**Then** it has, in this order, the sections Requirements, Installation, Logging in to providers, Choosing a model, Thinking levels, Auto-mode permissions, Custom providers and filters, Known limits, Credential boundary, Credential security and Contributing, and:
- Requirements names Claude Code 2.1.310 or later, the macOS Keychain, Windows Credential Manager and the Linux Secret Service, and states that nothing else needs installing;
- Logging in to providers covers `/login`, `/logout` and that choosing Anthropic runs Claude Code's own login;
- Choosing a model covers the `/model` hub and `provider/model` ids;
- Thinking levels states that the level is clamped to what the routed model supports;
- Auto-mode permissions names the `/config` row "Routed auto-mode permissions" and the values `claude-classifier` and `server-classifier-off`;
- Custom providers and filters names `config.json`, `disabledProviders` and `enabledModels`, and states that the file never holds a key;
- Credential boundary states that Claude credentials stay with Claude Code and that provider credentials stay in the OS keyring;
- the existing Credential security section keeps every term its current test checks

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | README installation from the `nmg-plugins` marketplace with `/plugin install` | Must |
| FR2 | README sections as listed in AC2, keeping the existing Credential security section | Must |

## Out of Scope

- A documentation website
- Changes to the behavior the README describes

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #6 | 2026-10-25 | Initial feature spec |
