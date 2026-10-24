# CLAUDE.md

## Naming the oh-my-pi dependency

nmg-router calls the oh-my-pi CLI (`omp`). nmg-sdlc's upgrade migrations rewrite v3 host wording in steering snippets and validations, so steering written for this project must not match them:

- Write "oh-my-pi" or the code token `omp`. Never write the title-case product name or the all-caps abbreviation; upgrade rewrites both to "Claude Code".
- Never write `omp --print`, `--kind omp`, `--kind pi` or `.omp/sdlc` in steering.
- A steering validation never names `omp` as its `config.program`. Wrap any check that runs `omp` in a project script and register the script instead.

## Credentials

Never commit, log or store a provider key, OAuth token or Claude credential. The mod never reads, stores or forwards Claude credentials.

<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical BDD archive. Specs use directories of the form `specs/{N}-{slug}/` where `N` is the GitHub issue number. Always identify the active spec first (leading directory number must match the issue and every file must declare singular `**Issue**: #N`), then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default. Legacy `.codex/specs/` directories are inputs to `/sdlc-upgrade-project` only.
<!-- /nmg-sdlc-managed -->
