# Design: Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors

**Issue**: #3
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/2-add-the-provider-catalog-with-provider-aware-login-and-logout/

## Overview

A thin `turn.step` hook asks a `Router` whether the step's model is routed.

- **Claude steps:** `return yield* next(e)`.
- **Routed steps:** the router builds one normalized `RoutedRequest`, encodes it with the model's `WireAdapter`, and sends it once through a `Transport`. It then streams the parser's normalized events back as engine chunks.

The hook is registered with `.catch`, so a thrown error or overrun on a routed step still ends in an error message and never reaches `next`.

Every part sits behind a small interface, and the router depends only on those interfaces:

- **Open-closed:** a new wire format is one adapter module plus one registry entry, and a dialect (Codex) wraps an adapter.
- **Single responsibility:** encoding, parsing, transport, reasoning mapping and error classification each live in their own module.
- **Dependency inversion:** host calls go through narrow `Pick<EngineInterface, ...>` dependencies.

Translation, reasoning mapping, SSE parsing and error classification are pure functions under `src/translate/` and `src/errors/`.

oh-my-pi's sources are the reference for each part (paths relative to the installed `@oh-my-pi/` directory, version 17.3.7, unless noted). No code is copied.

## Architecture

```text
hooks/register.ts                 on("prompt.compose", capture); on("turn.step", routeStep).catch(routeStepFailed)
src/routing/router.ts             createRouter(services): isRouted(model), answer($, e, signal) → AsyncGenerator<TurnStepChunk>
src/routing/turn-step.ts          routeStep / routeStepFailed hook bodies (thin)
src/routing/compose-capture.ts    keeps the latest non-analysis compose per model: { system, toolNames }
src/routing/status.ts             status-line text: model, thinking level, error state
src/routing/metrics.ts            TTFT and tokens/sec per model → $.store "metrics.speed" and debug log
src/translate/types.ts            RoutedRequest, StreamEvent, WireAdapter, StreamParser, HttpRequestSpec
src/translate/messages.ts         ApiMessage[] → normalized turns (drops thinking; image and tool-result handling)
src/translate/adapters/index.ts   WIRE_ADAPTERS: Record<WireFormat, WireAdapter>   (the one map to extend)
src/translate/adapters/openai-completions.ts | openai-responses.ts | anthropic-messages.ts | codex-responses.ts
src/translate/sse.ts              incremental SSE line/event splitter (pure)
src/translate/reasoning.ts        toEffort(effort|budget), clamp(effort, supported), ReasoningMapper per transport
src/translate/chunks.ts           StreamEvent → TurnStepChunk (block indexes, tool input buffering, stop mapping)
src/transport/types.ts            Transport: send(spec, signal) → { status, headers, body: AsyncIterable<string> }
src/transport/curl.ts             streaming transport over $.process.spawn("curl", …) with a stdin config
src/transport/fetch.ts            whole-response transport over $.http.fetch
src/transport/select.ts           picks curl when `curl --version` runs, else fetch (cached per session)
src/tools/builtin-schemas.ts      generated: BUILTIN_TOOL_SCHEMAS: Record<string, JsonSchema>
src/tools/offered-tools.ts        offeredTools(names, $.tool.list(), registry, mcpSchemas) → ToolDef[] + skipped names
src/tools/mcp-schemas.ts          McpSchemaSource interface; the runtime source returns undefined (no API exposes them)
src/errors/routed-errors.ts       RoutedError kinds, classify(status, headers, body|failure), userMessage(provider)
src/providers/builtin/opencode-go.ts (modify) request headers: User-Agent nmg-router/<version>, x-opencode-session
src/version.ts                    pluginVersion($): reads version from <plugin.root>/.claude-plugin/plugin.json once
scripts/gen-tool-schemas.mjs      claude-code-tools d.ts (BuiltinToolInputs) → src/tools/builtin-schemas.ts
```

### Reference map (oh-my-pi, reference only)

| Part | oh-my-pi reference |
|------|--------------------|
| Wire plug-in point | `pi-ai/src/api-registry.ts` (`registerCustomApi`), `pi-ai/src/types.ts` (`StreamFunction`, event union, `StopReason`) |
| Chat Completions encode/parse | `pi-ai/src/providers/openai-completions.ts`, `pi-ai/src/providers/openai-shared.ts` (`applyChatCompletionsCompatPolicy`, usage accounting) |
| Responses encode/parse | `pi-ai/src/providers/openai-responses.ts`, `pi-ai/src/providers/openai-shared.ts` (`processResponsesStream`) |
| Codex dialect | `pi-ai/src/providers/openai-codex-responses.ts`, `pi-ai/src/providers/openai-codex/request-transformer.ts` |
| Anthropic Messages encode/parse | `pi-ai/src/providers/anthropic.ts` |
| Effort levels, clamp, transports, budgets | `pi-catalog/src/effort.ts`, `pi-catalog/src/model-thinking.ts` (`clampThinkingLevelForModel`, `inferThinkingControlMode`), `pi-ai/src/stream.ts` (budget table) |
| Error classes, retry-after | `pi-ai/src/error/flags.ts`, `pi-ai/src/error/rate-limit.ts`, `pi-ai/src/error/provider.ts`, `pi-ai/src/utils/retry-after.ts` |
| OpenCode Go session header | 18.12.6 `packages/ai/src/providers/inference-headers.ts` |
| TTFT / tokens per second | `pi-ai/src/providers/openai-completions.ts` (ttft), `pi-coding-agent/src/utils/token-rate.ts` |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `routeStep($, e, next)` | `TurnStepInput` | `AsyncGenerator<TurnStepChunk>` | Not routed → `return yield* next(e)`; routed → `yield* router.answer($, e, next.signal)`; never calls `next` for a routed model |
| `routeStepFailed($, e, next)` (`.catch`) | `TurnStepInput`, `next.error` | generator | Not routed → `return yield* next(e)` (replay-safe); routed → yields the error text and an `end_turn` stop, and sets the status error state |
| `router.isRouted(model)` | step model id | `boolean` | True iff `parseModelId(model)` names a catalog provider (built-in or custom). No credential or network call |
| `WireAdapter` | — | `{ wire, encode(req: RoutedRequest, ctx) → HttpRequestSpec, parser() → StreamParser }` | `ctx` = `{ plugin, credential, sessionId, version }` |
| `StreamParser` | — | `{ push(text) → StreamEvent[], end() → StreamEvent[] }` | Incremental; `end()` emits the terminal or `malformed` event |
| `StreamEvent` | — | `model{id} \| text{block,text} \| thinking{block,text} \| toolStart{block,id,name} \| toolInput{block,json} \| toolEnd{block} \| stop{reason,usage} \| error{kind,message}` | `reason` ∈ `end \| length \| tool \| refusal` |
| `Transport.send(spec, signal)` | `{ url, method, headers, body }` | `{ status, headers, body: AsyncIterable<string> }` / throws `network` | One call per step; never retries |
| `RoutedRequest` | — | `{ model, system, turns, tools: ToolDef[], reasoning?: { effort } , maxOutput? }` | Wire-neutral; built once per step |
| `toEffort(effort)` | `ModelEffort \| number \| undefined` | `Effort \| undefined` | Numbers: ≤1024 `minimal`, ≤4096 `low`, ≤8192 `medium`, ≤16384 `high`, ≤32767 `xhigh`, else `max` |
| `clamp(effort, supported)` | effort, supported list | `Effort \| undefined` | Exact match kept; else the highest supported ≤ requested; else the lowest supported; `[]` → `undefined` |
| `classify(outcome)` | HTTP status + headers + body, or a transport/parse failure | `RoutedError` | See Errors |
| `pluginVersion($)` | — | `string` | `version` from `<$.plugin.root>/.claude-plugin/plugin.json` (falls back to `<root>/plugin.json`), read once |

## Routing

1. `isRouted` false → passthrough. This is pure string work, with no `$.http`, `$.process` or credential call.
2. Resolve the provider plugin and, from the catalog, the model's `CatalogModel` (wire, base URL, efforts, max output). If the model is missing from the catalog, use `plugin.wire(model)` and no metadata.
3. `checkRequest({ provider, model: e.model, baseUrl })` from `src/gateway/guard.ts`; a refusal is a `refused` error.
4. Credential: `resolveCredential` for the active account. Having none is `not_logged_in`, with no network call.
5. Context:
   - `system` and `toolNames` come from `compose-capture` for `e.model`. When nothing is captured yet, `$.prompt.compose({ model: e.model })` is rendered and its sections joined.
   - Messages come from `$.session.messages({ as: "api", agentId: e.agentId })`, and a deny result is an `unreadable_context` error.
   - The session id comes from `$.session.id()`.
6. Tools: `offeredTools(toolNames, …)`.
7. Reasoning: `clamp(toEffort(e.effort), model.reasoningEfforts)`.
8. Encode with `WIRE_ADAPTERS[wire]`, then assert that `new URL(spec.url).host` equals the provider base URL host.
9. Send once through the selected transport.
10. Stream:
    - Events are fed to the parser, and `chunks.ts` turns them into engine chunks.
    - Nothing is yielded before a `model` event passes `checkResponse`. A stream that ends without one is `malformed`, and its content is dropped.
    - After the terminal stop, the status line is updated (model and thinking level), metrics are recorded, and any error state is cleared.

**Compose capture:**
- The `prompt.compose` hook calls `const r = await next(e)` and returns `r` untouched.
- When `e.traits` has no `analysis` trait, it stores `{ system: sections joined in order with "\n\n", toolNames: e.tools }` under `e.model`.

**Messages** (`src/translate/messages.ts`):
- Text, `tool_use`, `tool_result` (with `is_error`) and `image` blocks are kept. Every `thinking` and `redacted_thinking` block is dropped.
- For a model without vision, an image becomes the text `(image omitted: <model> has no image input)`.
- The first message is a user message, as `$.session.messages` guarantees.

**Chunks** (`src/translate/chunks.ts`):
- Block indexes are assigned in order of appearance.
- `text` and `thinking` events are yielded at once as `{ kind: "text" | "thinking", index, text }`.
- A tool call's `toolInput` pieces are buffered until `toolEnd`. Then one `{ kind: "tool", index, id, name }` is yielded, followed by one `{ kind: "input", index, json }` with the whole input, and invalid JSON becomes `{}`. An empty provider id becomes `call_<turnId>_<index>`.
- Stop mapping: `end` → `end_turn` (`tool_use` when the response had tool calls), `length` → `max_tokens`, `tool` → `tool_use`, `refusal` → `refusal`.
- Usage: `{ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, model: e.model }`, or `null` when the provider sent none.

## Wire Adapters

| Wire | Endpoint | Body | Reasoning | Parser events |
|------|----------|------|-----------|---------------|
| `openai-completions` | `<baseUrl>/chat/completions` | `model, messages` (system as `system` message; assistant `tool_calls` with JSON-string `arguments`; `role:"tool"` results with `tool_call_id`; images as `image_url` data URLs; tool-result images in a following user message), `tools:[{type:"function",function:{name,description,parameters}}]`, `max_tokens`, `stream:true`, `stream_options:{include_usage:true}` | `reasoning_effort` | `chunk.model`; `delta.content`; `delta.reasoning_content \| reasoning \| reasoning_text`; `tool_calls[].index` with concatenated `function.arguments`; `finish_reason` `stop`→end, `length`→length, `tool_calls`→tool, `content_filter`→refusal; `usage.prompt_tokens/completion_tokens/prompt_tokens_details.cached_tokens` |
| `openai-responses` | `<baseUrl>/responses` | `model, instructions, input` (`message` items with `input_text`/`input_image`; `function_call{call_id,name,arguments}`; `function_call_output{call_id,output}`), `tools:[{type:"function",name,description,parameters}]`, `max_output_tokens`, `store:false`, `stream:true` | `reasoning:{effort, summary:"auto"}` | `response.created.response.model`; `response.output_item.added`; `response.output_text.delta`; `response.reasoning_summary_text.delta \| reasoning_text.delta`; `response.function_call_arguments.delta/.done`; `response.output_item.done`; `response.completed` → end (tool when calls exist), `response.incomplete` → length; `error`/`response.failed` → error; `usage.input_tokens/output_tokens/input_tokens_details.cached_tokens` |
| `openai-codex-responses` | `<baseUrl>/codex/responses` | the Responses body, then rewritten: `store:false`, `stream:true`, `include:["reasoning.encrypted_content"]`, `prompt_cache_key:<sessionId>`, with `max_output_tokens` and sampling fields deleted | `reasoning:{effort, summary:"auto"}` | as Responses |
| `anthropic-messages` | `<baseUrl>/v1/messages` | `model, system:[{type:"text",text}], messages` (consecutive `tool_result` blocks merged into one user message; a `Continue.` user message between back-to-back assistant messages), `tools:[{name,description,input_schema}]`, `max_tokens` (model max output, else 16384; at least budget + 4000), `stream:true` | budget: `thinking:{type:"enabled",budget_tokens}` | `message_start.message.model` and usage; `content_block_start` `text`/`thinking`/`tool_use{id,name}`; `content_block_delta` `text_delta`/`thinking_delta`/`input_json_delta.partial_json`; `content_block_stop`; `message_delta.stop_reason` `end_turn`/`stop_sequence`→end, `max_tokens`→length, `tool_use`→tool, `refusal`→refusal |

**Headers per request:**
- **All requests:** `content-type: application/json`, `accept: text/event-stream`, plus `plugin.identity.headers(ctx)`.
- **Credential:** `Authorization: Bearer <token>`. OpenCode Go on `anthropic-messages` uses `x-api-key: <token>` instead, with `anthropic-version: 2023-06-01`.
- **OpenCode Go:** `User-Agent: nmg-router/<version>` and `x-opencode-session: <sessionId>`.
- **Codex:** the #2 Codex headers, plus `session_id: <sessionId>` and `conversation_id: <sessionId>`.

**Reasoning mappers** (`ReasoningMapper` per transport; the transport comes from model metadata, else the wire default):
- **effort** (Chat Completions and Responses default): writes the clamped effort into the wire's effort field.
- **budget** (Anthropic Messages default): `minimal` 1024, `low` 4096, `medium` 8192, `high` 16384, `xhigh` 32768, `max` 32768 tokens.
- **level**: the model metadata `reasoning: { transport: "level", field, levels: Record<Effort, string | boolean> }` sets `field` (a dotted path) to `levels[effort]`.
- **Absent:** no clamped effort (a non-reasoning model, or no effort on the step) writes no reasoning field.

## Transports

**curl** (`src/transport/curl.ts`):
- `$.process.spawn({ argv: ["curl", "--silent", "--show-error", "--no-buffer", "--include", "--proto", "=https", "--connect-timeout", "30", "--config", "-", <url>], input: <config> })`.
- `<config>` holds `request = "POST"`, one `header = "<name>: <value>"` line per header (credential included) and `data-binary = "<body>"`. Each value is quoted with `\` and `"` escaped. The URL is the only argv value taken from the request, and nothing goes in `env`.
- The response status line and headers (`--include`) are parsed first, using the last header block so `100 Continue` and proxy blocks are skipped. The body then streams as text pieces.
- A non-2xx status reads the whole body for classification.
- A non-zero curl exit before any status is a `network` error.
- `signal` abort calls `return()` on the spawn stream, which kills the child, and the router stops yielding.

**fetch** (`src/transport/fetch.ts`): `$.http.fetch(url, { method, headers, body })`. The whole text is fed through the same parser at once.

**Selection:** once per session, `$.process.run(["curl", "--version"])`. If it exits 0, curl is used; if it cannot start or fails, fetch is used.

**Metrics** (`src/routing/metrics.ts`):
- `ttftMs` is measured from send to the first text, thinking or tool event, and `durationMs` from send to stop. Tokens per second is `output_tokens * 1000 / durationMs` when usage exists and `durationMs ≥ 100`.
- The latest value per model is stored in `$.store` `metrics.speed` as `{ [modelId]: { ttftMs, tokensPerSecond?, at } }`, and also written as a `$.ui.log(…, { to: "debug" })` line.

## Tool Schemas

**Generation:** `scripts/gen-tool-schemas.mjs` (npm script `tools:schemas`) uses the TypeScript compiler API, already a devDependency, on `.claude-plugin/types/claude-code-tools/index.d.ts`. For every property of `BuiltinToolInputs` it emits a JSON Schema:
- object types → `type:"object"`, with `properties`, `required` (non-`?` keys) and `additionalProperties:false`;
- `string`, `number` and `boolean` → their schema types;
- string-literal unions → `enum`;
- arrays → `items`;
- `Record<string, T>` → `additionalProperties`;
- JSDoc → `description`.

An unsupported construct becomes `{}`, and the script names it on stderr. The output is `src/tools/builtin-schemas.ts`, sorted by tool name with a header naming the source Claude Code version.

**Staleness test:** the test runs the generator in memory and requires byte equality with the checked-in file, plus one entry per `BuiltinToolInputs` key.

**Offered tools** (`offeredTools`):
- For each name in `toolNames`, the description comes from `$.tool.list()`.
- A registry schema makes a `ToolDef`.
- An `mcp: true` tool is included only if `McpSchemaSource.schema(name)` returns one. The runtime source returns `undefined`, because no mods API call exposes MCP schemas.
- Every skipped name is written once per step to a debug log line: `routed request left out tools without a schema: <names>`.

## Errors

`RoutedError` kinds and messages (`<Provider>` is the plugin name):

| Kind | Trigger | Message |
|------|---------|---------|
| `not_logged_in` | no stored credential | `Not logged in to <Provider>. Run /login.` |
| `unauthenticated` | 401/403, or `refresh_failed` | `<Provider> rejected the login (HTTP <status>). Run /login.` |
| `rate_limited` | 429 without a quota code | `<Provider> rate limit reached. Retry after <n> s.` (`n` from `retry-after-ms`, `retry-after` seconds or HTTP date, `x-ratelimit-reset-ms`, `x-ratelimit-reset`; the clause is left out when none is present) |
| `quota_exhausted` | 402, or 429 whose body code is `insufficient_quota`/`usage_limit_reached` or whose text names a usage limit | `<Provider> quota is used up.` |
| `server_error` | ≥500 | `<Provider> server error (HTTP <status>).` |
| `network` | curl exits before a status; fetch rejects | `Could not reach <Provider>.` |
| `malformed` | unparseable event, no terminal event, or no model in the response | `<Provider> sent a response nmg-router could not read.` |
| `provider_error` | any other 4xx, an error event, a `content_filter` incomplete status | `<Provider> refused the request (HTTP <status>).` |
| `refused` | Anthropic request guard or response guard | the guard error's message |
| `unreadable_context` | `$.session.messages` deny | `nmg-router could not read this conversation for <Provider>.` |
| `internal` | a hook failure caught by `.catch` | `nmg-router failed to answer with <Provider>.` |

An error is answered by yielding `{ kind: "text", index, text: message }` and `{ kind: "stop", stopReason: "end_turn", usage: null }`, and by setting the status line to `<model id> · <Provider> error: <kind>`. A later successful step clears it. Messages never include a response body, credential, header value or stderr.

## State and UI Behavior

The status line (`$.ui.status`) after a routed step reads `<model id> · thinking <effort>`, `<model id> · thinking off` (a reasoning model with no effort), or `<model id> · thinking unsupported`. The error state shown above takes its place until the next success. A Claude step leaves the status line untouched.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `WireAdapter` registry with dialect wrappers | Selected | One module per wire format; Codex reuses the Responses parser |
| `curl` over `$.process.spawn` with a stdin config | Selected | Streams with no install; secrets never in argv or env |
| `$.http.fetch` only | Rejected | Returns whole responses; no streaming |
| Throwing on routed errors | Rejected | A failed hook is skipped and `next(e)` sends the step to Claude |
| Correlating compose by turn id | Rejected | `prompt.compose` carries no turn id; captured per model with a render fallback |
| Hand-written tool schemas | Rejected | Drift; generated from the installed declarations with a staleness test |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #3 | 2026-10-25 | Initial feature design |
