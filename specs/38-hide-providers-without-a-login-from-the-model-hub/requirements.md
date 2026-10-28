# Requirements: Hide providers without a login from the /model hub

**Issue**: #38
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/5-replace-model-with-an-oh-my-pi-style-model-hub/

## User Story

**As a** developer who has logged in to only some of the enabled providers
**I want** the `/model` hub to list only the providers I can actually use
**So that** the model selection is not cluttered with providers and preview models I cannot pick

## Background

The `/model` hub builds one sidebar entry per enabled provider. Today a provider that needs a login and has no stored login is "locked": it is listed dimmed after the other providers, and selecting it opens a locked view that says "<Provider> has no credentials.", lists the provider's bundled preview models, and offers a "Log in to <Provider>" button. The "All models" scope already leaves locked providers out.

`src/hub/hub-controller.ts` `rebuild()` marks a provider locked when its login kind is not `none` and `credentials.list` returns no stored login, then passes every enabled provider to `hubSources()`. `src/hub/sources.ts` gives a locked provider its bundled preview rows, `src/hub/hub-state.ts` sorts, dims and routes locked entries to the locked view, and `src/hub/hub-view.ts` draws that view and its login button.

The Claude Code `/model` picker rows written to settings come from the catalog, which records a provider with no login as `not-logged-in` with no models, so those rows already leave such providers out.

## Acceptance Criteria

### AC1: A provider without a login has no hub entry

**Given** an enabled provider that requires a login and has no stored login
**When** the person opens the `/model` hub
**Then** the sidebar has no entry for that provider and none of its models appear in any scope

### AC2: Logged-in and login-free providers still appear

**Given** one enabled provider with a stored login and one enabled provider whose login kind is `none`
**When** the person opens the `/model` hub
**Then** the sidebar lists the Claude entry, both providers, and their models as before

### AC3: Logging in makes the provider appear

**Given** a provider that was hidden because it had no stored login
**When** the person completes `/login` for that provider and then opens the `/model` hub
**Then** the sidebar lists that provider and its models

### AC4: Logging out hides the provider

**Given** a provider listed in the hub with one stored login
**When** the person runs `/logout` for that provider and then opens the `/model` hub
**Then** the sidebar has no entry for that provider

### AC5: A stored but failing login keeps the provider listed

**Given** a provider with a stored login whose credential cannot currently be resolved (expired or offline)
**When** the person opens the `/model` hub
**Then** the provider is still listed with its kept models, so the hub does not hide it

### AC6: Nothing replaces the hidden entries

**Given** every login-requiring provider has no stored login
**When** the person opens the `/model` hub
**Then** the hub shows only the "All models" and Claude entries and the Claude models, with no locked view, no login button, and no hint about hidden providers

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The hub omits every enabled provider that requires a login and has no stored login from its sidebar and from every scope. | Must |
| FR2 | The hub's locked state, locked view, bundled preview rows and in-hub "Log in to <Provider>" button are removed, since no listed provider can be locked. | Must |
| FR3 | Provider visibility is evaluated each time the hub builds its lists, so a login or logout in the same session is reflected on the next hub open. | Must |
| FR4 | A provider with at least one stored login stays listed regardless of whether that credential currently resolves. | Must |
| FR5 | The Claude Code `/model` picker rows written to settings keep excluding providers without a login. | Must |

## Out of Scope

- Changing the `/login` provider picker, which keeps listing every enabled provider.
- Changing which providers are enabled.
- Hiding providers whose stored login has expired or fails to resolve.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #38 | 2026-10-27 | Initial feature spec |
