# nmg-router Interactive Verification

Every change is exercised interactively before verification can pass. Unit tests, the type-check and `claude plugin validate .` are required but never enough on their own. The verification session runs the change in a fresh `claude` session in a new herdr tab and drives it the way a user would.

## Procedure

1. Confirm herdr answers with `herdr tab list`. If herdr is missing or its server does not answer, stop and report verification as Incomplete with the reason. Never substitute a headless `claude -p` run.
2. Open a new tab rooted at the worktree under test, without taking the user's focus:

   ```bash
   herdr tab create --cwd "<worktree>" --label "verify-<issue>" --no-focus
   ```

   Read the tab id from `.result.tab` and the shell pane id from `.result.root_pane`.
3. Start Claude in that pane with the mod loaded from the worktree:

   ```bash
   herdr agent start verify-<issue> --kind claude --pane <pane-id> -- --plugin-dir .
   ```

   If startup stops at the folder-trust dialog for the worktree, accept it with `herdr agent send-keys`. Record any other startup dialog as a finding.
4. For each acceptance criterion in the active spec, submit a prompt or slash command that exercises it, wait for it to settle, then read the screen:

   ```bash
   herdr agent prompt verify-<issue> "<scenario>" --wait --timeout 300000
   herdr agent read verify-<issue> --source recent-unwrapped --lines 200
   ```

   Whenever the change touches routing, the model picker or `/login`, include `/model` switches between a Claude model and a routed model in both directions. If the session blocks on a permission or question dialog the scenario did not plan for, read the screen, record it and judge it against the spec. Never type a credential; a step that needs the user's own login is handed to the user and noted in the report.
5. Close the tab with `herdr tab close <tab-id>` when done, whether the run passed or failed.

## Evidence

For each scenario, the verification report records the prompt sent, the observed outcome and a short excerpt from `herdr agent read`. Redact any token, key, account id or email address before recording. An acceptance criterion with no interactive evidence leaves verification Incomplete.

## Scope

- This interactive run is the manual live check that the technical steering's testing standards refer to. It never runs in CI and is not a steering validation.
- A change with no runtime behavior, such as a docs or steering edit, still gets a session that starts with `--plugin-dir .` and shows no hook or plugin load errors.
