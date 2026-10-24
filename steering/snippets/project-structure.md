# nmg-router Structure Steering

## Repository Layout

```text
.claude-plugin/
  plugin.json            plugin manifest (version mirrors VERSION)
  marketplace.json       one-command install
  types/                 generated mod type declarations (gitignored)
hooks/
  hooks.json             { "modules": ["./register.ts"] }
  register.ts            registers hooks only; delegates to src/
src/
  routing/               turn.step routing: Claude passthrough vs routed models
  gateway/               omp auth-gateway invocation, profile isolation, Anthropic guard
  translate/             Anthropic Messages request build and response → engine chunks
  tools/                 tool input-schema registry
  models/                modelPicker rows and model id scheme
  login/                 provider-aware /login
  errors/                user-facing errors and status-line state
tests/                   Vitest suites mirroring src/
  fixtures/              recorded gateway responses with credentials removed
scripts/                 project scripts, including any check that runs omp
specs/{N}-{slug}/        nmg-sdlc specs, one GitHub issue each
steering/                nmg-sdlc steering runtime
VERSION  package.json  tsconfig.json  vitest.config.ts
CLAUDE.md  CONTRIBUTING.md  README.md  LICENSE
```

The layout is planned; directories appear as issues need them.

## Conventions

- `hooks/register.ts` stays thin: it wires hooks to functions in `src/` and holds no routing logic.
- One concern per directory under `src/`. Translation and model-id logic are pure functions with no `$` access, so tests run them directly.
- File names are kebab-case `.ts`. Tests are named `<module>.test.ts` under the matching `tests/` path.
- The root `tsconfig.json` extends `.claude-plugin/types/tsconfig.json` and adds `src/` and `scripts/` to `include`.
- Nothing under `src/` reads `~/.claude` credentials, `~/.codex` or oh-my-pi credential files directly; provider access goes only through `omp`.
