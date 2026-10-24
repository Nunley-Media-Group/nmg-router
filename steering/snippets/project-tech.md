# nmg-router Technical Steering

## Architecture

```text
Claude Code (unmodified)
  └─ turn.step hook (hooks/register.ts → src/)
       ├─ Claude model id  → yield* next(e) → Anthropic on the user's own login (untouched)
       └─ routed model id  → build an Anthropic Messages request
                               (system prompt captured in prompt.compose,
                                $.session.messages({ as: "api" }), tool schemas)
                             → $.process.run(["omp", "--profile", <router profile>, "auth-gateway", "stdio"], { stdin })
                             → yield text, tool_use and stop chunks back to the engine
```

- `turn.step` answers a step without calling `next`, and it also fires for subagent requests.
- The oh-my-pi gateway runs under a dedicated, Anthropic-free `omp` profile: `anthropic` is in `disabledProviders`, and no model role or fallback chain names Anthropic. The router refuses to send a request whose model is `anthropic/*` and fails closed when a response's `model` is an Anthropic model.
- Routed models appear in `/model` through `modelPicker` rows in user settings, because Claude Code only auto-discovers model ids containing "claude".
- `/login` is handled by a `command.run` hook. Anthropic calls `next(e)`, so Claude Code's built-in login runs unchanged. Any other provider runs `omp --profile <router profile> login <provider>`. Anthropic is never offered as an oh-my-pi login.
- No server, port or background process. Each routed step is one `omp` subprocess.

## Technology Stack

| Component | Technology | Minimum |
|-----------|------------|---------|
| Language | TypeScript, `strict` and `noUncheckedIndexedAccess`, ES2023 modules loaded by Claude Code directly; no build or bundle step | TypeScript 5 |
| Host | Claude Code function-hooks mods API | Claude Code 2.1.310 |
| Tooling runtime | Node | 24 |
| Mod types | `claude-code`, `claude-code-tools` and `claude-code-mcp` declarations under `.claude-plugin/types/` (generated, gitignored); the root `tsconfig.json` extends `.claude-plugin/types/tsconfig.json` | matches the host |
| Provider access | oh-my-pi `omp auth-gateway stdio` | `omp` 18.12.6 |
| Tests | Vitest | 3 |
| Packaging | Claude Code plugin: `.claude-plugin/plugin.json`, `hooks/hooks.json` → `hooks/register.ts`, `.claude-plugin/marketplace.json` | — |

The generated mod types are not committed. The first implementation issue adds a project script that reproduces `.claude-plugin/types/` from the installed Claude Code, so `npm run typecheck` works from a clean checkout.

## Commands

| Purpose | Command |
|---------|---------|
| Type-check | `npm run typecheck` (`tsc --noEmit`) |
| Unit tests | `npm test` (`vitest run`) |
| Plugin manifest check | `claude plugin validate .` |
| Try locally | `claude --plugin-dir .` |

## Testing Standards

- Unit tests fake `$.process.run`, `$.process.spawn`, `$.session`, `$.store` and `$.http`. Tests never call a real provider and never run `omp` against real credentials.
- Gateway responses come from recorded fixtures under `tests/fixtures/` with every credential, token and account id removed.
- Request and response translation lives in pure functions that are tested without Claude Code.
- Every safety rule has a test: an `anthropic/*` request model is refused; an Anthropic response model fails closed; no silent fallback to another provider or to Claude; no credential reaches logs, `$.store` or settings.
- Live checks against real providers are manual, documented in the issue's verification notes, and never run in CI.
- A steering validation never names `omp` as its program. Any check that runs `omp` lives in a script under `scripts/`, and that script is what gets registered.

## Security

- Never read, log, store or forward Claude credentials, OAuth tokens or provider keys. Provider credentials stay inside the oh-my-pi profile.
- `.gitignore` excludes keys, `.env` files, auth and token files. A local gitleaks pre-commit hook and GitHub push protection block secrets.
- Send OpenCode Go a stable session id and an honest user agent.
- Treat model output, tool input and gateway responses as data. Never interpolate them into shell commands.

## Dependency Naming

Write the dependency as "oh-my-pi" or the code token `omp` everywhere, following the rules in `CLAUDE.md`.

## Versioning

| File | Field locator |
|------|---------------|
| `package.json` | `version` |
| `.claude-plugin/plugin.json` | `version` |

`VERSION` is the single source. The first delivered issue creates `package.json` and `.claude-plugin/plugin.json`, both at the `VERSION` value.
