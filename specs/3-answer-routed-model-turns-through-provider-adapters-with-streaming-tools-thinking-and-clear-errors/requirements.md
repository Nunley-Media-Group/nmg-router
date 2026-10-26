# Requirements: Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors

**Issue**: #3
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## User Story

**As a** developer who picks a routed model in Claude Code
**I want** each turn answered by that model's provider, streamed as it is generated, with Claude Code's own tools, my effort setting and clear errors
**So that** a routed model completes full agentic turns in my one Claude Code session, while Claude models still go straight to Anthropic

## Background

A `turn.step` hook that yields chunks without calling `next` answers the step itself. Claude Code accepts a non-Claude model id on a subscription login, runs routed models' tool calls through its own tools, and keeps context when a session moves between a Claude model and a routed model.

`turn.step` does not carry the system prompt, the offered tools or the conversation:
- The system prompt and the offered tool names come from `prompt.compose`.
- The conversation comes from `$.session.messages({ as: "api" })`.
- The session id comes from `$.session.id()`.

The mods API exposes tool names but not their input schemas. The schemas come from the installed Claude Code's `claude-code-tools` declarations, converted by a project script into a checked-in registry.

A `turn.step` hook that throws or overruns is skipped and Claude Code sends the step itself, so routed failures are caught and answered with an error message.

`$.http.fetch` returns whole responses. `$.process.spawn` streams child output, and every supported OS ships `curl`, so streaming needs no extra install.

`turn.step` carries Claude Code's effort (`low` to `max`, or a token budget). Providers express reasoning as an effort parameter, a token budget or a named level. Like oh-my-pi, the requested level is clamped to the model's supported efforts.

Each wire format is a pluggable adapter: OpenAI Chat Completions, OpenAI Responses (with the Codex dialect) and Anthropic Messages. Transports, reasoning mappers and error classification are separate parts behind interfaces. oh-my-pi's sources are the reference for each part, and none of its code is copied.

No routed request is answered by another provider, account, model or Claude.

The provider catalog, `ProviderPlugin` wire resolution, `resolveCredential`, the Anthropic guard and the credential vault exist. Nothing answers `turn.step` yet.

## Acceptance Criteria

### AC1: Claude passthrough untouched

**Given** a step whose model is a Claude model (`claude-…`, an alias such as `haiku`, or any id whose provider part is not a catalog provider)
**When** `turn.step` fires
**Then** the hook yields `next(e)` unchanged, starts no HTTP request or subprocess, and reads no credential

### AC2: Full agentic routed turn

**Given** a step for `opencode-go/kimi-k3.1-pro` with a stored credential, and faked provider responses that call `Read`, then `Edit`, then answer
**When** each step fires
**Then**:
- each request carries the system prompt captured in `prompt.compose`, the conversation from `$.session.messages({ as: "api" })` (including earlier tool calls and results), and the offered tools;
- the hook yields text, tool, input and stop chunks without calling `next`;
- the turn ends with the model's final text.

### AC3: Three wire formats

**Given** faked OpenAI Chat Completions, OpenAI Responses (including the Codex dialect) and Anthropic Messages streams
**When** each is translated
**Then** text, tool calls (name, id, JSON input), reasoning, stop reason and usage map to the same engine chunks

### AC4: Switching keeps context

**Given** a session that answered on a Claude model
**When** the user switches to a routed model and back
**Then** the routed request contains the Claude turns, with Claude thinking blocks left out, and the next Claude step passes through unchanged with the routed turns in the transcript

### AC5: Guard and identity on every request

**Given** any routed step
**When** it is sent and answered
**Then**:
- the Anthropic request guard runs before sending;
- no chunk is yielded until the response's model passes the response guard;
- every request goes only to the provider's base URL host;
- OpenCode Go requests carry one `x-opencode-session` id for the whole session and `User-Agent: nmg-router/<version>`, where the version is the plugin manifest's.

### AC6: Tool schemas

**Given** the installed Claude Code's `claude-code-tools` declarations
**When** the schema generation script runs and a step offers a subset of tools
**Then**:
- a checked-in schema registry covers every built-in tool, and a test fails if the registry is stale;
- only the offered tools are sent, each with a valid JSON schema;
- an offered MCP tool is sent with its schema when the mods API exposes one, or else left out and named in a debug log.

### AC7: Streaming

**Given** a faked streaming child that emits SSE events in pieces for each wire format
**When** a routed step runs
**Then**:
- text chunks are yielded as events arrive, and tool calls once their input is complete;
- the credential and body go on stdin, never in argv or the environment;
- an interrupt terminates the child and stops chunks;
- time to first token and tokens per second are recorded per model;
- where no system `curl` exists, the same provider is called through the whole-response path.

### AC8: Thinking levels

**Given** routed models with effort, budget and level reasoning transports, a model supporting only `low` and `medium`, and a non-reasoning model
**When** steps arrive with effort `high` and with `max`
**Then**:
- each request carries its provider's field for the effort, clamped to the model's supported efforts (`max` becomes `medium`);
- the non-reasoning model gets no reasoning field;
- the status line shows the routed model id and the effective thinking level, or that thinking is unsupported.

### AC9: Clear errors, never a fallback

**Given** a missing login, a 401/403, a 429 with retry-after, quota exhaustion, a 5xx, a network failure, an unparseable response, or a hook failure during a routed step
**When** the routed step runs
**Then**:
- it ends with a message naming the provider and the failure (for a missing login: "Not logged in to <provider>. Run /login."), with no credential in it;
- the status line shows the provider's error state until the next success;
- `next` is never called, and no request is sent to any other provider, account, model or to Claude.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A `turn.step` hook, with a `.catch` handler, that passes Claude models through and routes catalog-provider models | Must |
| FR2 | Pluggable wire adapters (pure request encoders and stream parsers) for Chat Completions, Responses with the Codex dialect, and Anthropic Messages | Must |
| FR3 | Credentials come from `resolveCredential` and are sent only to the provider's host | Must |
| FR4 | A stable per-session id and an honest, versioned user agent for OpenCode Go | Must |
| FR5 | A generated built-in tool schema registry with a staleness test; per-step tool filtering; MCP schemas where exposed | Must |
| FR6 | A streaming `curl` transport through `$.process.spawn` with stdin-only secrets and abort on interrupt; a whole-response `$.http.fetch` transport; speed metrics | Must |
| FR7 | Effort-to-reasoning mapping with clamping across effort, budget and level transports; thinking chunks; a status-line segment | Must |
| FR8 | Typed error classification, user-facing messages, status-line error states, and no fallback | Must |

## Out of Scope

- An `auto` thinking level
- Keeping routed thinking in the saved transcript
- Automatic retries with backoff
- Hand-written MCP schema overrides
- Routed compaction, subagent permissions and auto-mode permission verdicts
- The `/model` picker rows

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #3 | 2026-10-25 | Initial feature spec |
