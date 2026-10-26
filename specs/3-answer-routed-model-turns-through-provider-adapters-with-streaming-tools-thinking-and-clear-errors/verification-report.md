# Verification Report: Answer routed-model turns through provider adapters with streaming, tools, thinking and clear errors

**Date**: 2026-10-26
**Issue**: #3
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 4bf23abd-e7e8-4b50-aa26-7d0709a7950e)
**Scope**: Implementation verification against spec (re-verification after fix commit `e97bb10`)
**Verification head**: e97bb102849424124029a2fa385f2b003577f248

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.3 |

### Implementation Status: Pass
**Total Issues**: 1 (0 High, 0 Medium, 1 Low)

The registered gate is complete and green: typecheck, 333 Vitest tests in 47 files, and `claude plugin validate .`. Commit `e97bb10` fixes both High findings from the previous verification at `9464a8d`, and the interactive herdr run confirms the fixes:

1. **H1 fixed (AC2).** The chunk mapper replaces a provider tool-call id outside `[A-Za-z0-9_-]` with `call_<turn>_<step>_<block>`. The Read→Edit routed turn on `opencode-go/kimi-k3` completed in **3 of 3** fresh sessions; it failed in 3 of 4 before the fix. The transcripts hold the normalized ids, so this code path was exercised.
2. **H2 fixed (AC9).** The router keeps each step's streamed block count for the `.catch` handler, so its answer lands in a fresh block. With normalization disabled in a disposable worktree to force an engine refusal, the transcript showed `nmg-router failed to answer with OpenCode Go.`. The status line read `OpenCode Go error: internal`. The log showed exactly one hook failure and one request, with no repeated step.

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

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 4bf23abd-e7e8-4b50-aa26-7d0709a7950e` wrote `.nmg-sdlc/verification/3.json`: `ok: true`, `ceiling: null`, coverage `declared 3 / recorded 3 / complete true`, no missing, duplicate or unknown results. Identity: head `e97bb102…`, steering `sha256:75b22afe…`, spec `sha256:efe5e123…`.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test`: 47 files, 333 tests passed |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` passed |

No `repository.nmg-sdlc-smoke` or `project.nmg-sdlc-smoke` validation is declared, so no smoke requirement applies. The gate places no ceiling on the status.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Claude passthrough untouched | Pass | `src/routing/turn-step.ts`, `router.ts` `isRouted`; `tests/routing/passthrough.test.ts`. Interactive: Opus answered `PASSTHROUGH-OK`; the debug log shows 0 nmg-router spawns or fetches for the session. A Claude step after a routed turn also sent nothing. |
| AC2 | Full agentic routed turn | Pass | `tests/routing/agentic-turn.test.ts` now runs through `onEngine`, which models the host's chunk-id refusal. Interactive: Read→Edit→final text completed in 3/3 fresh `opencode-go/kimi-k3` sessions (`color = red` → `color = blue`, reply `DONE-EDIT`). Each turn took 3 curl spawns and logged no hook failure. Transcript ids: `call_dbd9bf7a-…_0_1`, `call_dbd9bf7a-…_1_0`. |
| AC3 | Three wire formats | Pass | `src/translate/adapters/*`; `tests/translate/{openai-completions,openai-responses,codex-responses,anthropic-messages}.test.ts` on faked streams, as the AC specifies. Live: OpenCode Go Chat Completions text, thinking, tool calls and stop all mapped to engine chunks. |
| AC4 | Switching keeps context | Pass | `src/translate/messages.ts` drops thinking; `tests/routing/switching.test.ts`. Interactive: resumed the Opus session on `opencode-go/kimi-k3`, which quoted the Claude answer `PASSTHROUGH-OK`. After `/model opus`, Claude quoted the routed turn `Not logged in to xAI. Run /login.` and passed through with no nmg-router spawn. |
| AC5 | Guard and identity on every request | Pass | `router.ts` `checkRequest` before send, `createGate` holds chunks until `checkResponse`, host check after `encode`; `tests/routing/guard-identity.test.ts`. Live: response model `kimi-k3` passed the gate, and chunks streamed after it. |
| AC6 | Tool schemas | Pass | `src/tools/builtin-schemas.ts`, `offered-tools.ts`; `tests/tools/*`, including the staleness test. Interactive: built-in Read and Edit were sent and used. Debug: `routed request left out tools without a schema: mcp__claude_ai_Claude_Docs__batch, …` |
| AC7 | Streaming | Pass | `src/transport/curl.ts` (argv carries only the URL; headers, credential and body go on stdin); `tests/routing/streaming.test.ts`, `tests/transport/*`. Interactive: `$.process.spawn (nmg-router): curl with 11 args … ended (0) in 3264ms, 12 chunks`. |
| AC8 | Thinking levels | Pass | `src/translate/reasoning.ts`; `tests/translate/reasoning.test.ts`, `tests/routing/thinking-status.test.ts`. Interactive: effort `xhigh` on Kimi K3 → status `nmg-router: opencode-go/kimi-k3 · thinking high`. |
| AC9 | Clear errors, never a fallback | Pass | `src/errors/routed-errors.ts`, `router.ts` `fail()` now reads the step's kept progress; `tests/routing/errors.test.ts` adds "answers a hook the engine failed mid-stream in a block of its own". Interactive: missing login → `Not logged in to xAI. Run /login.`, status `xAI error: not_logged_in`, 0 spawns and 0 fetches. Forced hook failure → `nmg-router failed to answer with OpenCode Go.`, status `OpenCode Go error: internal`, 1 hook failure, 1 request, no further step. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Translation types, SSE splitter, message normalization | Complete | |
| T002 | Wire adapters | Complete | |
| T003 | Reasoning mapping | Complete | |
| T004 | Chunk mapping | Complete | Ids normalized to the engine charset (`toolIdOf`) |
| T005 | Transports and selection | Complete | |
| T006 | Error classification | Complete | |
| T007 | Tool schema generator and offered-tool filter | Complete | |
| T008 | Router, compose capture, status, metrics, version | Complete | Per-step progress kept for `.catch` (bounded to 16 steps) |
| T009 | Hook wiring | Complete | `.catch` answer verified live |
| T010 | Engine fakes and SSE fixtures | Complete | `onEngine` / `engineRefusal` / `blockKinds` model host refusal and `.catch` continuation |
| T011 | Translation tests | Complete | |
| T012 | Routing tests | Complete | |
| T013 | Tool schema tests and leak test | Complete | |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Clean split: translate, transport, errors, routing, tools. `router.ts` still holds the gate, tally, routing and now step progress. |
| Open/Closed | 5 | `WIRE_ADAPTERS` and the transport selector let wires and transports be added without touching the router. |
| Liskov Substitution | 4 | curl and fetch transports share one `Transport` contract. |
| Interface Segregation | 4 | `RouterHost` is broad but literal per the host port rules. |
| Dependency Inversion | 4 | The router depends on the host port; translation is pure with no `$`. |

### Layer Separation

`hooks/register.ts` stays thin and delegates to `src/routing/turn-step.ts`. The id normalization lives in the pure chunk mapper, so the transcript and the next request's tool-result ids agree.

### Dependency Flow

routing → translate / transport / errors / tools. No reverse imports were observed.

### Fix review

- `toolIdOf` keeps a valid provider id unchanged and otherwise builds one from turn, step and block, which is unique in the session. OpenAI-style providers only require that assistant `tool_calls` ids match the following tool-result ids, and both come from the transcript.
- `progress.blocks` advances only after `yield`, so a chunk the engine refuses is not counted. Thinking blocks now count too. The `.catch` answer therefore uses a block index no streamed chunk holds (`blockKinds` test).
- The `steps` map is deleted on every normal ending and bounded at 16 entries, so it cannot grow without bound.

---

## Security Assessment

- [x] Authentication: credentials come only from `resolveCredential`. A missing login fails before any request (0 spawns, 0 fetches live).
- [x] Authorization: request guard before send, a response-model gate before any chunk, and a host check against the provider base URL.
- [x] Input validation: tool arguments are re-serialized as a JSON object, or `{}`. The provider tool id is now constrained to the engine charset.
- [x] Injection prevention: curl config values are quoted and escaped, argv carries only the URL, and `--proto =https` is set.
- [x] Data protection: error messages carry no body, header value or credential. A grep of every interactive debug log for bearer, key and token patterns found no credential.

## Performance Assessment

- [x] Async patterns: streamed through `$.process.spawn`, with abort raced against reads. Live steps took 1.4–3.3 s.
- [x] Caching: the transport choice and the catalog load are cached per session.
- [x] Resource management: the child is killed on abort, and step progress is bounded.
- [ ] Minor: `host.tool.list()` runs on every step even when compose capture supplies the names.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Vitest | Yes |
| AC2 | SCN002 | Vitest | Yes (unit and interactive) |
| AC3 | SCN003 | Vitest | Yes |
| AC4 | SCN004 | Vitest | Yes |
| AC5 | SCN005 | Vitest | Yes |
| AC6 | SCN006 | Vitest | Yes |
| AC7 | SCN007 | Vitest | Yes |
| AC8 | SCN008 | Vitest | Yes |
| AC9 | SCN009 | Vitest | Yes (unit and interactive) |

### Coverage Summary

- Feature files: 9 scenarios (`feature.gherkin`), covered by Vitest suites
- Unit tests: 333 passing in 47 files (up from 325)
- The previous gap is closed: the routing harness enforces the host's tool-id rule and runs `.catch` as a continuation of the same stream.

---

## Interactive Verification (herdr)

The procedure follows the interactive verification steering. `herdr tab list` answered. Tab `verify-3` was created with `--no-focus` at the checkout. Claude Code v2.1.310 started with `--plugin-dir .` and `--debug`, and the debug log shows `hooks module nmg-router@inline loaded … events: command.run,prompt.compose,turn.step,ui.render,ui.close`. There were no startup dialogs and no hook load errors. Routed models were selected with `--model` at launch, because `/model` picker rows are out of scope (issue #5).

| # | Prompt / command | Observed | Excerpt |
|---|------------------|----------|---------|
| 1 | Opus: "Reply with exactly the word PASSTHROUGH-OK and nothing else." | Claude answered; 0 nmg-router spawns or fetches | `⏺ PASSTHROUGH-OK` |
| 2 | Resumed session 1 with `--model opencode-go/kimi-k3 --permission-mode acceptEdits`: "What exact word did the assistant reply with earlier…" | Routed answer with Claude context | `⏺ PASSTHROUGH-OK` / `⚠ nmg-router: opencode-go/kimi-k3 · thinking high` |
| 3 | Same session: "Use the Read tool to read …/color.txt, then use the Edit tool to change red to blue…, then reply DONE-EDIT." | Read succeeded. The Edit permission prompt appeared because the file is outside the project (expected) and was approved. Edit applied and the final text arrived. | `Read 1 file` / `1 -color = red` `1 +color = blue` / `⏺ DONE-EDIT` |
| 4 | Fresh session (`--add-dir` scratchpad), same Read→Edit prompt on `color2.txt` | Pass, 3 spawns, 0 hook failures | `⏺ DONE-EDIT`; file `color = blue` |
| 5 | Fresh session, same on `color3.txt` | Pass, 3 spawns, 0 hook failures. Transcript ids are normalized. | `⏺ DONE-EDIT`; `"id":"call_dbd9bf7a-…_0_1"` |
| 6 | Fresh session `--model xai/grok-4.6`, not logged in: "Say hello in one word." | Clear error, no request | `⏺ Not logged in to xAI. Run /login.` / `⚠ nmg-router: xai/grok-4.6 · xAI error: not_logged_in` |
| 7 | `/model opus`, then "Quote exactly what the assistant said in the previous turn, nothing else." | Claude passthrough with the routed turn in its transcript | `⏺ Not logged in to xAI. Run /login.` |
| 8 | Disposable worktree at `e97bb10` with `toolIdOf` forced to return `functions.Read:0`, tab `verify-3-diag`, `opencode-go/kimi-k3`: "Use the Read tool to read …/color4.txt…" | The engine refused the tool chunk. The `.catch` answer was shown and the turn ended. | `⏺ nmg-router failed to answer with OpenCode Go.` / status `OpenCode Go error: internal` / `hook failed closed: nmg-router: errorKind=HooksError … (turn.step; its .catch answered)` ×1, spawns 1 |

Both tabs were closed. The diagnostic worktree was removed, and the shared checkout stayed clean at the verification head. Scratch edits went only to files in the session scratchpad. No credential was typed or recorded. Claude Code's own `/model opus` saved Opus as the default model for new sessions. That is host behavior, not the mod's.

---

## Fixes Applied

None in this step. The publication scope allows edits only to `verification-report.md`. Implementation commit `e97bb10` fixed H1, H2 and M1 from the previous report.

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| High | Correctness | `src/translate/chunks.ts` | Provider tool ids outside the engine charset were rejected (prior H1) | `toolIdOf` normalizes to `call_<turn>_<step>_<block>` (commit `e97bb10`) | direct |
| High | Error Handling | `src/routing/router.ts` | The `.catch` answer was hidden after a mid-stream failure (prior H2) | Per-step progress kept for `fail()`; blocks counted after the engine takes them, thinking included (commit `e97bb10`) | direct |
| Medium | Testability | `tests/support/routing.ts` | Fakes did not model host chunk validation (prior M1) | `engineRefusal`, `onEngine`, `blockKinds` (commit `e97bb10`) | direct |

## Remaining Issues

### Low Priority

**L1. The routed error status stays after switching to a Claude model.** After `/model opus`, the status line still read `nmg-router: xai/grok-4.6 · xAI error: not_logged_in`. The spec allows the error state to persist "until the next success", so this does not fail AC9. On a Claude model, though, no routed step will clear it. Reason not fixed: report-only scope, and the spec needs clarification. Track it as a follow-up.

---

## Positive Observations

- The fix is small and placed where it belongs: id normalization sits in the pure mapper, and failure progress sits in the router.
- The test harness now models the host behavior that let both defects pass unit tests before.
- The layered guards, stdin-only secrets and HTTPS-only curl are unchanged and still hold.

---

## Recommendations Summary

### Before PR (Must)
- [x] H1, H2 fixed and verified interactively
- [x] Full registered gate rerun at the exact head

### Long Term (Could)
- [ ] L1: clear or scope the routed error status when the active model is not routed
- [ ] Skip `host.tool.list()` when compose capture already supplies the tool names

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 0 | Thin wiring, `.catch` present |
| `src/routing/router.ts` | 0 | Fix for H2 reviewed |
| `src/routing/turn-step.ts` | 0 | |
| `src/translate/chunks.ts` | 0 | Fix for H1 reviewed |
| `src/transport/curl.ts`, `select.ts`, `fetch.ts` | 0 | |
| `src/errors/routed-errors.ts` | 0 | |
| `tests/support/routing.ts` | 0 | Engine-refusal harness |

---

## Recommendation

**Ready for PR**

The registered gate is complete and green at `e97bb102849424124029a2fa385f2b003577f248`. Every acceptance criterion has unit and interactive evidence, and the two defects from the previous verification are fixed and confirmed on the real engine. The one Low item is a status-line follow-up that the spec permits.
