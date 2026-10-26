# Tasks: Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors

**Issue**: #3
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Implementation Tasks

### T001: Translation types, SSE splitter and message normalization

**File(s)**: `src/translate/types.ts`, `src/translate/sse.ts`, `src/translate/messages.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `RoutedRequest`, `StreamEvent`, `StreamParser`, `WireAdapter` and `HttpRequestSpec` are declared as the design states, with no `$` access (FR2)
- The SSE splitter yields complete `event`/`data` records from arbitrarily split text pieces
- Message normalization keeps text, tool_use, tool_result and image blocks, drops thinking and redacted_thinking, and replaces images for models without vision (AC4)

### T002: Wire adapters

**File(s)**: `src/translate/adapters/index.ts`, `src/translate/adapters/openai-completions.ts`, `src/translate/adapters/openai-responses.ts`, `src/translate/adapters/codex-responses.ts`, `src/translate/adapters/anthropic-messages.ts`
**Type**: Create
**Depends**: T001, T003
**Acceptance**:
- Each adapter encodes the endpoint, body and headers in the design's table and parses its stream into `StreamEvent`s, including model, text, reasoning, tool calls with accumulated JSON input, stop reason and usage (AC3, FR2)
- The Codex adapter reuses the Responses encoder and parser and applies the body rewrite and Codex headers
- `WIRE_ADAPTERS` maps every `WireFormat` to its adapter

### T003: Reasoning mapping

**File(s)**: `src/translate/reasoning.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `toEffort` maps levels and numeric budgets as the design states; `clamp` keeps exact matches, else the highest supported ≤ requested, else the lowest, and `[]` gives none (AC8, FR7)
- Effort, budget and level mappers write their field; no effort writes nothing

### T004: Chunk mapping

**File(s)**: `src/translate/chunks.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Text and thinking events become chunks at once; tool calls become one `tool` and one whole `input` chunk at `toolEnd`; stop reasons and usage map as the design states, with `usage.model` set to the routed id (AC2, AC3, AC7)

### T005: Transports and selection

**File(s)**: `src/transport/types.ts`, `src/transport/curl.ts`, `src/transport/fetch.ts`, `src/transport/select.ts`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The curl transport spawns curl with the design's argv, puts every header (credential included) and the body only in the stdin config, parses the last header block, streams body pieces, and kills the child when the signal aborts (AC7, FR6)
- The fetch transport sends the same request through `$.http.fetch`; selection uses curl only when `curl --version` exits 0, cached per session (AC7)

### T006: Error classification

**File(s)**: `src/errors/routed-errors.ts`
**Type**: Create
**Depends**: none
**Acceptance**:
- `classify` maps the design's triggers to kinds, reads retry-after from the four headers, and `userMessage` produces the design's texts with no body, header value or credential (AC9, FR8)

### T007: Tool schema generator and offered-tool filter

**File(s)**: `scripts/gen-tool-schemas.mjs`, `src/tools/builtin-schemas.ts`, `src/tools/offered-tools.ts`, `src/tools/mcp-schemas.ts`, `package.json`
**Type**: Create
**Depends**: none
**Acceptance**:
- `npm run tools:schemas` regenerates `src/tools/builtin-schemas.ts` from `BuiltinToolInputs` as the design states, and the generated file is checked in (AC6, FR5)
- `offeredTools` returns definitions only for offered names with a schema, includes MCP tools only when `McpSchemaSource` returns a schema, and logs skipped names to debug (AC6)

### T008: Router, compose capture, status, metrics and version

**File(s)**: `src/routing/router.ts`, `src/routing/turn-step.ts`, `src/routing/compose-capture.ts`, `src/routing/status.ts`, `src/routing/metrics.ts`, `src/version.ts`, `src/providers/builtin/opencode-go.ts`
**Type**: Create
**Depends**: T002, T003, T004, T005, T006, T007
**Acceptance**:
- `isRouted` passes Claude models and unknown providers through with no `$.http`, `$.process` or credential call (AC1, FR1)
- `answer` follows the design's routing steps:
  - request guard first, then the credential from `resolveCredential`;
  - context from compose capture (with a render fallback) and `$.session.messages({ as: "api", agentId })`;
  - one send, and a host check against the provider base URL;
  - nothing yielded before the response model passes `checkResponse` (AC2, AC5, FR3)
- OpenCode Go headers carry `User-Agent: nmg-router/<version>` from the plugin manifest and `x-opencode-session` from `$.session.id()` (AC5, FR4)
- Status text and `metrics.speed` are updated after each routed step; error states persist until the next success (AC7, AC8, AC9)

### T009: Hook wiring

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T008
**Acceptance**:
- Registers `prompt.compose` capture and `turn.step` with `.catch(routeStepFailed)`. A routed failure yields the error text and an `end_turn` stop without calling `next`; a Claude step's failure replays `next(e)` (AC9, FR1, FR8)

### T010: Engine fakes and SSE fixtures

**File(s)**: `tests/support/fake-engine.ts`, `tests/support/fake-turn.ts`, `tests/fixtures/sse/`
**Type**: Modify
**Depends**: none
**Acceptance**:
- The fake engine supports a scripted `process.spawn` (pieces, exit code, recorded argv/env/input, abort on `return()`), `session.messages`, `session.id`, `prompt.compose`, `tool.list`, `plugin`, and records `ui.status`
- `fake-turn.ts` drives a `turn.step` hook with a spy `next` and collects chunks; SSE fixtures for each wire format contain no credential-shaped values

### T011: Translation tests

**File(s)**: `tests/translate/openai-completions.test.ts`, `tests/translate/openai-responses.test.ts`, `tests/translate/codex-responses.test.ts`, `tests/translate/anthropic-messages.test.ts`, `tests/translate/reasoning.test.ts`, `tests/translate/messages.test.ts`
**Type**: Create
**Depends**: T002, T003, T004, T010
**Acceptance**:
- AC3: each fixture stream, split into random pieces, maps to the same text, thinking, tool (name, id, JSON input), stop and usage chunks
- AC8: `high` and `max` against efforts `["low","medium"]` give `medium`; the effort, budget and level transports each write their field; a non-reasoning model gets none
- AC4: Claude thinking blocks are absent from every encoded request

### T012: Routing tests

**File(s)**: `tests/routing/passthrough.test.ts`, `tests/routing/agentic-turn.test.ts`, `tests/routing/switching.test.ts`, `tests/routing/guard-identity.test.ts`, `tests/routing/streaming.test.ts`, `tests/routing/thinking-status.test.ts`, `tests/routing/errors.test.ts`
**Type**: Create
**Depends**: T009, T010
**Acceptance**:
- AC1: Claude ids and aliases yield exactly what `next(e)` yields, with zero spawn, HTTP and credential-store calls
- AC2: three steps (Read, Edit, final text) each send the captured system prompt, the session messages including earlier tool calls and results, and only the offered tools; `next` is never called; the last step yields the final text and `end_turn`
- AC4: a routed request after Claude turns contains them; a following Claude step passes through
- AC5: a response naming `anthropic/claude-opus-5-5` yields no content chunk; OpenCode Go requests in one session share one `x-opencode-session` and send `User-Agent: nmg-router/<plugin.json version>`; request hosts equal the provider host
- AC7: text chunks appear before the fake child finishes; the tool chunk appears only after its input completes; the credential and body appear only in spawn `input`; an aborted signal stops chunks and ends the child; `metrics.speed` holds TTFT and tokens per second; with `curl` absent the same provider URL is fetched
- AC8: the status line reads `<model id> · thinking medium` or `· thinking unsupported`
- AC9: each failure yields its message and `end_turn`, sets the status error state until a later success, never calls `next`, records exactly one provider request (zero for a missing login), and a throwing router is answered by the `.catch` handler without `next`

### T013: Tool schema tests and leak test

**File(s)**: `tests/tools/builtin-schemas.test.ts`, `tests/tools/offered-tools.test.ts`, `tests/hygiene/routing-sentinel.test.ts`
**Type**: Create
**Depends**: T007, T009, T010
**Acceptance**:
- AC6: the in-memory regeneration equals the checked-in registry and covers every `BuiltinToolInputs` key; each schema is an object schema; only offered tools are sent; an MCP tool without a schema is left out and named in a debug log
- FR8: a sentinel credential driven through every routed success and error path passes `assertNoSentinel` (spawn `input` excepted) and is absent from yielded chunks and the status line

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #3 | 2026-10-25 | Initial feature tasks |
