# Verification Report: Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors

**Date**: 2026-10-26
**Issue**: #3
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 4bf23abd-e7e8-4b50-aa26-7d0709a7950e)
**Scope**: Implementation verification against spec
**Verification head**: 9464a8d37bd67e77868598816b54035ed39be6ee

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 2 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 4 (2 High, 1 Medium, 1 Low)

The registered gate is complete and green: typecheck, 325 Vitest tests and `claude plugin validate .` all pass. The steering-required interactive herdr session then found two defects that the unit fakes do not model:

1. **AC2 fails on the real engine.** A routed step that calls a tool fails when the provider returns a tool-call id with characters outside `[A-Za-z0-9_-]`. Claude Code rejects the `tool` chunk with `yielded a chunk with kind tool but no { index, id, name } (an id of letters, digits, _ or -)`. The step ends as `OpenCode Go error: internal` and never answers. This reproduced on 3 of 4 fresh `opencode-go/kimi-k3` sessions. The one passing run happened to get an id of the form `call_resp_<uuid>_0`.
2. **AC9 fails for a hook failure.** After that failure the `.catch` answer (`router.fail`) sets the error status, but its message never appears in the transcript. The engine then runs another routed step, which fails the same way. The user sees an empty turn.

---

## Issue Scope

- Active issue: #3
- Spec: `specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC9]; FR [FR1–FR8]; tasks [T001–T013]; scenarios [SCN001–SCN009]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":3,"specPath":"specs/3-answer-routed-model-turns-through-provider-adapters-with-streaming-tools-thinking-and-clear-errors","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (interactive verification failed AC2 and AC9)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 4bf23abd-…` → `.nmg-sdlc/verification/3.json`. The result: `ok: true`, `ceiling: null`, coverage `declared 3 / recorded 3 / complete true`, no missing, duplicate or unknown results. Identity: head `9464a8d3…`, tree clean, steering `sha256:75b22afe…`, spec `sha256:efe5e123…`.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test`: 46 files, 325 tests passed |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` passed with warnings (no author, root CLAUDE.md, no icon) |

No `repository.nmg-sdlc-smoke` validation is declared, so no smoke requirement applies. The gate places no ceiling on the status. The Fail comes from the interactive evidence below.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Claude passthrough untouched | Pass | `src/routing/turn-step.ts:18`, `src/routing/router.ts` `isRouted`; `tests/routing/passthrough.test.ts`. Interactive: Opus answered `PASSTHROUGH-OK`; a Claude step after routed turns passed through. |
| AC2 | Full agentic routed turn | **Fail** | Unit tests pass (`tests/routing/agentic-turn.test.ts`). Interactive: the Read→Edit turn on `opencode-go/kimi-k3` failed in 3 of 4 fresh sessions with an engine chunk-validation error on the tool id (see Remaining Issues H1). The tool turn completed only when the provider's id happened to be valid. |
| AC3 | Three wire formats | Pass | `src/translate/adapters/*`; `tests/translate/{openai-completions,openai-responses,codex-responses,anthropic-messages}.test.ts` |
| AC4 | Switching keeps context | Pass | `src/translate/messages.ts` drops thinking; `tests/routing/switching.test.ts`. Interactive: resumed a Claude session on `opencode-go/kimi-k3`, which quoted the earlier Claude answer `PASSTHROUGH-OK`. After `/model opus`, Claude quoted the routed turn `"Not logged in to xAI. Run /login."`. |
| AC5 | Guard and identity on every request | Pass | `router.ts` `checkRequest` before send, `createGate` holds chunks until `checkResponse`, host check after `encode`; `tests/routing/guard-identity.test.ts`. Live response model `kimi-k3` passed the guard. |
| AC6 | Tool schemas | Pass | `src/tools/builtin-schemas.ts`, `offered-tools.ts`; `tests/tools/*`. Interactive debug log: `routed request left out tools without a schema: mcp__claude_ai_Claude_Docs__batch, …` |
| AC7 | Streaming | Pass | `src/transport/curl.ts` (URL is the only argv value; headers, credential and body go on stdin); `tests/routing/streaming.test.ts`. Interactive: `$.process.spawn (nmg-router): curl with 11 args`; thinking chunks arrived as pieces arrived. |
| AC8 | Thinking levels | Pass | `src/translate/reasoning.ts`; `tests/translate/reasoning.test.ts`, `tests/routing/thinking-status.test.ts`. Interactive: effort `xhigh` against Kimi K3 `[low, high, max]` → status `opencode-go/kimi-k3 · thinking high`. |
| AC9 | Clear errors, never a fallback | **Fail** | Missing login passes interactively: `Not logged in to xAI. Run /login.`, status `xAI error: not_logged_in`, no spawn or fetch. A hook failure fails: the `.catch` answer's message is not shown and the engine runs another step (see Remaining Issues H2). |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Translation types, SSE splitter, message normalization | Complete | |
| T002 | Wire adapters | Complete | Tool-call ids are passed through unnormalized (H1) |
| T003 | Reasoning mapping | Complete | |
| T004 | Chunk mapping | Complete | `chunks.ts` only replaces an empty id; ids are not normalized to the engine's charset (H1) |
| T005 | Transports and selection | Complete | |
| T006 | Error classification | Complete | |
| T007 | Tool schema generator and offered-tool filter | Complete | |
| T008 | Router, compose capture, status, metrics, version | Complete | `fail()` answers at block index 0 (H2) |
| T009 | Hook wiring | Complete | `.catch` wired; its answer does not surface on the real engine (H2) |
| T010 | Engine fakes and SSE fixtures | Complete | The fake engine does not enforce the host's chunk-id validation |
| T011 | Translation tests | Complete | |
| T012 | Routing tests | Complete | |
| T013 | Tool schema tests and leak test | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Clean split: translate, transport, errors, routing, tools. `router.ts` (358 lines) holds the gate, tally and routing together. |
| Open/Closed | 5 | `WIRE_ADAPTERS` and the transport selector let wires and transports be added without touching the router. |
| Liskov Substitution | 4 | curl and fetch transports share one `Transport` contract. |
| Interface Segregation | 4 | `RouterHost` is broad but literal per the host port rules. |
| Dependency Inversion | 4 | The router depends on the host port, and pure translation functions have no `$`. |

### Layer Separation

`hooks/register.ts` stays thin: it wires hooks and delegates to `src/routing/turn-step.ts`. Translation and reasoning are pure functions. Transports sit behind an interface.

### Dependency Flow

routing → translate / transport / errors / tools; no reverse imports observed.

---

## Security Assessment

- [x] Authentication: credentials come only from `resolveCredential`. A missing login fails before any request.
- [x] Authorization: Anthropic request guard before send, response guard before any chunk is released, host check against the provider base URL.
- [x] Input validation: tool arguments are re-serialized as a JSON object, or `{}`.
- [x] Injection prevention: curl config values are quoted and escaped; argv carries only the URL; `--proto =https`.
- [x] Data protection: error messages carry no body, header value or credential. The sentinel test covers every path. No credential appeared in the interactive debug logs.

## Performance Assessment

- [x] Async patterns: streamed through `$.process.spawn`, with abort raced against reads.
- [x] Caching: the transport choice and the catalog load are cached per session.
- [x] Resource management: the child is killed on abort.
- [ ] Query optimization: N/A. `host.tool.list()` runs on every step even when compose capture supplies the names (minor).

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Vitest | Yes |
| AC2 | SCN002 | Vitest | Yes (unit) / **No (interactive)** |
| AC3 | SCN003 | Vitest | Yes |
| AC4 | SCN004 | Vitest | Yes |
| AC5 | SCN005 | Vitest | Yes |
| AC6 | SCN006 | Vitest | Yes |
| AC7 | SCN007 | Vitest | Yes |
| AC8 | SCN008 | Vitest | Yes |
| AC9 | SCN009 | Vitest | Yes (unit) / **No for hook failure (interactive)** |

### Coverage Summary

- Feature files: 9 scenarios (`feature.gherkin`), covered by Vitest suites
- Unit tests: 325 passing in 46 files
- Gap: the fake engine accepts any `tool` chunk id and models `.catch` as an isolated call, so neither defect can fail a unit test.

---

## Interactive Verification (herdr)

The procedure follows the interactive verification steering. `herdr tab list` answered. Tab `verify-3` was created with `--no-focus` and Claude Code v2.1.310 was started with `--plugin-dir .`. No startup dialogs or hook load errors appeared. The tab was closed at the end.

| # | Prompt / command | Observed | Excerpt |
|---|------------------|----------|---------|
| 1 | Opus: "Reply with exactly the word PASSTHROUGH-OK…" | Claude answered, no nmg-router spawn | `⏺ PASSTHROUGH-OK` |
| 2 | `/model opencode-go/kimi-k3` | Rejected by Claude Code: picker rows are out of scope (issue #5). Used `--model opencode-go/kimi-k3` at launch instead. | `Model 'opencode-go/kimi-k3' not found` |
| 3 | Resumed session 1 with `--model opencode-go/kimi-k3`: "What exact word did the assistant reply with earlier…" | Routed answer with Claude context | `⏺ PASSTHROUGH-OK` / status `nmg-router: opencode-go/kimi-k3 · thinking high` |
| 4 | Routed: "Use the Read tool … then the Edit tool … red to blue" | **Failed**: empty turn, file unchanged | status `OpenCode Go error: internal`; debug `hook failed closed: nmg-router: errorKind=HooksError … (turn.step; its .catch answered)` ×2 |
| 5 | Same on a fresh session, auto mode | Read succeeded (valid id `call_resp_…_0`). Edit was then blocked by the auto-mode classifier, which is out of scope (#4). | `Read 1 file` / `⏺ The file contains a single line: color = red.` |
| 6 | Same on a fresh session, `acceptEdits` | **Failed** as in #4 | status `OpenCode Go error: internal` |
| 7 | Fresh session with a diagnostic log in a disposable worktree | Captured the engine's error | `{"kind":"throw","message":"yielded a chunk with kind tool but no { index, id, name } (an id of letters, digits, _ or -)","budget":1000}` |
| 8 | Fresh session, `--model xai/grok-4.6`, not logged in: "Say hello in one word." | Clear error, no request | `⏺ Not logged in to xAI. Run /login.` / status `xAI error: not_logged_in` |
| 9 | `/model opus`, then "Quote exactly what the assistant said in the previous turn…" | Claude passthrough with the routed turn in its transcript | `⏺ "Not logged in to xAI. Run /login."` |

All scratch edits went to a file in the session scratchpad. The diagnostic build ran from a disposable `git worktree` that has since been removed, and the shared checkout stayed clean at the verification head. No credential was typed or recorded.

---

## Fixes Applied

None. This step's publication scope allows edits only to `verification-report.md`, so both defects go back to implementation.

## Remaining Issues

### High Priority

**H1. Provider tool-call ids are not normalized to the engine's id charset**

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling / Correctness |
| **Location** | `src/translate/chunks.ts` (`toolEnd` case); ids come from `src/translate/adapters/openai-completions.ts` `stringOf(call.id)` and the other parsers |
| **Issue** | Claude Code requires a `tool` chunk id of letters, digits, `_` or `-`. The mapper forwards the provider's id unchanged and only replaces an empty one. OpenCode Go (`kimi-k3`) returns ids outside that set on most sessions. |
| **Impact** | AC2 fails live: tool-using routed turns end with `OpenCode Go error: internal` and never answer. |
| **Reason Not Fixed** | Outside this step's publication scope (report-only). Suggested fix: map each provider id to a deterministic engine-safe id, for example replacing `[^A-Za-z0-9_-]` with `_` plus a uniqueness suffix. Do it in the chunk mapper so the transcript and the next request's `tool_result` ids agree. Make the fake engine enforce the same id rule. |

**H2. The `.catch` answer for a failed routed hook is not shown, and the engine loops**

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling |
| **Location** | `src/routing/router.ts` `fail()` → `failure(..., blocks = 0)`; `src/routing/turn-step.ts` `routeStepFailed` |
| **Issue** | After the hook fails mid-stream, `router.fail` sets the error status, but its text answer never appears in the transcript. The engine reports `its .catch answered`, then sends another routed step. Likely cause, not yet confirmed: `fail()` answers at block index 0, which conflicts with blocks the failed stream already emitted (thinking at index 0, tool at index 1). It may also end in a way the engine treats as an unfinished tool turn. |
| **Impact** | AC9 fails for hook failures: the user gets an empty turn and a repeated failing request, not a message naming the provider. |
| **Reason Not Fixed** | Outside this step's publication scope. It needs diagnosis against the real engine's `.catch` semantics, and the fake engine should model a stream that already emitted chunks before the hook failed. |

### Medium Priority

**M1. Unit fakes do not model host chunk validation.** `tests/support/fake-engine.ts` accepts any chunk shape and runs `.catch` in isolation, so H1 and H2 passed every unit test. Reason not fixed: report-only scope.

### Low Priority

**L1. A stale error status persists after switching to a Claude model.** After `/model opus` the status line still read `nmg-router: xai/grok-4.6 · xAI error: not_logged_in`. The spec allows it to persist "until the next success", but on a Claude model nothing routed will clear it. Reason not fixed: spec clarification needed.

---

## Positive Observations

- The guards are layered well: request guard, response-model gate that holds every chunk, and an explicit host check.
- Secrets never reach argv or the environment. The curl config is escaped, and HTTPS is the only protocol allowed.
- Reasoning clamping and the status segment work live (`xhigh` → `thinking high`).
- Missing-login errors are immediate, clear and send nothing.

---

## Recommendations Summary

### Before PR (Must)
- [ ] H1: normalize tool-call ids to `[A-Za-z0-9_-]` in the chunk mapper, keep transcript ids consistent, add a test with a `functions.Read:0`-style id
- [ ] H2: make the `.catch` answer visible after a mid-stream failure (block index and stop semantics), and add a fake-engine test of a failure after chunks were already streamed
- [ ] Rerun the full registered gate and the interactive Read→Edit turn on several fresh `opencode-go/kimi-k3` sessions

### Short Term (Should)
- [ ] M1: make the fake engine enforce host chunk-shape rules

### Long Term (Could)
- [ ] L1: clear or scope the routed error status when the active model is not routed

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 0 | Thin wiring, `.catch` present |
| `src/routing/router.ts` | 1 (H2) | |
| `src/routing/turn-step.ts` | 0 | |
| `src/translate/chunks.ts` | 1 (H1) | |
| `src/translate/adapters/openai-completions.ts` | 0 | Source of raw ids |
| `src/transport/curl.ts`, `select.ts`, `fetch.ts` | 0 | |
| `src/errors/routed-errors.ts` | 0 | |
| `tests/support/fake-engine.ts` | 1 (M1) | |

---

## Recommendation

**Needs fixes**

The registered gate is green and most of the design works live: passthrough, context on switching, guards, streaming, thinking clamp and missing-login errors. Tool-using routed turns, the core of AC2, fail on the real engine for common provider tool ids, and the hook-failure path leaves the user with no message (AC9). Both need an implementation fix and a fresh full gate plus interactive rerun.
