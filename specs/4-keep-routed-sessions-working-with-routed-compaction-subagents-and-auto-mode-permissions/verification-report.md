# Verification Report: Keep routed sessions working with routed compaction, subagents and auto-mode permissions

**Date**: 2026-10-26
**Issue**: #4
**Reviewer**: Claude Code (nmg-sdlc verify worker, run 4eeb0783-7f59-4745-9484-e0602918f909)
**Scope**: Implementation verification against spec
**Verification head**: 2efb70459c846d2601d3dee717e5eb069365c3b8

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 3 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.3 |

### Implementation Status: Fail
**Total Issues**: 7 (3 High, 1 Medium, 3 Low)

The previous verification's blocker is fixed. `85a4086` drops `"required": true`, and a fresh `claude --plugin-dir .` session now loads the hooks module with every #4 event registered: `session.compact`, `turn.complete`, `tool.check` and the three classic observers. The registered gate is complete and green: typecheck, 397 Vitest tests in 55 files, and `claude plugin validate .`.

The live herdr run passes AC4, AC5 and AC7, along with the manual `/compact` and failure paths of AC1 and AC2. It fails three behaviors that the unit fakes don't model:

1. **H1. The mod's own compaction trigger bypasses the mod.** `$.session.compact()` "runs through every hook but the calling one" (host docs), so nmg-router's `session.compact` hook is skipped. Claude's summarizer runs instead and sends the routed transcript to Anthropic's `/v1/messages` (`source=compact`, model `fakelocal/fake-small`). Anthropic rejected it with 404, and the trigger retries at every turn end. This breaks AC1's "mod's own threshold" trigger and AC2's "reaching it starts compaction", and it violates "no request goes to Anthropic".
2. **H2. A routed subagent can't hand back its report.** The host requires subagents to finish with the deferred tool `SubagentHandback`. The routed request never offers it: it has no schema in `BUILTIN_TOOL_SCHEMAS`, and tools discovered through `ToolSearch` aren't added. The subagent answered `5` on `opencode-go/glm-5.3`, then looped on `[handback-send-enforce]`, and the caller got no report (AC3).
3. **H3. `server-classifier-off` still denies routed Bash calls.** The mod answers `ask`, but in auto mode the host still consults the server classifier for a hook's ask ("no classifier's allow settles it, its block still refuses"). The classifier's fail-closed "unavailable" refuses the call with the same "gave no verdict" error this issue set out to remove (AC6).

---

## Issue Scope

- Active issue: #4
- Spec: `specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC7]; FR [FR1–FR6]; tasks [T001–T008]; scenarios [SCN001–SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":4,"specPath":"specs/4-keep-routed-sessions-working-with-routed-compaction-subagents-and-auto-mode-permissions","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --base main --controller-run-id 4eeb0783-7f59-4745-9484-e0602918f909` wrote `.nmg-sdlc/verification/4.json` with `ok: true` and `ceiling: null`. Coverage was declared 3, recorded 3, complete, with no missing, duplicate or unknown results. Identity: head `2efb7045…`, steering `sha256:75b22afe…`, spec `sha256:79a2874b…`, tree clean.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| repository.typecheck | builtin.command | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| repository.tests | builtin.command | yes | passed | `npm test`: 55 files, 397 tests passed |
| repository.plugin-manifest | builtin.command | yes | passed | `claude plugin validate .` exited 0 |

The deterministic ceiling is none. The overall status is Fail because of the interactive findings H1–H3.

---

## Acceptance Criteria Verification

"Code" is the static review plus the unit tests. "Live" is the herdr session that the project's interactive verification steering requires.

| AC | Description | Code | Live | Status | Evidence |
|----|-------------|------|------|--------|----------|
| AC1 | Routed compaction | Pass | Partial | Fail | Manual `/compact keep the codeword` on a routed model: the summary came from the provider with the focus text, and the log reads "a hook's 1 messages stand … core never ran", with no `/v1/messages` call. On Claude, `/compact` reached core (`source=compact` on Haiku). The mod's own threshold trigger skips the mod's hook, so the summary went to Anthropic (H1) |
| AC2 | Context window and failure | Pass | Partial | Fail | Threshold math: `thresholdTokens(128000)` = 108800 (unit). Live, the trigger fired at 5020 ≥ 3616 tokens (20000-token window), but compaction ran on Claude's summarizer and was rejected (H1). Failure path: `Not compacted · Fake Local could not summarize this conversation (server_error); it was not compacted.`, with core not run and no Claude fallback |
| AC3 | Subagents by their own model | Pass | Partial | Fail | A Claude subagent under a routed main loop passed through: `CLAUDE-SUB: 4+4 = 8`, dispatched to `claude-haiku-5-5`, and the main status line stayed `opencode-go/kimi-k3`. The routed subagent on `opencode-go/glm-5.3` under a Claude main loop was answered by its provider, but it couldn't call `SubagentHandback`, so no report reached the caller (H2). Subagent compaction on its own model is unit evidence only |
| AC4 | Auto-mode permission setting | Pass | Pass | Pass | Row unset with a Claude login: routed Bash went through the Claude classifier (AC5 evidence). Row set to `server-classifier-off` through `--settings` `pluginConfigs`: the server-off policy decided (confirmed by a diagnosis build, below) |
| AC5 | Claude classifier mode | Pass | Pass | Pass | `tool.check Bash call_76ac…_0_0: ask -> allow by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call`, after a Claude side query; output `AC5-RUN- 8` |
| AC6 | Server classifier off mode | Pass | Fail | Fail | The hook answered `ask`, then the host logged `Auto mode classifier unavailable, denying with retry guidance (fail closed)`. Tool result: "The server-side auto mode classifier gave no verdict for Bash…" (H3) |
| AC7 | Rules and Claude steps unchanged | Pass | Pass | Pass | Deny rule `Bash(echo AC7-DENY:*)` gave "Permission to use Bash with command echo AC7-DENY hello has been denied." with no plugin verdict. In manual mode the host's own "Do you want to proceed?" dialog appeared. A Claude (Haiku) Bash call in auto mode passed through, the server classifier allowed it, and it printed `AC7-CLAUDE- 8` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Session tracker and router updates | Complete | `src/routing/session-tracker.ts`, `src/routing/router.ts` |
| T002 | Summary request, prompt and threshold | Complete | `src/compaction/summary-request.ts`, `summary-prompt.ts`, `threshold.ts` |
| T003 | Compaction hook and auto trigger | Complete as specified | The trigger follows the design, but the design's `$.session.compact()` can't reach the mod's own hook (H1) |
| T004 | Permission mode, policies and tool check | Deviates | The row has no `options` (M1). The server-off policy follows the design, but the host doesn't honor its `ask` in auto mode (H3) |
| T005 | Hook wiring | Complete | `hooks/register.ts` |
| T006 | Fake engine extensions | Complete | The fakes don't model host re-entry, `SubagentHandback` or the classifier's block on a hook's ask |
| T007 | Compaction and subagent tests | Complete | |
| T008 | Permission tests | Complete | `tests/manifest/user-config.test.ts` added by `85a4086` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Each new file has one job; `router.ts` is large but shares one `send` |
| Open/Closed | 4 | `PermissionPolicy` is a strategy chosen by `policyFor` |
| Liskov Substitution | 5 | Both policies honor the same `decide` contract |
| Interface Segregation | 4 | Narrow deps types per module; `RouterHost` keeps growing |
| Dependency Inversion | 4 | `src/` takes host ports and never touches `$` |

### Layer Separation

`hooks/register.ts` only wires hooks and spells out host calls literally. Translation, summary building and the threshold are pure functions.

### Dependency Flow

Compaction and permissions depend on `routing/`, and nothing depends back on them.

---

## Security Assessment

- [x] Authentication: only `authorize()`'s nullness is read, once per session.
- [x] Authorization: rule, hook and setting verdicts are never overridden (live AC7).
- [x] Input validation: classifier labels are restricted to `allow|ask|deny`.
- [x] Injection prevention: model output and tool input never reach a shell command.
- [ ] Data protection: H1 sends the routed transcript to Anthropic on the user's Claude login. That breaks the "no request goes to Anthropic" rule for routed compaction. The guard on `router.complete` itself is intact.

---

## Performance Assessment

- [x] One summary request, with no tools or reasoning and a capped `maxOutput`.
- [x] A `pending` flag limits compaction to one at a time.
- [ ] H1's retry sends another failing Anthropic compaction at every routed turn end while the context stays over the threshold.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Vitest | Yes (unit) / Partial (live) |
| AC2 | Yes (SCN002) | Vitest | Yes (unit) / Partial (live) |
| AC3 | Yes (SCN003) | Vitest | Yes (unit) / Partial (live) |
| AC4 | Yes (SCN004) | Vitest | Yes / Yes |
| AC5 | Yes (SCN005) | Vitest | Yes / Yes |
| AC6 | Yes (SCN006) | Vitest | Yes (unit) / No (live) |
| AC7 | Yes (SCN007) | Vitest | Yes / Yes |

### Coverage Summary

- Unit tests: 397 tests in 55 files, all passing.
- Gap: `tests/support/fake-engine.ts` runs the mod's own hook for `$.session.compact()`, offers no `SubagentHandback`, and treats a hook's `ask` as final in auto mode. Each of these differs from host 2.1.310.

---

## Exercise Test Results (interactive herdr session)

| Field | Value |
|-------|-------|
| **Skill Exercised** | n/a: a mod's hooks module, driven by the project's herdr interactive procedure |
| **Test Project** | `/Volumes/Fast Brick/source/repos/nmg-router` at `2efb704` |
| **Exercise Method** | `herdr tab create --cwd <repo> --label verify-4 --no-focus`; `herdr agent start verify-4 --kind claude --pane <pane> -- --plugin-dir .`, then relaunches in the same pane with `--model`, `--agents`, `--settings` and `--debug-file` |
| **Interactive gate handling** | No folder-trust or other startup dialogs |

The threshold and failure scenarios used a local fake OpenAI-compatible provider: a custom provider `fakelocal` on `https://127.0.0.1:18765`, with a self-signed certificate trusted for the session only, a 20000-token window (threshold 3616), and every reply reporting 5000 prompt tokens. Its log records each request's model, whether it was a summary request, and the focus text. The real-provider scenarios used OpenCode Go, which was already logged in. No credential was typed. The fake provider's login used a dummy non-secret key.

| # | Prompt / action | Observed | Excerpt |
|---|-----------------|----------|---------|
| 0 | Startup, row unset | Module loaded, no errors | `hooks module nmg-router@inline loaded …; events: command.run,prompt.compose,turn.step,session.compact,turn.complete,tool.check,classic.UserPromptSubmit,classic.PermissionRequest,classic.PostToolUse,ui.render,ui.close` |
| 1 | `fakelocal/fake-small`: "Remember the codeword BANANA-42." | Routed reply, then the mod trigger fired and Claude's summarizer ran | `⏺ FAKE-REPLY from fake-small` / `$.session.compact (nmg-router): compacting` / `nmg-router@inline session.compact skipped: re-entry (the plugin's own code raised it; origin nmg-router)` / `[API REQUEST] /v1/messages … source=compact` / `404 … model: fakelocal/fake-small` / `nmg-router could not start compaction; it will be retried at the next turn end.` |
| 2 | `/compact keep the codeword` (routed) | Routed summary replaced the conversation | provider log `summary=true focus=keep the codeword tools=0` / `session.compact (manual): a hook's 1 messages stand (hooked by nmg-router+…); core never ran` / `FAKE-SUMMARY of the session (focus: keep the codeword)` |
| 3 | Provider failing summaries, `/compact` | Skip notice naming the provider | `Not compacted · Fake Local could not summarize this conversation (server_error); it was not compacted.` |
| 4 | `/model haiku`, "What codeword was given earlier?", then `/compact` | Claude kept context, and its compaction passed through to core | `⏺ BANANA-42` / `[API REQUEST] /v1/messages … source=compact` / `Compacted` |
| 5 | `/model fakelocal/fake-small` | Host rejected the routed id | `Model 'fakelocal/fake-small' not found`. Picker rows are #5's scope, so later Claude→routed switches used `--model` at launch, as #3 did |
| 6 | Main `haiku`, `--agents` `routed-helper` on `opencode-go/glm-5.3`: "Use the routed-helper subagent…" | Provider answered, but no handback | Subagent transcript: `assistant[opencode-go/glm-5.3]: 5` … `[handback-send-enforce] Your report has not been delivered. Call SubagentHandback(…)` … "the tool is not defined in this session" |
| 7 | Main `opencode-go/kimi-k3`, `claude-helper` on `haiku` | Passthrough | `CLAUDE-SUB: 4+4 = 8` / `source=agent:custom:claude-helper` / status `nmg-router: opencode-go/kimi-k3 · thinking high` |
| 8 | kimi-k3, auto mode, row unset: `echo AC5-RUN-$(whoami \| wc -c)` | Claude classifier allowed it | `ask -> allow by plugin nmg-router: nmg-router: Claude classifier verdict for a routed call` / `AC5-RUN- 8` |
| 9 | Row `server-classifier-off` (`--settings`): `echo AC6-RUN-…` | Denied twice | `Auto mode classifier unavailable, denying with retry guidance (fail closed)` / "The server-side auto mode classifier gave no verdict for Bash…" |
| 10 | Diagnosis: disposable worktree whose server-off policy returns `deny` / `DIAG-SERVER-OFF` | The row reached the policy | `tool.check Bash …: ask -> deny by plugin nmg-router: DIAG-SERVER-OFF` |
| 11 | Deny rule `Bash(echo AC7-DENY:*)`: `echo AC7-DENY hello` | Rule verdict kept | "Permission to use Bash with command echo AC7-DENY hello has been denied." |
| 12 | Manual mode: `echo AC7-MANUAL-…` | Host dialog unchanged | `Do you want to proceed? ❯ 1. Yes …` (cancelled) |
| 13 | Haiku, auto mode: `echo AC7-CLAUDE-…` | Passthrough, server classifier allowed it | `AC7-CLAUDE- 8` |

The tab was closed, the diagnosis worktree was removed, and the shared checkout stayed clean at the verification head.

### AC Evaluation

AC4, AC5 and AC7 pass live. AC1, AC2 and AC3 pass only in part, and AC6 fails, so the overall status is Fail.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. This worker's publication scope allows writing only `verification-report.md` | — | implementation |

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Architecture / Security |
| **Location** | `src/compaction/auto-trigger.ts` (`compact: () => host.session.compact()` in `hooks/register.ts`) |
| **Issue** | (H1) `$.session.compact()` skips the calling plugin's own `session.compact` hook. The mod-started compaction therefore runs Claude's summarizer on the routed transcript and sends it to Anthropic |
| **Impact** | AC1 and AC2 fail for the mod's own threshold. Routed conversation content reaches Anthropic, which breaks the no-Anthropic rule. The failing request repeats at every turn end |
| **Reason Not Fixed** | This needs a design change. For example, the trigger could summarize through `router.complete` itself, or start compaction through a path the mod's hook observes. It must never let core summarize a routed model. Outside the report-only scope |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functionality |
| **Location** | `src/tools/offered-tools.ts`, `src/tools/builtin-schemas.ts`, the routed request's tool list |
| **Issue** | (H2) A routed subagent can't call `SubagentHandback`. It has no registry schema, and tools discovered through `ToolSearch` never join the routed request |
| **Impact** | Routed subagents never deliver a report, so AC3's routed half doesn't work |
| **Reason Not Fixed** | Needs a schema for `SubagentHandback` and support for deferred tools discovered in the transcript, plus a fake-engine handback model. Outside the report-only scope |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functionality / Spec |
| **Location** | `src/permissions/policy.ts` (`serverClassifierOffPolicy`) |
| **Issue** | (H3) In auto mode, the host still consults the server classifier for a hook's `ask`, and the classifier's fail-closed refusal denies the call. The spec's premise that "a hook's ask goes to the person rather than to the classifier" doesn't hold on 2.1.310 |
| **Impact** | AC6 fails, and routed Bash calls stay blocked without a Claude login |
| **Reason Not Fixed** | The spec and design need amending, for example to have the mod ask the person itself and then answer `allow` or `deny`. Outside the report-only scope |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Spec drift |
| **Location** | `.claude-plugin/plugin.json`, design.md "Configuration", T004 |
| **Issue** | (M1) The row is now a free string with no `options`. The host requires a row with options to have a default or be required, so the design's "two options, no default" can't be built. The values appear only in the description, and any other value is treated as unset |
| **Impact** | FR4's "values `claude-classifier` and `server-classifier-off`" holds by description, not by a picker. The approved design no longer matches the code |
| **Reason Not Fixed** | Amend design.md and T004 to record the host constraint |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Functionality |
| **Location** | `src/login/login-command.ts` (`needs no login`), `src/routing/router.ts` (`describe`) |
| **Issue** | (L1) A custom provider with `auth: "none"` never refreshes the catalog, so `describe()` has no window and the mod's threshold never fires for its models |
| **Impact** | Silent: those models fall back to the engine's assumed 200k window |
| **Reason Not Fixed** | Outside the ACs' wording; track as a follow-up |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Security |
| **Location** | `src/permissions/policy.ts:29` |
| **Issue** | (L2) The classifier text embeds the routed tool input verbatim |
| **Impact** | Limited: labels are restricted, and rules still win |
| **Reason Not Fixed** | Within the approved design; fence the input in a follow-up |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Versioning |
| **Location** | `CHANGELOG.md`, `VERSION` |
| **Issue** | (L3) Two deliver commits bumped the version twice from `main`'s 0.6.0. `[0.7.0]` and `[0.8.0]` both carry the same #4 entry |
| **Impact** | A duplicate release entry |
| **Reason Not Fixed** | Outside the report-only scope; collapse to one release at the next delivery |

---

## Positive Observations

- The load blocker from the previous run is fixed, and `tests/manifest/user-config.test.ts` now guards against it.
- Manual routed compaction works end to end, and its failures end in `{ skip }`, with no Claude fallback.
- The Claude-classifier policy works live, and rule, manual-mode and Claude-model verdicts stay untouched.
- Subagent steps don't move the main status line.

---

## Recommendations Summary

### Before PR (Must)
- [ ] H1: make the mod's own threshold compaction summarize on the routed model, never on core
- [ ] H2: offer `SubagentHandback` and other discovered deferred tools to routed requests
- [ ] H3: amend the spec and design for AC6 so a routed call in `server-classifier-off` reaches the person under host 2.1.310
- [ ] Extend the fake engine to model host re-entry, handback and the classifier's block on a hook's ask
- [ ] Re-run the full interactive herdr procedure

### Short Term (Should)
- [ ] M1: amend design.md and T004 for the row without options
- [ ] L1: refresh the catalog for no-auth custom providers

### Long Term (Could)
- [ ] L2: fence the tool input in the classifier prompt
- [ ] L3: collapse the duplicate changelog release

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `.claude-plugin/plugin.json` | 1 | M1 |
| `hooks/register.ts` | 1 | H1 wiring |
| `src/compaction/*.ts` | 1 | H1 |
| `src/permissions/policy.ts` | 2 | H3, L2 |
| `src/permissions/mode.ts`, `tool-check.ts`, `permission-mode.ts` | 0 | |
| `src/routing/router.ts`, `session-tracker.ts`, `turn-step.ts` | 1 | L1 (`describe`) |
| `src/tools/offered-tools.ts`, `builtin-schemas.ts` | 1 | H2 |
| `tests/manifest/user-config.test.ts` | 0 | New |
| `tests/support/fake-engine.ts` | 1 | Test gap |
| `CHANGELOG.md` | 1 | L3 |

---

## Recommendation

**Needs fixes**

The registered gate is green, and the mod now loads. Live verification shows that three host behaviors break the design: self-raised compaction, subagent handback, and the classifier's block on a hook's ask. AC1, AC2, AC3 and AC6 don't hold in a real session, and one of these sends a routed transcript to Anthropic. Route the work back to implementation and spec amendment, then re-run the full interactive verification.
