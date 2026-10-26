# Design: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## Overview

Three additions sit on #3's router, each behind a small interface:

1. **Routed compaction.** A `session.compact` hook resolves the model of the transcript being compacted (the main loop or the agent). For a routed model it builds a summarization request and runs it through a new `router.complete()`. `router.complete()` uses the same guard, credential, wire adapter and transport pipeline as a routed step, but collects text instead of yielding chunks.
2. **Session tracking.** A `SessionTracker` records, per loop (`main` or an `agentId`), the latest step model, the routed context tokens from the last stop usage, and the tool ids emitted by routed steps. A `turn.complete` hook applies the mod's own threshold on the main loop.
3. **Routed auto-mode permissions.** A `tool.check` hook uses a `PermissionPolicy` strategy (`claude-classifier` or `server-classifier-off`), chosen by the `/config` row or by login presence. It acts only on routed calls in auto mode whose core verdict is an unsettled `ask`.

`hooks/register.ts` stays thin. oh-my-pi's sources are the reference for each part (paths relative to `@oh-my-pi/`, 17.3.7). No code is copied.

## Architecture

```text
hooks/register.ts                    adds: on("session.compact").catch; on("turn.complete"); on("tool.check").catch;
                                     classic permission-mode observers
src/routing/session-tracker.ts       per loop key ("main" | agentId): model, contextTokens; routedToolIds (bounded set)
src/routing/router.ts                (modify) record model/usage/tool ids in the tracker; add complete(model, request, signal) → text;
                                     status line only for the main loop
src/compaction/compact-hook.ts       compactSession($, e, next, services)
src/compaction/summary-request.ts    pure: SessionMessage[] + instructions → RoutedRequest (system + one user message)
src/compaction/summary-prompt.ts     summarization system prompt and section instructions (text constants)
src/compaction/threshold.ts          pure: thresholdTokens(window) and shouldCompact(tokens, window)
src/compaction/auto-trigger.ts       onTurnComplete($, e, services): main-loop threshold check → $.session.compact()
src/permissions/mode.ts              effectiveMode(rowValue, hasFirstPartyLogin) and readMode($, options)
src/permissions/policy.ts            PermissionPolicy interface; claudeClassifierPolicy; serverClassifierOffPolicy
src/permissions/tool-check.ts        checkRoutedTool($, e, next, services)
src/permissions/permission-mode.ts   tracks the latest permission_mode from classic events
.claude-plugin/plugin.json           (modify) userConfig.routedAutoPermissions
```

### Reference map (oh-my-pi, reference only)

| Part | oh-my-pi reference |
|------|--------------------|
| Summarization prompt and sections | `pi-agent-core/src/compaction/prompts/summarization-system.md`, `compaction-summary.md`, `compaction-summary-context.md` |
| Transcript serialization for the summarizer | `pi-agent-core/src/compaction/utils.ts` (role tags, 2000-character tool-result cut, images dropped) |
| Custom instructions | `pi-agent-core/src/compaction/compaction.ts` (`Additional focus:`) |
| Threshold and reserve | `pi-agent-core/src/compaction/compaction.ts` (`resolveThresholdTokens`, reserve `max(15%, 16384)`) |
| Summary budget | `pi-agent-core/src/compaction/compaction.ts` (`MAX_SUMMARY_TOKENS`, `0.8 × reserve`) |
| Failure leaves the session uncompacted | `pi-coding-agent/src/session/session-maintenance.ts` (auto-compaction end with error) |
| Subagents compact on their own model | `pi-coding-agent/src/task/executor.ts`, `pi-coding-agent/src/session/session-maintenance.ts` |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `compactSession($, e, next)` | `SessionCompactInput` | `SessionCompactResult` | Model = `tracker.model(e.agentId ?? "main")`, else `$.session.model()` for main. Not routed → `return next(e)`. Routed + `precompute` → `{ skip: "nmg-router compacts routed sessions when compaction runs." }`. Routed otherwise → summarize; success → `{ messages: [summaryMessage] }`; failure → `{ skip }` |
| `compactSession` `.catch` | same, `next.error` | `SessionCompactResult \| undefined` | Routed → `{ skip: "<Provider> could not summarize this conversation; it was not compacted." }`; not routed → `undefined` (core runs) |
| `router.complete(model, request, signal)` | routed model id, `RoutedRequest` | `string` / throws `RoutedError` | Guard, credential, adapter, one transport send, response guard; joins `text` events; ignores thinking; errors classified as in #3 |
| `buildSummaryRequest(messages, instructions, model)` | `SessionMessage[]`, optional text | `RoutedRequest` | No tools, no reasoning, `maxOutput = min(model.maxOutput ?? 16384, 13107)` |
| `thresholdTokens(window)` | catalog context window | `number` | `window - max(floor(0.15 × window), 16384)` |
| `onTurnComplete($, e)` | `TurnCompleteInput` (main loop) | — | When the main model is routed with a known window and `tracker.contextTokens("main") ≥ thresholdTokens(window)`, schedules `$.session.compact()` with `$.clock.after(0, …)`; a rejection is debug-logged and retried at the next turn end |
| `SessionTracker` | — | `recordStep(loop, model)`, `recordUsage(loop, usage)`, `recordToolId(id)`, `isRoutedTool(id)`, `model(loop)`, `contextTokens(loop)` | `contextTokens` = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens` from the last routed stop, reset to 0 after a compaction of that loop; routed tool ids are kept for the 1024 most recent |
| `effectiveMode(row, hasLogin)` | row value or undefined, boolean | `"claude-classifier" \| "server-classifier-off"` | A set row wins; unset → `claude-classifier` when `hasLogin`, else `server-classifier-off` |
| `PermissionPolicy.decide($, call)` | `{ tool, input }` | `ToolCheckResult` | See Permissions |
| `checkRoutedTool($, e, next)` | `ToolCheckInput` | `ToolCheckResult` | See Permissions |

## Compaction

**Summary request** (`summary-request.ts`, pure):
- System prompt: summarize a user–coding-assistant conversation in the given structure, never continue the conversation, and output only the summary.
- User message: `<conversation>` followed by the serialized transcript and `</conversation>`, then the section instructions:
  - `## Goal`
  - `## Constraints & Preferences`
  - `## Progress` with `### Done`, `### In Progress` and `### Blocked`
  - `## Key Decisions`
  - `## Next Steps`
  - `## Critical Context`
  - Keep exact file paths, function names and error messages, and keep any pending user request word for word.
- When `instructions` is present, `Additional focus: <instructions>` is appended.
- Serialization of each `SessionMessage`, in order:
  - `[User]: <text>` or `[Assistant]: <text>`;
  - one `[Tool Call]: <tool>(<JSON input>)` per `toolUses` entry;
  - one `[Tool Result]: <text>` per tool result, cut to 2000 characters with `[... N more characters truncated]`.
- Images and thinking are left out.

**Result:**
- One message without a handle: `{ role: "user", text: "This session continues from an earlier conversation that was compacted by <model id>. Summary of the earlier conversation:\n\n<summary>\n…\n</summary>", toolUses: [] }`.
- An empty summary is a failure.

**Failure:** any `RoutedError`, an empty summary, or an abort answers `{ skip: "<Provider> could not summarize this conversation (<kind>); it was not compacted." }`. `next` is never called for a routed model, and no request goes to Anthropic.

**Main-loop threshold** (`auto-trigger.ts`):
- The window comes from the routed model's catalog `contextWindow`; models without one rely on the engine's own trigger.
- For 128000, the threshold is 108800.
- The `.catch` on `session.compact` also covers engine-started (`auto`) compaction.

## Subagents

- The router records `tracker.recordStep(e.agentId ?? "main", e.model)` for every step (Claude and routed). Routed steps also record their usage and each emitted tool id.
- Routed subagent steps read `$.session.messages({ as: "api", agentId })`, as #3 already does.
- The system prompt is the latest captured non-analysis compose for the step's model. `prompt.compose` carries no agent id, so two parallel agents on the same model share the latest capture.
- Subagent steps do not touch the main status line.
- A subagent's compaction (`e.agentId` set) resolves the agent's own model through the tracker.

## Permissions

**Configuration:** `.claude-plugin/plugin.json` gains:
`"userConfig": { "routedAutoPermissions": { "type": "string", "title": "Routed auto-mode permissions", "description": "How auto mode decides tool calls from routed models", "options": ["claude-classifier", "server-classifier-off"] } }`
- The row has no default.
- `readMode` reads the current value from `$.config.list()` (key `nmg-router.routedAutoPermissions`), falling back to the `register` options.
- `hasFirstPartyLogin` is `(await $.session.authorize()) !== null`, evaluated once per session. Nothing else from the result is read, kept or passed anywhere.

**Permission mode:** pass-through observers on `classic.UserPromptSubmit`, `classic.PermissionRequest` and `classic.PostToolUse` record the latest `permission_mode`. Auto mode means `permission_mode === "auto"`.

**`checkRoutedTool`:**
1. If `e.tool_use_id` is absent, or not a routed tool id, or auto mode is off → `return next(e)`.
2. `const verdict = await next(e)`. If `verdict.rule`, `verdict.hook` or `verdict.setting` is set, or `verdict.decision` is not `ask` → return `verdict` unchanged.
3. Otherwise → `policy(effectiveMode).decide($, { tool: e.tool, input: e.input })`.

**`claudeClassifierPolicy`:**
- `$.model.classify(text, ["allow", "ask", "deny"])`, where `text` describes the call for a permission decision: the tool name, its input as JSON, and the working directory from `$.session.cwd()`.
- The label returned becomes `{ decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" }`.
- A rejection or `undefined` label gives `{ decision: "ask", reason: "nmg-router: classifier gave no verdict" }`.
- The classification text and its label never enter the routed conversation.

**`serverClassifierOffPolicy`:** returns `{ decision: "ask", reason: "nmg-router: routed call; the server classifier does not judge routed models" }`.

**`.catch` on `tool.check`:** routed calls in auto mode get `{ decision: "ask", reason: "nmg-router: permission check failed" }`; everything else gets `undefined`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Summary-only compaction | Selected | Matches Claude Code's own compaction; handles are not needed |
| Keeping recent messages verbatim (oh-my-pi) | Rejected | Needs handle-preserving cut points; out of scope |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` via `$.env.set` | Rejected | Process-wide, also changes Claude models; runtime re-read undocumented |
| Mod-side threshold at `turn.complete` | Selected | Uses the catalog window per routed model; `$.session.compact()` still runs the mod's compaction hook |
| Routed-call detection by `$.session.model()` | Rejected | Wrong for subagents; tool ids emitted by routed steps are exact |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature design |
