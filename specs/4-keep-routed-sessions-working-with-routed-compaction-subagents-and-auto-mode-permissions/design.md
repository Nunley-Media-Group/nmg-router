# Design: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Issue**: #4
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors/

## Overview

Four additions sit on #3's router, each behind a small interface:

1. **Routed compaction.** A `session.compact` hook resolves the model of the transcript being compacted (the main loop or the agent). For a routed model it builds a summarization request and runs it through a new `router.complete()`. `router.complete()` uses the same guard, credential, wire adapter and transport pipeline as a routed step, but collects text instead of yielding chunks.
2. **In-place summary.** At the mod's own threshold, the mod summarizes the main loop through `router.complete()` and keeps a `RoutedView`: the summary and the point it covers. Routed requests send the summary followed by only the newer messages. The mod never calls `$.session.compact()`. On 2.1.310 that call skips the calling plugin's own hook, so core would summarize the routed transcript on Anthropic.
3. **Session tracking and offered tools.** A `SessionTracker` records, per loop (`main` or an `agentId`), the latest step model, the routed context tokens from the last stop usage, and the tool ids emitted by routed steps. Routed requests also offer `SubagentHandback` in a subagent loop and the tools that loop loaded through `ToolSearch`.
4. **Routed auto-mode permissions.** A `tool.check` hook uses a `PermissionPolicy` strategy (`claude-classifier` or `server-classifier-off`), chosen by the `/config` row or by login presence. It acts only on routed calls in auto mode whose core verdict is an unsettled `ask`. A call that needs a person's decision is asked through `$.ui.ask` and answered `allow` or `deny`, because a hook's `ask` still meets the server classifier's block in auto mode.

`hooks/register.ts` stays thin. oh-my-pi's sources are the reference for each part (paths relative to `@oh-my-pi/`, 17.3.7). No code is copied.

## Architecture

```text
hooks/register.ts                    adds: on("session.compact").catch; on("turn.complete"); on("tool.check").catch;
                                     classic permission-mode observers
src/routing/session-tracker.ts       per loop key ("main" | agentId): model, contextTokens; routedToolIds (bounded set)
src/routing/router.ts                (modify) record model/usage/tool ids in the tracker; add complete(model, request, signal) → text;
                                     apply the RoutedView to main-loop requests; offered tools per loop; status line only for main
src/compaction/compact-hook.ts       compactSession($, e, next, services)
src/compaction/summary-request.ts    pure: transcript messages + instructions (+ prior summary) → RoutedRequest
src/compaction/summary-prompt.ts     summarization system prompt and section instructions (text constants)
src/compaction/threshold.ts          pure: thresholdTokens(window) and shouldCompact(tokens, window)
src/compaction/routed-view.ts        RoutedView per loop: { summary, model, cut }; apply(messages) and the pending summary
src/compaction/auto-trigger.ts       onTurnComplete($, e, services): main-loop threshold check → in-place summary
src/tools/supplement-schemas.ts      hand-kept schemas for host tools the generated declarations omit (SubagentHandback)
src/tools/offered-tools.ts           (modify) names = captured ∪ ToolSearch-loaded ∪ SubagentHandback in a subagent loop
src/permissions/mode.ts              effectiveMode(rowValue, hasFirstPartyLogin) and readMode($, options)
src/permissions/policy.ts            PermissionPolicy interface; claudeClassifierPolicy; serverClassifierOffPolicy
src/permissions/person-approval.ts   askPerson($, call): $.ui.ask → allow | deny, one question at a time
src/permissions/tool-check.ts        checkRoutedTool($, e, next, services)
src/permissions/permission-mode.ts   tracks the latest permission_mode from classic events
.claude-plugin/plugin.json           (modify) userConfig.routedAutoPermissions (free text)
```

### Reference map (oh-my-pi, reference only)

| Part | oh-my-pi reference |
|------|--------------------|
| Summarization prompt and sections | `pi-agent-core/src/compaction/prompts/summarization-system.md`, `compaction-summary.md`, `compaction-summary-context.md` |
| Transcript serialization for the summarizer | `pi-agent-core/src/compaction/utils.ts` (role tags, 2000-character tool-result cut, images dropped) |
| Custom instructions | `pi-agent-core/src/compaction/compaction.ts` (`Additional focus:`) |
| Threshold and reserve | `pi-agent-core/src/compaction/compaction.ts` (`resolveThresholdTokens`, reserve `max(15%, 16384)`) |
| Summary budget | `pi-agent-core/src/compaction/compaction.ts` (`MAX_SUMMARY_TOKENS`, `0.8 × reserve`) |
| Updating an earlier summary | `pi-agent-core/src/compaction/compaction.ts` (previous summary carried into the next summarization) |
| Failure leaves the session uncompacted | `pi-coding-agent/src/session/session-maintenance.ts` (auto-compaction end with error) |
| Subagents compact on their own model | `pi-coding-agent/src/task/executor.ts`, `pi-coding-agent/src/session/session-maintenance.ts` |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `compactSession($, e, next)` | `SessionCompactInput` | `SessionCompactResult` | Main loop: model = `$.session.model()`; a subagent (`e.agentId`): `tracker.model(e.agentId)`. Not routed → `return next(e)`. Routed + `precompute` → `{ skip: "nmg-router compacts routed sessions when compaction runs." }`. Routed otherwise → summarize the view-applied transcript; success → `{ messages: [summaryMessage] }` and the loop's view is dropped; failure → `{ skip }` |
| `compactSession` `.catch` | same, `next.error` | `SessionCompactResult \| undefined` | Routed → `{ skip: "<Provider> could not summarize this conversation; it was not compacted." }`; not routed → `undefined` (core runs) |
| `router.complete(model, request, signal)` | routed model id, `RoutedRequest` | `string` / throws `RoutedError` | Guard, credential, adapter, one transport send, response guard; joins `text` events; ignores thinking; errors classified as in #3 |
| `buildSummaryRequest(messages, instructions, model, prior?)` | transcript messages, optional text, optional earlier summary | `RoutedRequest` | No tools, no reasoning, `maxOutput = min(model.maxOutput ?? 16384, 13107)`; `prior` is serialized first as `[Earlier summary]: <text>` |
| `thresholdTokens(window)` | catalog context window | `number` | `window - max(floor(0.15 × window), 16384)` |
| `onTurnComplete($, e)` | `TurnCompleteInput` (main loop) | — | When the main model is routed with a known window, `tracker.contextTokens("main") ≥ thresholdTokens(window)` and no summary is pending, starts `summarizeInPlace` in the background; never calls `$.session.compact()` |
| `RoutedView` | — | `get(loop)`, `set(loop, { summary, model, cut })`, `drop(loop)`, `apply(loop, messages)`, `pending(loop)` | See In-place summary |
| `SessionTracker` | — | `recordStep(loop, model)`, `recordUsage(loop, usage)`, `recordToolId(id)`, `isRoutedTool(id)`, `model(loop)`, `contextTokens(loop)` | `contextTokens` = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens` from the last routed stop, reset to 0 after a compaction or an in-place summary of that loop; routed tool ids are kept for the 1024 most recent |
| `offeredTools(names, listed, registry, mcp)` | as #3 | `OfferedTools` | `registry` is the generated schemas merged with `SUPPLEMENT_TOOL_SCHEMAS`; the caller passes the names in Subagents and offered tools |
| `effectiveMode(row, hasLogin)` | row value or undefined, boolean | `"claude-classifier" \| "server-classifier-off"` | A row of either name wins; anything else reads as unset; unset → `claude-classifier` when `hasLogin`, else `server-classifier-off` |
| `PermissionPolicy.decide($, call)` | `{ tool, input, model, approver }` | `ToolCheckResult` (`allow` or `deny`) | See Permissions |
| `askPerson($, call)` | `{ tool, input, model, approver }` | `ToolCheckResult` (`allow` or `deny`) | See Permissions |
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
- Serialization of each message, in order:
  - `[Earlier summary]: <text>` first, when an earlier summary is carried in;
  - `[User]: <text>` or `[Assistant]: <text>`;
  - one `[Tool Call]: <tool>(<JSON input>)` per tool use;
  - one `[Tool Result]: <text>` per tool result, cut to 2000 characters with `[... N more characters truncated]`.
- The serializer reads both the `SessionMessage` shape (`session.compact`'s `e.messages`) and the API shape (`$.session.messages({ as: "api" })`), with the same rules.
- Images and thinking are left out.

**Result:**
- One message without a handle: `{ role: "user", text: "This session continues from an earlier conversation that was compacted by <model id>. Summary of the earlier conversation:\n\n<summary>\n…\n</summary>", toolUses: [] }`.
- An empty summary is a failure.

**Failure:** any `RoutedError`, an empty summary, or an abort answers `{ skip: "<Provider> could not summarize this conversation (<kind>); it was not compacted." }`. `next` is never called for a routed model, and no request goes to Anthropic.

**View-applied transcript:** when the main loop has a `RoutedView`, `compactSession` summarizes the view's summary (carried in as `prior`) plus the messages after its cut, not the whole transcript, so the request fits the routed window. A standing result drops the view.

**Engine triggers:** the `.catch` on `session.compact` also covers engine-started (`auto`) compaction, and another plugin's `$.session.compact()` (`plugin`) is handled like `manual`.

## In-place summary

The mod's own threshold can't start a Claude Code compaction: on 2.1.310, `$.session.compact()` runs every hook except the calling plugin's own, then core. So the mod summarizes for the provider and leaves the engine's transcript alone.

**Trigger** (`auto-trigger.ts`):
- The window comes from the routed model's catalog `contextWindow`. Models without one rely on the engine's own trigger.
- For 128000, the threshold is 108800.
- At a main-loop `turn.complete` at or over the threshold, with no summary pending, `summarizeInPlace` starts in the background and is kept as the loop's pending summary.

**`summarizeInPlace`:**
1. Read `$.session.messages({ as: "api" })`. The cut is its length: the turn has ended, so no tool use is left without its result.
2. Build the summary request from the messages after the current view's cut (all of them when there is no view), carrying the current view's summary as `prior`.
3. Run it through `router.complete()` on the main loop's routed model.
4. On success: `view.set("main", { summary, model, cut })`, and the tracker's main context tokens reset to 0.
5. On any `RoutedError`, an empty summary or an abort: the view is left as it was, and `$.ui.log("<Provider> could not summarize this conversation (<kind>); it will be retried at the next turn end.")` shows. There is no Claude request and no `$.session.compact()` call.

**Applying the view** (`router.ts`, main loop only):
- A routed main-loop `turn.step` first awaits a pending summary, bounded by the step's abort signal.
- `view.apply("main", messages)`:
  - When the transcript is shorter than `cut` (a compaction, `/clear` or a rewind rewrote it), the view is dropped and the messages are sent as they are.
  - Otherwise the request sends one user message, the result text above with the view's summary, followed by `messages.slice(cut)`. When the first kept message is also a user message, the two are merged into one, summary first.
- The view belongs to the loop, not the model. A Claude step reads the engine's transcript and never sees the view.

## Subagents and offered tools

- The router records `tracker.recordStep(e.agentId ?? "main", e.model)` for every step (Claude and routed). Routed steps also record their usage and each emitted tool id.
- Routed subagent steps read `$.session.messages({ as: "api", agentId })`, as #3 already does.
- The system prompt is the latest captured non-analysis compose for the step's model. `prompt.compose` carries no agent id, so two parallel agents on the same model share the latest capture.
- Subagent steps do not touch the main status line.
- A subagent's compaction (`e.agentId` set) resolves the agent's own model through the tracker.

**Offered tool names** for a routed step, deduplicated in this order:
1. the captured compose tool names, as in #3;
2. each tool named by a `tool_reference` block in the loop's `ToolSearch` tool results, so a loaded deferred tool stays offered;
3. `SubagentHandback`, when `e.agentId` is set and the host's tool listing names it.

**Schemas:** `src/tools/supplement-schemas.ts` holds hand-kept schemas for host tools that the generated declarations omit, starting with `SubagentHandback`. Each entry records the Claude Code version it was taken from, and the schema is copied from that version's own tool definition as a live session sends it. A name with no schema is still skipped and debug-logged, as in #3.

## Permissions

**Configuration:** `.claude-plugin/plugin.json` gains:
`"userConfig": { "routedAutoPermissions": { "type": "string", "title": "Routed auto-mode permissions", "description": "How auto mode decides tool calls from routed models: claude-classifier or server-classifier-off. Unset follows whether the session has a first-party Anthropic login" } }`
- The row has no `options`, no default and no `required`. `claude plugin validate` rejects `options` without a default or `required`, and a required row with no value stops the hooks module from loading. A default would remove the unset state that AC4 relies on.
- `readMode` reads the current value from `$.config.list()` (key `nmg-router.routedAutoPermissions`), falling back to the `register` options. Any value other than the two mode names reads as unset.
- `hasFirstPartyLogin` is `(await $.session.authorize()) !== null`, evaluated once per session. Nothing else from the result is read, kept or passed anywhere.

**Permission mode:** pass-through observers on `classic.UserPromptSubmit`, `classic.PermissionRequest` and `classic.PostToolUse` record the latest `permission_mode`. Auto mode means `permission_mode === "auto"`.

**`checkRoutedTool`:**
1. If `e.tool_use_id` is absent, or not a routed tool id, or auto mode is off → `return next(e)`.
2. `const verdict = await next(e)`. If `verdict.rule`, `verdict.hook` or `verdict.setting` is set, or `verdict.decision` is not `ask` → return `verdict` unchanged.
3. Otherwise → `policy(effectiveMode).decide($, { tool: e.tool, input: e.input, model: tracker.model(e.agentId ?? "main"), approver: e.approver })`.

The hook never answers `ask` for a routed call in auto mode. In auto mode, a hook's `ask` still passes the server classifier, and that classifier's block refuses the call.

**`claudeClassifierPolicy`:**
- `$.model.classify(text, ["allow", "ask", "deny"])`, where `text` describes the call for a permission decision: the tool name, its input as JSON, and the working directory from `$.session.cwd()`.
- `allow` or `deny` becomes `{ decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" }`.
- An `ask` label, a rejection or an `undefined` label → `askPerson`.
- The classification text and its label never enter the routed conversation.

**`serverClassifierOffPolicy`:** always `askPerson`.

**`askPerson`** (`person-approval.ts`):
- When `approver === "person"`: `$.ui.ask("<model> wants to run <tool>: <input summary>. Allow it?", { header: "nmg-router", options: ["Allow", "Deny"] })`.
  - The input summary is Bash's `command`, or a tool's input as JSON, cut to 300 characters.
  - `Allow` → `{ decision: "allow", reason: "nmg-router: the person allowed this routed call" }`.
  - `Deny`, any other answer, or a rejection (dismissed) → `{ decision: "deny", reason: "nmg-router: the person did not allow this routed call" }`.
- Otherwise (a host approver, or nobody to ask) → `{ decision: "deny", reason: "nmg-router: routed calls in auto mode need a person to approve them here; add an allow rule or turn auto mode off" }`.
- Questions are asked one at a time. Parallel routed calls wait their turn, and a call aborted while it waits is denied without a question.
- The question and its answer never enter the routed conversation.

**`.catch` on `tool.check`:** routed calls in auto mode get `{ decision: "deny", reason: "nmg-router: permission check failed" }`; everything else gets `undefined`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Summary-only compaction | Selected | Matches Claude Code's own compaction; handles are not needed |
| Keeping recent messages verbatim (oh-my-pi) | Rejected for engine compaction | Needs handle-preserving cut points; the in-place summary keeps them only in the provider's view |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` via `$.env.set` | Rejected | Process-wide, also changes Claude models; runtime re-read undocumented |
| Mod-side threshold starting `$.session.compact()` | Rejected (was selected) | On 2.1.310 the call skips the calling plugin's own hook, so core summarizes the routed transcript on Anthropic |
| Mod-side threshold with an in-place summary | Selected | Automatic, stays on the routed provider, and needs no engine compaction |
| Notice that fills `/compact` for the person | Rejected | Not automatic; an ignored notice lets the provider reject an oversized request |
| Routed-call detection by `$.session.model()` | Rejected | Wrong for subagents; tool ids emitted by routed steps are exact |
| Hook `ask` for undecided routed calls | Rejected (was selected) | In auto mode the server classifier still judges a hook's ask, and its fail-closed block refuses routed calls |
| `tool.describe` pinning `SubagentHandback` in front | Rejected | Changes every Claude prompt, and compose capture is per model, not per agent |
| `userConfig` row with `options` and `required` | Rejected | A required row with no value stops the hooks module from loading |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #4 | 2026-10-25 | Initial feature design |
| #4 | 2026-10-26 | In-place summary replaces `$.session.compact()` (H1); offered tools gain `ToolSearch`-loaded tools and `SubagentHandback` (H2); `askPerson` replaces hook asks (H3); free-text permissions row (M1) |
