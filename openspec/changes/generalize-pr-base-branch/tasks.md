# Tasks

All tasks are markdown edits to `skills/orc-issue-to-pr/` — no code, spec, or docs changes. Verify each edit by rereading the file and confirming no `develop` base remains and the confirmed-base behavior reads as specified in `specs/issue-to-pr-orchestration/spec.md`.

## 1. Stage 2 — Provision or resume (SKILL.md)

- [x] 1.1 Replace the hardcoded `origin/develop` provisioning text in `skills/orc-issue-to-pr/SKILL.md` stage 2 with provisioning from freshly fetched `origin/<base>`, where `<base>` is the run's confirmed base; verify the stage no longer names any specific branch and reads `origin/<base>` on reread
- [x] 1.2 Add base selection to stage 2: use the base supplied in the request input when present; otherwise confirm with the user through the shared human-input contract (pause with question, options, and a recommendation proposing the currently checked out local branch) before provisioning; verify by rereading that both paths and the default proposal appear
- [x] 1.3 Add resume derivation to stage 2: when reusing an existing worktree/PR, derive the base from that existing state instead of re-deriving or re-asking, and keep the base sticky for the rest of the run; verify by rereading that resume and stickiness are stated

## 2. Stage 4 — Deliver (SKILL.md)

- [x] 2.1 Change the stage 4 PR creation/reuse text in `skills/orc-issue-to-pr/SKILL.md` from base `develop` to base `<base>` (the run's confirmed base), keeping the `Closes #<n>` / repository-qualified closing reference unchanged; verify by rereading that no `develop` remains in stage 4
- [x] 2.2 Change the stage 4 merge-base guard from current `origin/develop` to current `origin/<base>`, keeping the safe-reconciliation and rerun-affected-validation requirement intact; verify by rereading

## 3. Pseudocode (references/pseudocode.md)

- [x] 3.1 Update `skills/orc-issue-to-pr/references/pseudocode.md` to derive the base per run (request input, else user confirmation via the pause/report blocker path, else existing worktree/PR state on resume) and use the confirmed base in the provisioning and delivery steps, replacing `origin/develop` there; verify by rereading that the pseudocode contains no `develop` and routes the base question through the existing PAUSE contract

## 4. Final validation

- [x] 4.1 Grep `skills/orc-issue-to-pr/` for `develop` and confirm zero occurrences outside unrelated words; confirm no other base branch name was introduced in its place; verify with `grep -rn develop skills/orc-issue-to-pr/` returning nothing
- [x] 4.2 Reread `skills/orc-issue-to-pr/SKILL.md` stages 2 and 4 and `references/pseudocode.md` end to end against the delta spec scenarios (request-supplied base, user confirmation with checked-out-branch proposal, headless blocked question, resume derivation, PR base, merge-base guard) and confirm each scenario has matching skill text
