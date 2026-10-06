---
name: cleanup-merged-issues
description: Preview and confirm cleanup of local issue branches and worktrees whose GitHub PRs are merged, then prune stale remote-tracking refs.
disable-model-invocation: true
compatibility: Requires git and authenticated GitHub CLI with repository and PR read access.
---

# Clean Up Merged Issue Work

Run only on explicit human invocation. Inspect all local branches matching `^issue-[0-9]+$`, including branches without worktrees. Preview candidates and obtain explicit confirmation before removing anything or pruning refs. Remote branch deletion is outside this skill's scope.

## Inspect

1. Read project instructions and delivery policy. Resolve the git common directory, repository identity, and the exact remote corresponding to that GitHub repository; do not assume `origin` points there. Check `gh auth status` and fetch that remote without pruning. Missing access or ambiguous repository/remote identity blocks cleanup.
2. Enumerate local issue refs with their tip SHAs and `git worktree list --porcelain` records. Preserve paths containing spaces. Inspect every associated worktree's status, including untracked and ignored files, lock/prunable state, and submodule state. Record branch upstream configuration and remote tip when present. Detect whether a worktree contains the current session's working directory.
3. Query all matching PRs, including closed ones, with pagination and explicit repository selection. Match head repository and branch, and enforce the project's expected base branch. Record PR URL/number, state, merged time, and authoritative PR head SHA. A closing reference or branch name alone is not merge evidence. Retrieve missing head evidence from the PR API/commit records; if it cannot be established, skip the branch.
4. Mark a branch eligible only when exactly one matching PR is merged, no competing open or ambiguous PR exists, and the local tip equals that PR's recorded head SHA. If the remote branch still exists, require its tip to equal the same SHA. This exact match establishes the tip was pushed and reviewed even when squash/rebase merging breaks ancestry. Skip unexplained divergent, unpushed, or post-merge commits; do not infer safety from patch similarity or issue closure.
5. For branches with worktrees, require every worktree to be clean, accessible, unlocked, and free of ignored/untracked files and initialized submodules. Skip the current session's worktree, main worktree, missing/prunable records, and unexplained branch/path associations. Preserve uncertain work rather than forcing removal. Branches without worktrees can qualify using the same PR/ref evidence.

## Preview and confirm

Show a table containing branch, local SHA, worktree path (or none), merged PR URL/time, and eligibility or exact skip reason. State the remote whose stale tracking refs will be pruned. Propose only eligible branches; offer explicit selection or cancellation and recommend cleaning the verified candidates while retaining all skipped work.

Pause for the user's answer. Invocation itself is not confirmation. If there are no eligible branches, report that outcome; ask separately before a prune-only operation. Bind approval to the listed branch tips, worktree paths, PRs, and remote—not future discoveries.

## Clean up approved candidates

1. Recheck repository/remote identity, PR merge/head state, local and remote tips, worktree associations, locks, and full cleanliness immediately before each removal. Changed evidence invalidates approval for that candidate; skip it and report the reason. If a matching remote branch was deleted after preview, re-establish the PR head evidence before proceeding.
2. Remove each approved worktree with `git worktree remove <absolute-path>` from a retained worktree outside the removal target. Use normal removal only: no `--force`, unlocking, recursive filesystem deletion, or automatic stashing. If removal fails, preserve the branch and report the blocker.
3. Verify no worktree still uses the branch, then delete that exact local branch with `git branch -d <branch>`. If Git refuses solely because squash/rebase merging prevents ancestry-based deletion, recheck the confirmed PR/head evidence and use `git branch -D <branch>` only for that approved, unchanged ref. Other failures require investigation, not a blanket force retry. Verify branch absence and removed worktree registration/path.
4. After approved removals, run `git fetch --prune <verified-remote>` to prune only stale remote-tracking refs using standard branch refspecs. Inspect configured refspecs and prune settings first; if they could prune local branches, tags, or other non-tracking refs, pause for reconciliation rather than using them. Do not delete remote branches or tags, run `git prune`, or expire reflogs. `git worktree remove` handles normal registration cleanup; stale/missing worktree records need a separate explicit decision.

## Finish and resume

Report removed worktrees/branches, preserved candidates with reasons, pruned remote-tracking refs, failed operations, and remaining input. Verify actual state; partial cleanup is not full success. On interruption, re-inventory before continuing, recognize completed removals, and obtain fresh confirmation for changed or newly discovered candidates. Preserve original approved identities when retrying an unchanged partial operation.
