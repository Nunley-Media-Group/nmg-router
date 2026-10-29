# Verification Report: Show provider plan usage in the routed status line and /usage

**Date**: 2026-10-29
**Issue**: #40
**Reviewer**: Claude Code (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec

**Verification head**: c1c6b01a2226cf8db697883e3b8914d197fc96c7

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 0 code defects. 0 open evidence gaps. AC5 and the windows half of AC10 are accepted on unit evidence by the person's explicit decision (see below).

The code meets every acceptance criterion and functional requirement in unit tests. All three registered validations passed at the verification head (run H, controller run `5854bb93-4b25-4d7d-bd41-400ff450a19a`). Live herdr sessions showed AC1, AC2, AC6, AC7, AC8, AC9 and AC11 working end to end, and AC3, AC4, AC10 and AC12 in part. These were seen live:

- `/usage` drew the built-in panel, then `Provider plan usage`, `Fake Local` / `No usage reading available`, and OpenCode Go's `5h`/`weekly`/`monthly` lines with reset times.
- A routed OpenCode Go step showed `opencode-go/glm-5.3 · thinking unsupported · 5h 5% · weekly 29% · monthl…`.
- A failed Fake Local step showed `fakelocal/fake-small · Fake Local error: network` with no windows.
- A Claude step cleared the line.
- With a local CONNECT proxy refusing only OpenCode Go's usage read (AC6), the routed step still answered `delta`, the status line kept the last good windows, and the debug log had only `OpenCode Go usage unavailable: offline`.
- A renamed copy of the plugin loaded as its own instance with no logins (re-verify run E). `/usage` drew only the built-in panel. nmg-router added no rows and made no usage request (AC11).

**Person's explicit decision (2026-10-29), relayed by the nmg-sdlc supervisor:** drop the OpenAI Codex plan login requirement. It is not useful and will not be provided. AC5 (Codex usage from `x-codex-*` headers) and the "other provider shows its windows" half of AC10 are accepted on unit evidence, as the person decided for AC8's two-account part on #2. Gaps G1 and G3 are therefore marked accepted on unit evidence and do not cap the status. Before the decision, run H confirmed live that `OpenAI Codex — not logged in` still held for `nmg-router@inline`. The login poll was stopped and the `verify-40` tab closed. No login was started and no credential was typed or printed.

No code change is needed.

---

## Issue Scope

- Active issue: #40
- Spec: `specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC12]; FR [FR1–FR9]; tasks [T001–T008]; scenarios [SCN001–SCN012]
- Regression: none

<!-- nmg-sdlc-issue-scope: {"issueNumber":40,"specPath":"specs/40-show-provider-plan-usage-in-the-routed-status-line-and-usage","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass (AC5 and the windows half of AC10 accepted on unit evidence by the person's explicit decision, 2026-10-29)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --base main --controller-run-id 5854bb93-4b25-4d7d-bd41-400ff450a19a` (2026-10-29, run H) returned `ok: true` and `ceiling: null`
- Artifact: `.nmg-sdlc/verification/40.json` at head `c1c6b01…` (the only working-tree change was this untracked report)
- Coverage: declared 3, recorded 3, complete `true`, with no missing, duplicate or unknown results

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.typecheck` | yes | passed | `tsc --noEmit` exited 0 |
| `repository.tests` | yes | passed | `Test Files 74 passed (74)`, `Tests 636 passed (636)` |
| `repository.plugin-manifest` | yes | passed | `claude plugin validate .`: `✔ Validation passed with warnings` (author, root CLAUDE.md and icon notices only). The hook list includes `command.run{command=usage}` with `.catch` |

`steering/manifest.json` declares no smoke validation (`repository.nmg-sdlc-smoke` / `project.nmg-sdlc-smoke`).

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Status line shows the selected provider's windows | Pass | `src/routing/router.ts` `showStep()` → `renderStatus()` in `src/routing/status.ts`. Unit: `tests/routing/usage-status.test.ts` "shows the model, thinking level and each window…". Live: `⚠ nmg-router: opencode-go/glm-5.3 · thinking unsupported · 5h 5% · weekly 29% · monthl…`. The host truncated the line at the terminal width |
| AC2 | Switching providers switches the usage shown | Pass | `redraw()` re-renders only when `shown.provider.id`/`account` match and there is no error. Unit: "shows only the new provider's line when a step on another provider completes before the earlier reading finishes". Live: after OpenCode Go's windows, a Fake Local step showed `fakelocal/fake-small · Fake Local error: network` with none of OpenCode Go's windows |
| AC3 | A provider without a usage source shows no usage | Pass (live partial) | `showStep()` returns before any read when `plugin.usage` is undefined. `xai.ts` and `cline-pass.ts` declare no `usage`. Unit: "shows xAI and ClinePass as model and thinking only, and sends no usage request". Live: Fake Local (no usage source) listed as `No usage reading available` in `/usage`. A successful no-source step was not seen live, because the Fake Local stub (`https://127.0.0.1:18765`) was not running |
| AC4 | Reads throttled per provider and account | Pass (live partial) | `src/usage/monitor.ts` `READ_INTERVAL_MS = 60_000`, counted from the read's start, with in-flight reads shared. Unit: `tests/usage/monitor.test.ts` (59 999 ms no call, 60 000 ms one call) and "sends one usage request per minute at most…". Live: a second OpenCode Go step within 60 s showed the same kept windows. The request count is unit-only |
| AC5 | Codex usage comes from response headers | Pass (accepted on unit evidence by the person's explicit decision, 2026-10-29) | `parseCodexUsageHeaders` in `src/providers/builtin/openai-codex.ts`, and `showStep()` records it and skips the endpoint read. Unit: "shows the windows an OpenAI Codex response's headers report, and sends no request to the usage endpoint". Not run live: the person decided the Codex login will not be provided and accepted this AC on unit evidence (gap G1, accepted) |
| AC6 | A failed usage read never affects the step | Pass | The read is `void`-ed in `showStep()` and never awaited, `monitor.read` catches a throwing source, and a failure keeps `good`. Unit: "keeps the last good windows when a later reading fails" (500, offline, mis-shaped). Live (local CONNECT proxy, see Interactive Verification run B): the step's curl CONNECT was tunneled and the step answered `⏺ delta`. The usage read's host-fetch CONNECT got `502`. The debug log had `[nmg-router] $.ui.log (to debug): OpenCode Go usage unavailable: offline` with no body or header text, and the status line kept `5h 6% · weekly 30% · monthly 15%` |
| AC7 | Routed error line keeps its text | Pass | `renderStatus()` error branch `${model} · ${provider.name} error: ${error}`. Unit: `tests/routing/errors.test.ts` unchanged, plus "shows the error line with no windows…". Live: `fakelocal/fake-small · Fake Local error: network` |
| AC8 | A Claude model clears the line | Pass | `claudeStep()` sets `shown = undefined` and `ui.status(undefined)`, and `redraw()` returns on `shown === undefined`. Unit: "clears the line on a Claude main-loop step, sends no usage request, and a read settling after it does not redraw". Live: after `/model opus` and a Claude turn (`⏺ four`), the nmg-router status row was gone |
| AC9 | `/usage` lists logged-in providers after the built-in view | Pass | `src/usage/usage-command.ts` `handleUsage()`: `next(input)` first, then `logUsage()` writes rows ordered by `localeCompare` of the name. Unit: `tests/usage/usage-command.test.ts` "runs the built-in view first, then logs each logged-in provider…". Live: the built-in Usage panel drew, then after Esc came `Provider plan usage` / `Fake Local` / `  No usage reading available` / `OpenCode Go` / `  5h 5% · resets in 2h 33m` / `  weekly 29% · resets in 4d 21h` / `  monthly 15% · resets in 20d 1h`. Not-logged-in xAI, ClinePass and Codex had no entry |
| AC10 | One failing provider does not hide others | Pass (failure half live; windows half accepted on unit evidence by the person's decision) | Each provider is read in its own `readingOf()` with a try/catch. Unit: "shows one failing provider's failure and the other provider's windows". Live (run C): with OpenCode Go's usage CONNECT refused, `/usage` showed `Fake Local` / `  No usage reading available` and `OpenCode Go` / `  Usage could not be read: offline`. The failing entry did not hide the other one. The "other provider shows its windows" half is accepted on unit evidence by the person's explicit decision (gap G3, accepted) |
| AC11 | `/usage` with no logins adds nothing | Pass | `logUsage()` returns when `rows.length === 0`, and the hook returns `next`'s result. Unit: "returns Claude Code's own result unchanged, and adds no row and sends no usage request, with no provider logged in". Live (run E): a renamed scratchpad copy loaded as `nmg-router-ac11@inline` with an empty login index. `/login` listed OpenCode Go, ClinePass, OpenAI Codex, xAI and Fake Local all as `not logged in`. `/usage` drew only the built-in panel. After Esc there was no `Provider plan usage` row, and the debug log had no `$.http.fetch (nmg-router-ac11)` and no usage `$.ui.log` |
| AC12 | Credentials never appear in usage output | Pass | `endpointUsage` sends `context.auth.token` only to the provider's own URL. `failureOf` carries only a kind, and the monitor never touches `$.store`. Unit: sentinel tests in `usage-status.test.ts` and `usage-command.test.ts`. Live: no key or token appeared in the status line, `/usage` rows or transcript. Both debug logs from runs B and C have 0 matches for `bearer`/`authorization`, including the failure lines |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `UsageSource { read, fromHeaders? }` in `src/providers/types.ts`. `UsageOutcome`/`UsageReport` in `src/usage/report.ts` have no provider code |
| FR2 | Pass | `openai-codex.ts`: `USAGE_URL = ${BASE_URL}/wham/usage` with `headersFor(auth?.accountId)` and a bearer token. `parseCodexUsage` maps the primary and secondary windows, and `windowLabel` gives 300 → `5h` and 10080 → `7d` |
| FR3 | Pass | `opencode-go.ts`: `https://opencode.ai/zen/go/v1/usage` maps `rolling`/`weekly`/`monthly` to `5h`/`weekly`/`monthly`. A missing or mis-shaped window gives `undefined`, which `endpointUsage` turns into `malformed` |
| FR4 | Pass | `xai` and `clinePass` have no `usage`. Asserted in `tests/providers/usage-sources.test.ts` |
| FR5 | Pass | `RoutedStatus` + `renderStatus()` is the only status builder, and `renderUsageEntries()`/`windowText()` the only usage text builders. `statusText`/`errorStatusText` are removed |
| FR6 | Pass | The monitor holds per-(provider, account) state in memory. `record()` counts as a read. The read is never awaited on the step path, and redraw is guarded |
| FR7 | Pass | `on("command.run", { command: "usage" }, …)` plus `.catch((_, e, next) => next(e))`. It runs through `hostPort($)`, so no `$` reaches a nested function. The interrupted-panel replay case is covered by "still logs the entries, and passes the rejection on…" |
| FR8 | Pass | `requestHeaders(options.headers(context), context.auth?.token)` goes to the fixed URL only. Debug log text is `<name> usage unavailable: <kind>` |
| FR9 | Pass | No change to `src/models` or the picker rows. `modelPicker` rows in settings hold model ids only |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Usage report, parsing helpers, endpoint source, renderers | Complete | `src/usage/report.ts`, `sources.ts`, `render.ts`, `src/providers/types.ts`. `recordOf` was added as a shared helper |
| T002 | Codex and OpenCode Go usage sources | Complete | `openai-codex.ts`, `opencode-go.ts` |
| T003 | Throttled usage monitor | Complete | `src/usage/monitor.ts` |
| T004 | Structured status object and router wiring | Complete | `src/routing/status.ts`, `src/routing/router.ts` (`createRouter` takes a fifth `monitor` parameter) |
| T005 | `/usage` hook | Complete | `src/usage/usage-command.ts`, `hooks/register.ts`. Per commit `cf21b23`, entries are written as transcript rows via `$.ui.log` (one per line), because the host drops a panel command's text returned after `next(e)`. Commit `c1c6b01` lets an interrupted panel's rejection pass through without running `/usage` twice |
| T006 | Report, renderer and parser tests | Complete | `tests/usage/report.test.ts`, `render.test.ts`, `tests/providers/usage-sources.test.ts`, fixtures `codex-usage.json`, `opencode-go-usage.json` |
| T007 | Monitor and status-line tests | Complete | `tests/usage/monitor.test.ts`, `tests/routing/usage-status.test.ts`, `tests/support/routing.ts` |
| T008 | `/usage` hook tests | Complete | `tests/usage/usage-command.test.ts`, `tests/hooks/register.test.ts`, `tests/hooks/command-flow.test.ts` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Report shape, endpoint source, throttling, rendering, router display and the `/usage` hook each live in their own module |
| Open/Closed | 5 | A provider opts in by declaring `usage`. Neither display holds per-provider logic |
| Liskov Substitution | 5 | Every `UsageSource` returns the same `UsageOutcome`. `fromHeaders` is optional |
| Interface Segregation | 5 | `UsageCommandDeps` picks only `load`/`enabledProviders`/`activeAccount` from the catalog |
| Dependency Inversion | 5 | The router and hook take the monitor and a host port. `hooks/register.ts` creates one shared monitor and stays thin |

### Layer Separation

Pure modules (`report.ts`, `render.ts`, the parsers and `status.ts`) have no `$` access. `hooks/register.ts` only wires the hook to `handleUsage` through `hostPort($)`.

### Dependency Flow

`src/providers` → `src/usage/report.ts`/`sources.ts` (types and helpers) and `src/routing` → `src/usage`. There is no cycle back from `src/usage` into routing.

---

## Security Assessment

- [x] Authentication: the usage read sends the active account's own resolved credential, and only to that provider's fixed usage URL
- [x] Authorization: n/a
- [x] Input validation: parsers accept only finite numbers in range and valid dates. Anything else is `malformed` or the window is left out
- [x] Injection prevention: no shell or subprocess use. Header values are parsed as numbers
- [x] Data protection: failures carry only a kind. The monitor holds reports only and never touches `$.store`. Sentinel tests prove no credential reaches the status line, rows, logs or store

---

## Performance Assessment

- [x] Async patterns: the usage read never holds a routed step's answer, and `/usage` reads providers in parallel
- [x] Caching: 60 s throttle per provider and account, with in-flight reads shared. A Codex header reading counts as a read
- [x] Resource management: in-memory map keyed by provider and account, bounded by the number of logged-in providers
- [x] Query optimization: the credential is resolved inside the monitor's source, so a throttled `/usage` resolves no credential

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Vitest `usage-status.test.ts` | Yes |
| AC2 | Yes (SCN002) | Vitest `usage-status.test.ts` | Yes |
| AC3 | Yes (SCN003) | Vitest `usage-status.test.ts`, `usage-sources.test.ts` | Yes |
| AC4 | Yes (SCN004) | Vitest `monitor.test.ts`, `usage-status.test.ts` | Yes |
| AC5 | Yes (SCN005) | Vitest `usage-status.test.ts`, `usage-sources.test.ts` | Yes |
| AC6 | Yes (SCN006) | Vitest `usage-status.test.ts`, `monitor.test.ts` | Yes |
| AC7 | Yes (SCN007) | Vitest `errors.test.ts`, `usage-status.test.ts` | Yes |
| AC8 | Yes (SCN008) | Vitest `usage-status.test.ts` | Yes |
| AC9 | Yes (SCN009) | Vitest `usage-command.test.ts`, `render.test.ts` | Yes |
| AC10 | Yes (SCN010) | Vitest `usage-command.test.ts` | Yes |
| AC11 | Yes (SCN011) | Vitest `usage-command.test.ts` | Yes |
| AC12 | Yes (SCN012) | Vitest `usage-status.test.ts`, `usage-command.test.ts` | Yes |

### Coverage Summary

- Feature file: 12 scenarios (`feature.gherkin`), mapped one to one to Vitest cases. The project has no Cucumber runner
- Unit tests: 636 passed across 74 files

---

## Interactive Verification (herdr)

| Field | Value |
|-------|-------|
| **Method** | `herdr tab create --cwd <repo> --label verify-40 --no-focus`; `herdr agent start verify-40 --kind claude --pane <pane> -- --plugin-dir .` (Claude Code v2.1.312) |
| **Startup** | No folder-trust prompt and no hook or plugin load errors |
| **State** | Logged in: OpenCode Go and Fake Local. Not logged in: OpenAI Codex, xAI, ClinePass. `/model` saves the default model, which was restored to `opus` (`~/.claude/settings.json` `"model": "opus"`). No login, logout or config change was made. The tab was closed |

| # | Prompt | Observed | Excerpt |
|---|--------|----------|---------|
| 1 | `/usage`, then Esc | Built-in panel ran unchanged, then nmg-router rows (AC9, AC12) | panel `Settings  Status   Config   Usage   Stats`; then `⏺ nmg-router: Provider plan usage` / `Fake Local` / `  No usage reading available` / `OpenCode Go` / `  5h 5% · resets in 2h 33m` / `  weekly 29% · resets in 4d 21h` / `  monthly 15% · resets in 20d 1h` |
| 2 | `/model opencode-go/glm-5.3` (Claude → routed) | Switched | `Set model to OpenCode Go · glm-5.3` |
| 3 | `Reply with exactly the word: ok…` | Routed answer, status line with windows (AC1) | `⏺ ok`; `⚠ nmg-router: opencode-go/glm-5.3 · thinking unsupported · 5h 5% · weekly 29% · monthl…` |
| 4 | Second prompt within 60 s | Kept windows shown (AC4, live partial) | `⏺ two`; same status line |
| 5 | `/model fakelocal/fake-small`, prompt | Error line with no windows, and no OpenCode Go windows (AC2, AC7) | `⚠ nmg-router: fakelocal/fake-small · Fake Local error: network` |
| 6 | `/model opus`, prompt (routed → Claude) | nmg-router status row cleared (AC8) | `⏺ four`; footer shows only `🧠 model: Opus …`, with no `nmg-router:` row |

Unplanned: the first Fake Local prompt was swallowed by the model switch and was sent again. This was a driver timing artifact. The Fake Local step's `network` error is because its local stub (`https://127.0.0.1:18765`) was not running. That is not a product finding.

### Runs B and C: usage-read failure through a local CONNECT proxy (AC6, AC10)

Per supervisor guidance, a scratchpad Node CONNECT proxy on `127.0.0.1:18911` tunneled every CONNECT. While its control file was armed, it answered the chosen `opencode.ai:443` CONNECT with `HTTP/1.1 502 Bad Gateway`. Claude was started in a new herdr tab with `HTTPS_PROXY`/`https_proxy` set and `--debug-file` in the scratchpad. Routed steps go through `curl` (`ua=curl/8.7.1` in the proxy log), and usage reads go through the host's `$.http.fetch` (no User-Agent on CONNECT), so the two were distinguishable. Nothing in `~/Library/Application Support/nmg-router` was changed and no credential was printed.

| # | Action | Proxy log | Observed |
|---|--------|-----------|----------|
| B1 | `/model opencode-go/glm-5.3`, prompt `alpha` | `02:58:03 CONNECT opencode.ai:443 ua=curl/8.7.1 -> tunnel`; `02:58:05 … ua=- -> tunnel` | `⏺ alpha`; `opencode-go/glm-5.3 · thinking unsupported · 5h 6% · weekly 30% · monthl…` (good reading) |
| B2 | 75 s later, prompt `bravo` | step `tunnel`, no new usage CONNECT | The host reused its keep-alive tunnel, so the refusal never fired and the read succeeded. The proxy was then changed to close open opencode.ai tunnels when armed, and restarted |
| B3 | Prompt `charlie`, 43 s after B2's read | step `tunnel` only | No usage read: the 60 s throttle held (AC4, live) |
| B4 | Armed `fail-after-one`, prompt `delta` | `03:00:23 … ua=curl/8.7.1 -> tunnel`; `03:00:27 … ua=- -> 502` | `⏺ delta` (answer unchanged). Debug: `03:00:27.339 $.ui.status (nmg-router): opencode-go/glm-5.3 · thinking unsupported · 5h 6% · weekly 30% · monthly 15%`, `03:00:27.340 $.http.fetch (nmg-router): GET https://opencode.ai/zen/go/v1/usage`, `03:00:27.342 [nmg-router] $.ui.log (to debug): OpenCode Go usage unavailable: offline`. No later status write, so the line kept the last good windows (AC6) |
| C1 | New session through the proxy, armed `fail`, `/usage`, Esc | `03:01:35 CONNECT opencode.ai:443 ua=- -> 502` | Rows: `Provider plan usage` / `Fake Local` / `  No usage reading available` / `OpenCode Go` / `  Usage could not be read: offline` (AC10, live partial) |

Cleanup: both tabs were closed and the proxy was stopped (no listener on 18911). The `~/.claude/settings.json` default model, changed by `/model` during the run, was restored to `"opus"`. The first proxy process exited on an unhandled client `ECONNRESET` right after B4. It was given an error handler for run C. This is a test-harness issue, not a product finding.

### Re-verify at c1c6b01 (03:27–03:29 UTC): runs D and E

The registered gate was re-run first: `sdlc-verify-steering.mjs` returned `ok: true`, `ceiling: null` and coverage 3/3 complete. `repository.typecheck` passed, `repository.tests` passed (`Test Files 74 passed (74)`, `Tests 636 passed (636)`) and `repository.plugin-manifest` passed (`✔ Validation passed with warnings`).

| # | Action | Observed | Excerpt |
|---|--------|----------|---------|
| D1 | New herdr tab at the repo, `claude --plugin-dir . --debug-file <scratchpad>`, `/login` | The module loaded as `nmg-router@inline` with no load errors. **OpenAI Codex not logged in**, so G1 is recorded as needing the person, and the Codex steps, the `/model` round trip and the AC10 windows half were not run | `OpenCode Go — ✓ logged in` / `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` / `Fake Local — ✓ logged in` |
| D2 | Esc (cancel, no login started). Check `~/Library/Application Support/nmg-router` metadata (`ls` only) | `vault.json` mtime is still 22:04 CDT (03:04 UTC), so no login was made after the earlier run | — |
| E1 | Scratchpad copy of the worktree (no `.git`), with only `.claude-plugin/plugin.json` `name` changed to `nmg-router-ac11`. New herdr tab rooted at the copy, `claude --plugin-dir . --debug-file <scratchpad>` | Loaded as its own instance: `plugin.register: nmg-router-ac11 (user, nmg-router-ac11@inline) … admitted`. The installed `nmg-router@nmg-plugins` 0.12.0 also loaded, because the copy no longer shadows it by name. 0.12.0 registers no `command.run{command=usage}` hook, so it cannot add `/usage` rows | — |
| E2 | `/login` | The copy answered (`nmg-router-ac11 (user) answered command.run without next()`). Every login-requiring provider showed as not logged in | `OpenCode Go — not logged in` / `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` / `Fake Local — not logged in` |
| E3 | Esc, then `/usage`, then Esc | The built-in panel drew unchanged (`Current session … 10% used`, `Current week (all models) … 26% used`). After it closed, the transcript held only the earlier `⏺ nmg-router-ac11: Login cancelled.`, with no `Provider plan usage` row (AC11). Debug log: `command.run settled in 9431.7ms (worker hop, next() included)`, 0 `$.http.fetch (nmg-router` lines, the only nmg-router `$.ui.log` is `Login cancelled.`, and 0 `bearer`/`authorization` matches | — |

### Re-verify at c1c6b01 (03:34–04:05 UTC): run F (Codex login handoff)

The registered gate was re-run first: `ceiling: null`, coverage 3/3 complete, and `repository.typecheck`, `repository.tests` (`Tests 636 passed (636)`) and `repository.plugin-manifest` (`✔ Validation passed with warnings`) all passed.

**Method change:** every session in this run, and any later AC5 and AC10 session, is started with `claude --plugin-dir . --settings '{"enabledPlugins":{"nmg-router@nmg-plugins":false}}'`. This keeps the installed `nmg-router@nmg-plugins` out of the session, so only the branch code handles `/login`, routes steps and reads usage. No settings file is edited.

| # | Action | Observed |
|---|--------|----------|
| F1 | Focused herdr tab `codex-login` at the repo, `claude --plugin-dir .`. Nothing was sent | No trust dialog. The session sat idle for the person's login |
| F2 | The person reported that they were logged in (03:36 UTC). Provider names in each index were read with `jq` | `nmg-router_nmg-plugins-*.json` held `cline-pass`, `openai-codex`. `nmg-router_inline-*.json` held only `opencode-go`, `fakelocal`. `vault.json` was written at 03:36 UTC. The installed copy, also loaded in that session, had answered `/login` (supervisor diagnosis) |
| F3 | `/exit`, then a restart in the same pane with the `--settings` flag above and `--debug-file <scratchpad>` | The debug log has `plugin.register: nmg-router (user, nmg-router@inline) … admitted` and 0 lines for `nmg-router@nmg-plugins` |
| F4 | Read-only poll of the inline `credentials.index` and the tab screen every 60 s, 03:40–04:05 UTC | No `openai-codex` entry and no `Logged in to OpenAI Codex` line. The poll timed out. The Codex steps, the `/model` round trip and the AC10 windows half were not run |

Cleanup (run F): the `codex-login` tab was closed. No proxy was started (nothing listening on 18911), and `/model` was not used, so `~/.claude/settings.json` still has `"model": "opus"`. The verify worker did not type in the login tab, start a login, press Esc or print a token.

Cleanup (runs D and E): both tabs were closed and the scratchpad copy was deleted. No proxy was started in this re-verify, because the AC10 proxy half depends on the Codex login. Nothing under `~/Library/Application Support/nmg-router`, the vault or `HOME` was changed, nothing was logged out, and `/model` was not used, so `~/.claude/settings.json` still has `"model": "opus"`.

### Re-verify at c1c6b01 (05:09 UTC): run G (login check)

The registered gate was re-run first with controller run `0c04886c-…`: `ok: true`, `ceiling: null`, coverage 3/3 complete, and `repository.typecheck`, `repository.tests` and `repository.plugin-manifest` all `passed` (`command exited 0`) at head `c1c6b01…`.

| # | Action | Observed |
|---|--------|----------|
| G-1 | Read only the provider names in the inline login index (`~/.claude/plugins/store/nmg-router_inline-*.json`, `credentials.index[].provider`) with `jq` | Only `opencode-go` and `fakelocal`. No `openai-codex` |
| G-2 | `ls` metadata of `~/Library/Application Support/nmg-router` | `vault.json` was last written at 03:36 UTC, the login the installed copy answered in run F. No login has been made since |

The head is unchanged since runs A–F, so their interactive evidence still applies. No herdr session was started, because the Codex scenarios can't run without the login. No credential was read or printed.

### Re-verify at c1c6b01 (2026-10-29): run H (decision on the Codex login)

The registered gate was re-run first with controller run `5854bb93-4b25-4d7d-bd41-400ff450a19a`: `ok: true`, `ceiling: null`, coverage 3/3 complete, and `repository.typecheck`, `repository.tests` (`Test Files 74 passed (74)`, `Tests 636 passed (636)`) and `repository.plugin-manifest` (`Validation passed with warnings`) all `passed` at head `c1c6b01…`.

| # | Action | Observed |
|---|--------|----------|
| H-1 | Read only the key names in the inline store (`~/.claude/plugins/store/nmg-router_inline-*.json`) | `accounts.active` held `opencode-go` and `fakelocal` only. No `openai-codex` |
| H-2 | `herdr tab create --cwd <repo> --label verify-40 --no-focus`; `herdr agent start verify-40 --kind claude --pane <pane> -- --plugin-dir . --settings '{"enabledPlugins":{"nmg-router@nmg-plugins":false}}'` | Started with no trust dialog and no hook or plugin load errors |
| H-3 | `/login` | `OpenCode Go — ✓ logged in` / `ClinePass — not logged in` / `OpenAI Codex — not logged in` / `xAI — not logged in` / `Fake Local — ✓ logged in`. The picker was left open for the person, and a bounded poll for an `openai-codex` entry was started |
| H-4 | Supervisor guidance relayed the person's explicit decision: drop the Codex login requirement and accept AC5 and the AC10 windows half on unit evidence | The poll was stopped and the `verify-40` tab closed. No login was started, nothing was typed in the picker, and no credential was read or printed |

### Manual-verification gaps

| Gap | AC | What was not observed live | Why | Covering evidence |
|-----|----|----------------------------|-----|-------------------|
| G1 | AC5 | Codex `x-codex-*` header windows (`5h`, `7d`) and no `wham/usage` request | **Accepted on unit evidence by the person's explicit decision (2026-10-29).** The OpenAI Codex login will not be provided. Runs D–H showed the `nmg-router@inline` index never had a Codex login | `usage-status.test.ts` header case and `usage-sources.test.ts` `parseCodexUsageHeaders` |
| G3 | AC10 | The non-failing provider's entry showing windows (live showed it with `No usage reading available`) | **Accepted on unit evidence by the person's explicit decision (2026-10-29).** It would need a second usage-source login (Codex), which will not be provided | `usage-command.test.ts` AC10 case, plus live run C |
| G4 | AC11 | **Closed** by re-verify run E | — | Live run E plus `usage-command.test.ts` AC11 case |

G1 and G3 are closed by the person's decision, as was done for AC8's two-account part on #2. No live check remains open.

Login-scope observation (pre-existing, outside #40): the login index lives in the per-install `$.store` while the secret lives in the shared vault, so a login made under the installed plugin is invisible to a `--plugin-dir .` session, and the reverse is likely too. This could be a follow-up issue. G4 was closed without touching the person's state by giving a copy of the plugin its own instance name (run E).

---

## Fixes Applied

None. No code defect was found. The publication scope for this verify step allows writing only this report.

## Remaining Issues

### Critical Issues
None.

### High Priority
None. The earlier AC5/AC10 evidence gap is closed by the person's explicit decision to accept unit evidence (2026-10-29).

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | UX |
| **Location** | `src/routing/status.ts` `renderStatus()` |
| **Issue** | With three OpenCode Go windows the line can exceed a 91-column terminal, and the host truncates it (`monthl…`) |
| **Impact** | The last window can be cut off on narrow terminals. The spec does not cover it |
| **Reason Not Fixed** | Out of spec scope and host-controlled truncation. A possible follow-up issue |

---

## Positive Observations

- One structured `RoutedStatus` and one renderer. The error line text is byte-for-byte unchanged.
- The redraw guard checks provider, account and error state, so a stale read can't paint over another provider or a Claude step.
- The live run caught the panel-command behaviour (the host drops text returned after `next(e)`), and the implementation was adjusted to transcript rows with a matching unit fake.

---

## Recommendations Summary

### Before PR (Must)
None.

### Short Term (Should)
- [ ] File a follow-up issue: the login index is scoped per plugin install while the vault is shared, so logins don't carry between the installed plugin and `--plugin-dir .`

### Long Term (Could)
- [ ] Consider a compact status form for providers with three windows

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/usage/report.ts` | 0 | |
| `src/usage/sources.ts` | 0 | |
| `src/usage/render.ts` | 0 | |
| `src/usage/monitor.ts` | 0 | |
| `src/usage/usage-command.ts` | 0 | |
| `src/routing/status.ts` | 1 (low) | Line width on narrow terminals |
| `src/routing/router.ts` | 0 | |
| `src/providers/types.ts` | 0 | |
| `src/providers/builtin/openai-codex.ts` | 0 | |
| `src/providers/builtin/opencode-go.ts` | 0 | |
| `hooks/register.ts` | 0 | |

---

## Recommendation

**Ready for PR**

The implementation is complete and correct against the spec, and all registered validations pass at `c1c6b01…`. Seven criteria were shown fully live (AC1, AC2, AC6, AC7, AC8, AC9, AC11) and four in part (AC3, AC4, AC10, AC12), with unit tests covering the rest. AC5 and the windows half of AC10 are accepted on unit evidence by the person's explicit decision (2026-10-29), because the OpenAI Codex login will not be provided. No status cap remains.
