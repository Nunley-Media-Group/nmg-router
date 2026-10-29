# Verification Report: Publish the selected routed model's plan usage for a custom statusLine command

**Date**: 2026-10-29
**Issue**: #43
**Reviewer**: Claude Code (nmg-sdlc verify worker, controller run 5854bb93-4b25-4d7d-bd41-400ff450a19a)
**Scope**: Implementation verification against spec

**Verification head**: 995efba4fde22cd34d1d3f15edf490c1ab35e889

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 1 (Low, not blocking)

All seven acceptance criteria are implemented and were exercised live in a herdr Claude session with the mod loaded from this branch. The three registered validations passed at the verification head. One low-severity robustness note is recorded below.

---

## Issue Scope

- Active issue: #43
- Spec: `specs/43-publish-the-selected-routed-model-s-plan-usage-for-a-custom-statusline-command`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":43,"specPath":"specs/43-publish-the-selected-routed-model-s-plan-usage-for-a-custom-statusline-command","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 43 --spec specs/43-… --base main --controller-run-id 5854bb93-4b25-4d7d-bd41-400ff450a19a`
- Artifact: `.nmg-sdlc/verification/43.json`, generated 2026-10-29T22:19:03Z
- Identity: head `995efba4fde22cd34d1d3f15edf490c1ab35e889`, tree clean, steering `sha256:75b22afe…49da`, spec `sha256:7e8f1e29…89b2`
- Coverage: declared 3, recorded 3, complete `true`; no missing, duplicate or unknown results
- Ceiling: none

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `npm run typecheck` (`tsc --noEmit`) exited 0 |
| `repository.tests` | yes | passed | `npm test`: 75 files, 663 tests passed |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .`: "Validation passed with warnings" (directory-policy notes only) |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A routed step publishes the selected provider's windows | Pass | `src/usage/status-snapshot.ts` (`snapshotPath`, `configDirOf`, `windowsOf`, `createStatusSnapshotWriter`); `src/routing/router.ts` `show()` / `showStep()`. Unit: "writes the version-1 snapshot through a temp file…", "writes under CLAUDE_CONFIG_DIR when it is set", "writes the file in place on Windows…", router "publishes the windows an OpenAI Codex response's headers report…". Live (run 3): `~/.claude/nmg-router/status/<session>.json` named `opencode-go`, `opencode-go/glm-5.3` and `5h`, `weekly`, `monthly` in order, with `resetsAt` in epoch ms (`1793330413000`) |
| AC2 | A reading that arrives later updates the snapshot | Pass | `redraw()` calls `show({ ...shown, usage }, shownSessionId)` under the existing provider/account/error guards. Unit: "publishes the model with no windows, then the windows once the provider's reading settles". Live: the first glm-5.3 step's snapshot carried the background read's windows; a later step updated `5h` from 1 % to 2 % and `monthly` from 15 % to 16 % |
| AC3 | Switching providers never shows the earlier provider's windows | Pass | `redraw()` returns when `shown.provider.id !== provider`. Unit: "publishes the new provider with no windows when a step on another provider completes before the earlier reading finishes" (held OpenCode Go read released after the xAI step publishes nothing more). Live (run 7): after OpenCode Go's windows, a `fakelocal/fake-small` step (no usage source) left the snapshot naming `fakelocal` and `fakelocal/fake-small` with `"windows": []`. The late-read race itself is unit-only (the interactive session cannot hold a read open) |
| AC4 | Errors and Claude steps clear the windows | Pass | `failure()` publishes the error state (no `usage`); `claudeStep()` calls `snapshot.clear(shownSessionId)`. Unit: "publishes a failed step with no windows, and a Claude main-loop step clears the snapshot", writer "writes a clear after a show, in call order…". Live: run 1 (`opencode-go/glm-5.1`, HTTP 410) wrote `provider`/`model` with `"windows": []`; run 4 (`/model sonnet`, Claude step) wrote `{ "version": 1, "sessionId", "windows": [] }` |
| AC5 | The snapshot never affects the routed step | Pass | `quietly()` around every writer call in `router.ts`; the writer's queue ends with `.catch(() => undefined)`. Unit: "leaves the step's answer, chunks and status line unchanged when the writer throws", "writes nothing and does not throw when mkdir exits non-zero / cannot start / the platform cannot be read". Live (run 9): with a plain file in place of the `status` folder, the routed step answered `blocked`, the `⚠ nmg-router: opencode-go/glm-5.3 · …` line still showed its windows, and no error appeared |
| AC6 | No secret; only valid session ids name a file | Pass | `SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/`; POSIX path does `mkdir -p -m 700`, `chmod 700`, temp write, `chmod 600`, `mv -f`. Unit: "accepts a session id of 1 to 128 letters, digits, _ or -" (rejects `../x` and empty), "writes only the snapshot's own fields, with no account, token or key", the Linux temp/`mv` test. Live: folder `drwx------`, file `-rw-------`, no `*.tmp` left after any run, and `grep -ciE "token|key|account|@"` on the file returned 0. The invalid-id case is unit-only (Claude Code chooses the session id) |
| AC7 | Subagent steps leave the snapshot alone | Pass | `showStep`/`failure` publish only when `e.agentId === undefined`; `claudeStep` returns for subagents. Unit: "leaves the snapshot alone on a routed or a Claude subagent step". Live (run 6): a 50 ms mtime watcher saw writes at 17:21:14, 17:21:17 and 17:21:41, matching the three main-loop steps (17:21:13, 17:21:17, 17:21:41); the routed subagent's steps at 17:21:16 and 17:21:40 wrote nothing |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add the status snapshot writer | Complete | `src/usage/status-snapshot.ts` exports `StatusSnapshot`, `StatusSnapshotWriter`, `snapshotPath`, `createStatusSnapshotWriter` with the designed signatures |
| T002 | Publish from the router, wire in register | Complete | `createRouter(…, snapshot?)` sixth parameter; `hooks/register.ts` builds the writer from the router's host port and `servicesFor(host).platform()`, passing no `$` to a nested function |
| T003 | Document the snapshot contract | Complete | README "Status-line snapshot": paths for macOS/Linux and Windows, `CLAUDE_CONFIG_DIR` rule, v1 fields, `sessionId`/`model` matching rule, failure/Claude/subagent behavior |
| T004 | Test the snapshot writer | Complete | `tests/usage/status-snapshot.test.ts`, 12 tests |
| T005 | Test the router's snapshot publishing | Complete | `tests/routing/usage-status.test.ts` "the routed status snapshot", 7 tests; `tests/support/routing.ts` gains a recording writer |

Version bumped 0.13.0 → 0.14.0 in `VERSION`, `package.json` and `.claude-plugin/plugin.json`, with a CHANGELOG entry.

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The writer owns path, serialization and file mechanics; the router only decides when to publish |
| Open/Closed | 5 | The writer is an optional injected port; absent means no snapshot work |
| Liskov Substitution | 5 | Test writer and real writer share `StatusSnapshotWriter` |
| Interface Segregation | 5 | Writer needs only `Pick<HostPort, "env" \| "fs" \| "process">` and a platform thunk |
| Dependency Inversion | 5 | No `$` or Node `fs` in `src/`; all I/O through the host port |

### Layer Separation

`hooks/register.ts` stays thin (one constructor call). `src/usage/status-snapshot.ts` sits beside the usage monitor it serializes. Path and window mapping are pure helpers.

### Dependency Flow

`router.ts` imports only the writer's type. `register.ts` composes the concrete writer. No cycles.

---

## Security Assessment

- [x] Authentication: no credential is read; the snapshot is built from provider id, model id and windows only
- [x] Authorization: POSIX folder `0700`, file `0600`, verified live
- [x] Input validation: session id allow-list blocks path traversal (`../x` gives no path)
- [x] Injection prevention: process calls use argv arrays; no shell interpolation of the path or JSON
- [x] Data protection: window objects are rebuilt field by field, so `id` and any extra report fields are dropped; no token, key, account name or id reaches the file (unit and live check)

---

## Performance Assessment

- [x] Async patterns: writes queue off the step; `show()` stays synchronous for the status line
- [x] Caching: no new provider reads; reuses the monitor's latest report
- [x] Resource management: up to four short `mkdir`/`chmod`/`mv` processes per write on POSIX, only on main-loop status changes
- [x] Query optimization: N/A

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Vitest) | Yes |
| AC2 | Yes (SCN002) | Yes (Vitest) | Yes |
| AC3 | Yes (SCN003) | Yes (Vitest) | Yes |
| AC4 | Yes (SCN004) | Yes (Vitest) | Yes |
| AC5 | Yes (SCN005) | Yes (Vitest) | Yes |
| AC6 | Yes (SCN006) | Yes (Vitest) | Yes |
| AC7 | Yes (SCN007) | Yes (Vitest) | Yes |

### Coverage Summary

- Feature files: 7 scenarios in `feature.gherkin`, each realized as a named Vitest case (the project has no Cucumber runner, as in earlier specs)
- Unit tests: 19 new (12 writer, 7 router); full suite 663 passed
- Type-check: pass

---

## Interactive Verification (herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-43 --no-focus`; `herdr agent start verify-43 --kind claude --pane w0:p2 -- --plugin-dir . --settings '{"enabledPlugins":{"nmg-router@nmg-plugins":false}}' --model opencode-go/glm-5.1` |
| **Host** | Claude Code v2.1.312, session `35ce4e21-d977-4474-9a1e-fdc20a8077c1` |
| **Providers** | OpenCode Go (logged in, has a usage source); Fake Local custom provider (logged in, no usage source, stub server not running) |
| **Dialogs** | No folder-trust prompt. The `/model` switch confirmations were planned. The "model isn't recognized · context assumed to be 200k" notice is the host's normal note for routed ids |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | "Reply with exactly the word: pong" on `opencode-go/glm-5.1` | Provider refused (HTTP 410); snapshot named the model with no windows; dir `0700`, file `0600` | `⏺ OpenCode Go refused the request (HTTP 410).` / `⚠ nmg-router: opencode-go/glm-5.1 · OpenCode Go error: provider_error`; `"provider": "opencode-go", "model": "opencode-go/glm-5.1", "windows": []` |
| 2 | `/model opencode-go/glm-5.3` | Switched (routed → routed) | `🧠 model: OpenCode Go · glm-5.3` |
| 3 | "Reply with exactly the word: pong" | Answered; snapshot had three windows in order | `⏺ pong`; `⚠ nmg-router: opencode-go/glm-5.3 · thinking unsupported · 5h 1% · weekly 31% · monthl…`; `"label": "5h", "usedPercent": 1, "resetsAt": 1793330413000` … `weekly` 31 … `monthly` 15 |
| 4 | `/model sonnet`, then "Reply with exactly the word: ping" | Routed line gone; snapshot cleared | `🧠 model: Sonnet`; `{ "version": 1, "sessionId": "35ce4e21-…", "windows": [] }` |
| 5 | `/model opencode-go/glm-5.3` | Switched back (Claude → routed) | confirmation dialog `Yes, switch to OpenCode Go · glm-5.3` |
| 6 | "Use the Agent tool exactly once to launch a general-purpose subagent… sleep 20…" | Routed subagent ran (`opencode-go/glm-5.3` in its transcript); snapshot written only on main-loop steps | `⏺ done` / `Agent "Run sleep command" finished · 25s`; watcher: writes 17:21:14, 17:21:17, 17:21:41; subagent steps 17:21:16, 17:21:40 |
| 7 | `/model fakelocal/fake-small`, then "Reply with exactly the word: fake" | Step failed (stub offline); snapshot switched to the new provider with no OpenCode Go windows | `⚠ nmg-router: fakelocal/fake-small · Fake Local error: network`; `"provider": "fakelocal", "model": "fakelocal/fake-small", "windows": []` |
| 8 | Status dir `chmod 500`, `/model opencode-go/glm-5.3`, "…readonly" | The writer re-applies `0700` to its own folder and wrote normally (expected) | `5h 2% · weekly 31%`; snapshot `usedPercent` 2 / 31 / 16 |
| 9 | `status` replaced by a plain file, "Reply with exactly the word: blocked" | Step answered; routed status line unchanged; no error shown; folder restored afterwards | `⏺ blocked` / `⚠ nmg-router: opencode-go/glm-5.3 · thinking unsupported · 5h 2% · weekly 31% · monthl…` |

The person's own `statusLine` script also read the snapshot during the run: on glm-5.3 it drew `⚡ 5h: 1% … ⚡ weekly: 31% … ⚡ monthly: 15%`, and it dropped those rows after `/model fakelocal/fake-small`, when the snapshot's `model` no longer matched. This is end-to-end evidence for the README matching rule (FR5).

Cleanup: the tab was closed, the watcher stopped, the `status` folder was restored to `0700` with the session file, and the person's default `model` setting, which the `/model` switches had left at `opencode-go/glm-5.3`, was set back to `opus` (the value earlier verification runs recorded). No token, key, account or email appears in these excerpts.

---

## Fixes Applied

None. The verify publication scope allows writing only this report.

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `src/usage/status-snapshot.ts` `write()` (POSIX branch) |
| **Issue** | When `chmod 600` or `mv -f` fails after the temp file is written, the `<id>.json.<nonce>.<n>.tmp` file is left in the status folder |
| **Impact** | A stray temp file inside the `0700` folder; it holds the same non-secret snapshot and no reader uses it. Not observed in any live run |
| **Reason Not Fixed** | Outside the spec's ACs and outside this verify step's write scope; a candidate for a follow-up issue |

---

## Positive Observations

- The writer reuses the router's single host port and the shared services' platform, so no second `$` path or service instance appears.
- `quietly()` plus the queue's trailing `catch` give two layers of isolation, and the live failure run confirmed the step is untouched.
- Window objects are rebuilt from three named fields, so a future report field cannot leak into the file by accident.

---

## Recommendations Summary

### Before PR (Must)
- None

### Short Term (Should)
- [ ] Remove the temp file when `chmod 600` or `mv` fails (Low)

### Long Term (Could)
- [ ] Delete snapshot files of ended sessions (explicitly out of scope for #43)

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/usage/status-snapshot.ts` | 1 (Low) | New writer |
| `src/routing/router.ts` | 0 | `show`, `redraw`, `failure`, `claudeStep` publish/clear |
| `hooks/register.ts` | 0 | Writer wiring, no `$` passed down |
| `README.md` | 0 | Snapshot contract |
| `tests/usage/status-snapshot.test.ts` | 0 | New |
| `tests/routing/usage-status.test.ts`, `tests/support/routing.ts` | 0 | Router publishing tests and recording writer |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md` | 0 | 0.14.0 |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes with unit and live interactive evidence, all three registered validations passed with complete coverage at `995efba4fde22cd34d1d3f15edf490c1ab35e889`, and the one remaining finding is low severity and outside the spec.
