# Requirements: Show provider plan usage in the routed status line and /usage

**Issue**: #40
**Date**: 2026-10-27
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## User Story

**As a** developer who switches between Claude and routed provider models in one session
**I want** nmg-router's status line to show the selected provider's plan usage, and `/usage` to list every provider I am logged in to
**So that** I can see how much of each plan I have left without leaving Claude Code

## Background

Routed providers meter their plans in their own windows. OpenAI Codex reports a primary (5-hour) and a secondary (7-day) window, on its usage endpoint and in `x-codex-*` headers on each routed response. OpenCode Go reports 5-hour, weekly and monthly windows on its usage endpoint. nmg-router reads and shows none of these figures today.

Today `src/routing/status.ts` builds the status line as strings (`statusText` gives `<model> · thinking <level>`, `errorStatusText` gives `<model> · <provider> error: <kind>`), `src/routing/router.ts` sets it after a routed main-loop step and clears it on a Claude main-loop step, and `ProviderPlugin` has optional strategies such as `capabilities` but no usage source. `/usage` is Claude Code's built-in command, which nmg-router does not hook.

This feature describes the selected provider's usage as data that both displays render, so neither display holds per-provider logic and no provider's usage appears under another provider. The status line's model text is the routed model id, as today.

## Acceptance Criteria

### AC1: The status line shows the selected provider's usage windows

**Given** a routed model is selected from a provider that has a usage source, and that provider's latest usage reading for the active account reports windows
**When** a routed main-loop step completes
**Then** nmg-router's status line shows the model, the thinking level and, for each window in the provider's order, the provider's window label and the whole-number percent used, for example `openai-codex/gpt-5.6 · thinking high · 5h 23% · 7d 41%`

### AC2: Switching providers switches the usage shown

**Given** the status line shows provider A's usage windows
**When** the person selects a routed model from provider B and a routed main-loop step completes, including when provider A's usage read finishes after that step
**Then** the status line shows only provider B's windows, or no windows when provider B has no reading, and never any of provider A's windows

### AC3: A provider without a usage source shows no usage

**Given** a routed model from xAI or ClinePass is selected
**When** a routed main-loop step completes
**Then** the status line shows the model and thinking level only, and no usage request is sent

### AC4: Usage endpoint reads are throttled per provider and account

**Given** a provider's usage endpoint was read less than 60 seconds ago for the active account
**When** another routed main-loop step on that provider completes
**Then** no usage request is sent and the status line shows the kept reading
**And** the first routed main-loop step that completes 60 seconds or more after that read sends one new usage request

### AC5: Codex usage comes from response headers

**Given** an `openai-codex` routed response that carries `x-codex-primary-*` and `x-codex-secondary-*` rate-limit headers
**When** that routed main-loop step completes
**Then** the status line shows the windows those headers report, and no usage endpoint request is sent for that step

### AC6: A failed usage read never affects the routed step

**Given** a provider's usage read fails (HTTP error, offline, or a response that does not match the expected shape)
**When** a routed main-loop step completes
**Then** the step's answer is unchanged, and the status line shows the model and thinking level with the last good reading's windows, or with no windows when there is none

### AC7: The routed error line keeps its text

**Given** a routed main-loop step fails with an error kind
**When** the status line is updated
**Then** it reads `<model> · <provider> error: <kind>`, as it does today, with no usage windows

### AC8: A Claude model clears the line

**Given** nmg-router's status line shows a routed provider's usage
**When** a Claude main-loop step runs
**Then** nmg-router's status line is cleared, no provider usage request is sent, and a usage read still running from the earlier routed step does not redraw the line

### AC9: /usage lists every logged-in provider after the built-in view

**Given** stored logins for OpenCode Go, OpenAI Codex and xAI, and an enabled provider with no stored login
**When** the person runs `/usage`
**Then** Claude Code's built-in usage command runs unchanged through `next(e)`
**And** after its output, nmg-router's output lists OpenAI Codex, OpenCode Go and xAI by provider name in the order the `/model` hub lists providers (by name). Each window line shows its label, whole-number percent used, and time until reset, for example `5h 23% · resets in 2h 10m`. xAI shows `No usage reading available`.
**And** the provider without a stored login has no entry

### AC10: One failing provider does not hide the others in /usage

**Given** two providers with stored logins, and one of them fails its usage read
**When** the person runs `/usage`
**Then** the failing provider's entry reads `Usage could not be read: <kind>` with the failure kind, and the other provider's entry shows its windows

### AC11: /usage with no provider logins adds nothing

**Given** no login-requiring provider has a stored login
**When** the person runs `/usage`
**Then** the hook returns the built-in command's result unchanged and nmg-router adds no output

### AC12: Credentials never appear in usage output

**Given** a provider usage read that sends the provider's stored credential
**When** the status line and `/usage` output are produced and any usage failure is reported
**Then** no token, key or account secret appears in the status line, the `/usage` output, a log line or `$.store`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `ProviderPlugin` gains an optional `usage` source whose `read` returns one provider-agnostic outcome: a report with an ordered list of windows (provider-defined id, provider-defined label, percent used 0–100 as a whole number, optional reset time), or a failure kind `unauthenticated`, `unavailable`, `offline` or `malformed`. An optional `fromHeaders` maps a routed response's headers to a report. Both displays consume only this report. | Must |
| FR2 | `openai-codex` provides a usage source. `read` sends `GET https://chatgpt.com/backend-api/wham/usage` with `authorization: Bearer <access token>` and `chatgpt-account-id`, mapping `rate_limit.primary_window` and `rate_limit.secondary_window` (`used_percent`, `limit_window_seconds`, `reset_at`) to windows `primary` and `secondary`. `fromHeaders` maps `x-codex-{primary,secondary}-{used-percent,window-minutes,reset-at}` into the same report. Labels come from the window length: whole days as `<n>d`, whole hours as `<n>h`, otherwise `<n>m` (300 minutes → `5h`, 10080 minutes → `7d`). | Must |
| FR3 | `opencode-go` provides a usage source. `read` sends `GET https://opencode.ai/zen/go/v1/usage` with the stored API key as a bearer token, mapping `usage.rolling`, `usage.weekly` and `usage.monthly` (`percent`, `resetsAt`) to windows labelled `5h`, `weekly` and `monthly`, in that order. A response missing or mis-shaping any of the three is a `malformed` failure. | Must |
| FR4 | xAI and ClinePass declare no usage source. | Must |
| FR5 | nmg-router keeps the selected routed model's status as one structured object: provider identity, active account, model, thinking state, latest usage report and error state. The status line text is produced only by a renderer of that object, and `/usage` entries only by a renderer of usage reports. No call site builds status or usage text by concatenation. | Must |
| FR6 | Usage endpoint reads happen at most once per 60 seconds per provider and active account, counted from the start of the read; a header reading also counts as a read. The last good report and the latest outcome are kept in memory per provider and account. A read is never awaited on the path that answers a routed step and never changes the step's answer; the line re-renders when the reading arrives, only while the same provider and account are still shown without an error. | Must |
| FR7 | A `command.run` hook for `usage` runs Claude Code's built-in command through `next(e)` first, then appends one entry per enabled provider with a stored login, using the active account's latest outcome (reading the endpoint when the throttle allows). If the hook fails, the built-in command still runs. | Must |
| FR8 | A usage read sends only that provider's own stored credential to that provider's own usage endpoint, and no credential reaches the status line, the `/usage` output, logs or `$.store`. | Must |
| FR9 | Model ids, model names and the `/model` picker rows never carry usage figures. | Must |

## Out of Scope

- Anthropic usage in nmg-router's status line; Claude models keep Claude Code's own usage displays.
- Usage for a provider's inactive accounts.
- `/usage` entries for login-free providers.
- Usage readings for xAI and ClinePass logins.
- Usage alerts, toasts or history.
- Changes to Claude Code's built-in `/usage` view itself.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #40 | 2026-10-27 | Initial feature spec |
