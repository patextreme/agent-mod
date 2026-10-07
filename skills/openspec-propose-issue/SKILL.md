---
name: openspec-propose-issue
description: Propose the OpenSpec change for a GitHub issue from an already-settled design, on the issue's `issue-<n>` worktree branch, then commit, push, and link it from the issue.
disable-model-invocation: true
compatibility: Requires git, authenticated GitHub CLI with issue-write access, the openspec CLI, and the `openspec-propose` procedure.
---

# Propose an OpenSpec Change for an Issue

Human-invoked, after the design is settled. Turn that design into an OpenSpec change on the issue's worktree, commit and push it, and link it from the issue. Plan only — never implement, verify, archive, open a PR, or merge.

## Inputs

- Issue number `n` and repository (ask if ambiguous).
- The settled design. Ask before proposing if scope, acceptance criteria, or a consequential choice is unclear; never invent intent.
- The base branch. Use one supplied in the request; otherwise ask before provisioning, proposing the repository's default PR base. On resume, derive it from the existing worktree instead of re-asking.

## Steps

1. **Resolve the worktree.** Read the repository's project instructions and delivery policy. Confirm `n` is an issue via `gh issue view <n> --repo <repo>`. Resolve the remote and base from those instructions. Find the worktree for branch `issue-<n>` with `git worktree list --porcelain` and work there, never in the main checkout. If none exists, create one with basename and branch `issue-<n>` from freshly fetched `<remote>/<base>`; if the branch exists only as a ref, check it out in the new worktree. If `issue-<n>` is already checked out elsewhere, or the worktree holds unexplained changes, stop and reconcile rather than duplicating or overwriting work.
2. **Propose the change.** Follow the `openspec-propose` procedure (resolved from available skills) to create every artifact the apply phase requires from the settled design, in this worktree's store. Confirm `openspec validate <change> --store <id>` passes (omit `--store` without a registered store); if the change would land outside this worktree, stop and reconcile. Do not commit an invalid change.
3. **Commit and push.** Verify the remote and that only the new change is outgoing — nothing else staged, committed, or unpublished from a reused branch. Commit with signing and DCO (`git commit -S -s`) and push without force to `issue-<n>` on that remote; reconcile partial commits or pushes.
4. **Link it from the issue.** Comment on `n` naming the change and its store path (`gh issue comment <n> --repo <repo> --body-file <path>`) and verify it posted. Confirm the exact `openspec` label exists, then add it (`gh issue edit <n> --repo <repo> --add-label openspec`) so `orc-issue-to-pr` selects this change.
5. **Finish.** Report issue, worktree/branch, change name, artifact paths, validation, commit SHA, push receipt, and comment URL.
