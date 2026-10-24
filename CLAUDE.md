# CLAUDE.md

## Naming the oh-my-pi dependency

nmg-router calls the oh-my-pi CLI (`omp`). nmg-sdlc's upgrade migrations rewrite v3 host wording in steering snippets and validations, so steering written for this project must not match them:

- Write "oh-my-pi" or the code token `omp`. Never write the title-case product name or the all-caps abbreviation; upgrade rewrites both to "Claude Code".
- Never write `omp --print`, `--kind omp`, `--kind pi` or `.omp/sdlc` in steering.
- A steering validation never names `omp` as its `config.program`. Wrap any check that runs `omp` in a project script and register the script instead.

## Credentials

Never commit, log or store a provider key, OAuth token or Claude credential. The mod never reads, stores or forwards Claude credentials.
