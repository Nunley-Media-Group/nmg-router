# Contributing

## Project Context

nmg-router is a Claude Code mod that adds models from other providers to Claude Code's `/model` picker. Claude models go straight to Anthropic on the user's own login. Routed models are answered through oh-my-pi (`omp auth-gateway stdio`) under an Anthropic-free profile. Two rules apply to every change:

- Never commit, log or store a provider key, OAuth token or Claude credential. The mod never reads, stores or forwards Claude credentials.
- A request for a routed model must never be answered by an Anthropic model or fall back silently to another provider.

Follow the naming rules in `CLAUDE.md` when writing about the oh-my-pi dependency.

## Issue and Spec Workflow

- Start every change from a GitHub issue with a user story or bug context, BDD acceptance criteria (Given/When/Then), scope and out-of-scope notes. Draft one with `/sdlc-draft-issue [need]`.
- Write the spec with `/sdlc-write-spec #N`. Specs live in `specs/{N}-{slug}/`, owned by the single issue `#N`. Each spec has `requirements.md`, `design.md`, `tasks.md` and `feature.gherkin`, and each file declares singular `**Issue**: #N`.
- After the spec is approved, `/sdlc-execute [#N …]` delivers it automatically. It drives Claude worker panes through implementation, verification and delivery, and continues through exact-head merge and issue closure. Opening a PR is an intermediate step; the work is done only when the exact head is merged and the issue is closed.
- `/sdlc-status` reports lifecycle state. `/sdlc-upgrade-project` reconciles nmg-sdlc contracts and proposes legacy-layout repairs; it never applies them silently. `/sdlc-onboard-project` set this repository up.

## Steering Expectations

Read the snippets registered in `steering/manifest.json` before drafting issues, writing specs or implementing:

- **Product** (`steering/snippets/project-product.md`): hard requirements, rejected alternatives, v1 success criteria, spike evidence.
- **Tech** (`steering/snippets/project-tech.md`): `turn.step` routing architecture, TypeScript and Vitest stack, testing and security standards, versioning mirrors.
- **Structure** (`steering/snippets/project-structure.md`): repository layout and module conventions.

Each PR states how it respects these. Do not re-propose an approach the product steering lists as rejected.

## Implementation and Verification

- **Scope:** stay within the approved spec. Avoid unrelated refactors and keep existing project-owned files intact.
- **Tests:** `npm run typecheck`, `npm test` (Vitest) and `claude plugin validate .` must pass. Tests fake `$.process`, `$.session`, `$.store` and `$.http`; they never call real providers or run `omp` with real credentials. Fixtures contain no credentials.
- **Verification evidence:** the spec's `verification-report.md` or the PR records specific commands and outcomes. Write `` `npm test` — passed (42 tests) ``, not "tests run". Manual live-provider checks are described with model id and result, with no credentials or account ids.
- Any check that runs `omp` is a script under `scripts/`; a steering validation never names `omp` as its program.

### PR readiness checklist

- [ ] Executable issue link (`Closes #N`) and a link to `specs/{N}-{slug}/`
- [ ] Spec artifacts present and declaring `**Issue**: #N`
- [ ] Steering alignment stated (product, tech, structure)
- [ ] Changes limited to the spec's scope
- [ ] Verification summary with commands and outcomes
- [ ] Known gaps and reviewer context
- [ ] No credentials anywhere in the diff, fixtures or logs

### Evidence consistency

The managed contribution gate (`.github/workflows/nmg-sdlc-contribution-gate.yml`) checks that issue, spec, steering, verification and guide evidence agree:

- **Issue/spec identity:** a PR says `Closes #143`, and every selected spec directory declares `**Issue**: #143` in its current body. Issue numbers that appear only in quoted examples, HTML comments, history sections or an unrelated spec don't count.
- **Exact path evidence:** a task or verification entry names `src/gateway/anthropic-guard.ts` exactly.
- **Directory-prefix evidence:** a task scopes work explicitly to `tests/gateway/`. A bare basename such as `anthropic-guard.ts` is not enough.
- **Path-specific behavior:** `Behavior for src/gateway/anthropic-guard.ts: fails closed on an Anthropic response model`.
- **Command and outcome:** `` `npm test` — passed (42 tests) ``. "Verification complete" alone is not evidence.
- **Other accepted verification:** a non-empty `verification-report.md`, `AC3: passed`, or a changed path paired with `passed`, `failed`, `verified` or `covered`.

### Validated exceptions

| Mode | Declaration and validation | Reduced checks | Still required | Invalidating conditions |
|------|----------------------------|----------------|----------------|-------------------------|
| Documentation-only | `SDLC-Exception: docs-only — <reason>`, and every change is project documentation | Spec correlation, relevant-path mapping, specific verification | Current issue linkage, steering artifacts and alignment, guide discoverability, all other checks | Any source, workflow, script, template, spec or other non-documentation path |
| Repository rewrite | `SDLC-Exception: repository-rewrite — <reason>`; title starts `feat!:`; package/version, public guides, all steering, managed gate, `references/rewrite-contract.{json,md}` and `references/rewrite-verification.md` change | Current PR issue/spec identity only | Genuinely owned current specs, rewrite contract, durable verification, steering alignment, exact changed-path mapping, specific verification, guide discoverability | Missing contract path, non-breaking title, unmatched relevant path, missing steering or verification |
| Spec-only write-spec | Title matches `docs: approve spec for #N`; `#N` appears in the PR text; every changed path is under exactly one `specs/{N}-{slug}/` | Steering alignment text, specific verification | Current issue linkage, spec correlation, steering artifacts, guide discoverability, all other checks | Any non-spec path, title mismatch, multiple spec directories, issue mismatch |

The rewrite mode is only for an owner-approved clean cutover. A marker, label or rationale never overrides incompatible changed paths. Remove an invalid exception, or split the invalidating changes into a normally evidenced PR.

### Contribution-gate remediation

When the gate fails, it names the missing category: issue, spec, steering, verification or guide evidence. Fix that evidence in the PR body, the spec or the verification report, using this guide. Don't bypass or edit the gate.
