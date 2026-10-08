# Proposal

## Why

`cleanup-merged-issues` refuses to clean worktrees containing ignored files, so every issue run through `orc-issue-to-pr` — whose checks materialize `node_modules/` and nix `result` symlinks and whose finish leaves the worktree in place — manufactures a worktree the cleanup skill always refuses, even with fully verified merged-PR evidence (observed on issue #71 / PR #72: all evidence gates passed, candidate still reported Skip, cleanup only proceeded after a manual off-skill `rm -rf`). The gate is stricter than the tool it guards: plain `git worktree remove` removes a worktree holding only ignored files (deleting them) and refuses on untracked non-ignored files, modified tracked files, and locks — so the gate does not protect ignored content, it only fragments the flow and pushes destruction off-book.

## What Changes

- Drop the worktree-content eligibility gate (clean / free of untracked-ignored files / no initialized submodules) from `merged-issue-cleanup`; git-mediated removal replaces it: plain `git worktree remove` is the only deletion mechanism, `--force` stays banned, and a git refusal preserves the branch and is reported as the blocker.
- Require the preview to enumerate ignored paths per candidate worktree as informational content ("deleted by removal") and bind approval to that listing; nothing gates on ignored content anymore (**BREAKING** for the old preserve-on-ignored-files behavior).
- Move pruning ahead of removals: after confirmation, inspect refspecs/prune settings, run `git fetch --prune` on the verified remote, then remove approved candidates. Prune stays behind explicit confirmation; the no-eligible-candidates prune-only confirmation is unchanged.
- Shrink the pre-removal recheck to identity, PR merge state, tips, worktree path/lock state, and exclusions; worktree content is re-evaluated atomically by git at removal time and a refusal is treated as fresh evidence, never retried.
- Reword the deletion-authority clause from "recursive filesystem deletion" to "direct filesystem deletion by the skill" so the ban targets the skill's own deletions, not git's recursive removal.
- Mirror all of the above in the `cleanup-merged-issues` skill (Inspect inventory, Preview, Clean-up ordering and recheck).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `merged-issue-cleanup`: worktree eligibility no longer gates on worktree content (untracked/ignored files, initialized submodules); removal becomes git-mediated with refusals as the preservation mechanism; pruning moves before removals; preview enumerates ignored paths; recheck scope shrinks to evidence + git's atomic refusal.

## Impact

- `openspec/specs/merged-issue-cleanup/spec.md` — 3 requirements modified (Worktree preservation; Snapshot-bound confirmation and recheck; Restricted pruning and no remote deletion), 1 scenario inverted, 1 scenario wording touch (partial outcomes recognize pruning).
- `skills/cleanup-merged-issues/SKILL.md` — Inspect step 2 shrinks, Inspect step 5 deleted, Preview gains ignored-path lines, Clean-up reorders prune before removals and shrinks its recheck.
- No code, dependency, or test changes: the `factory-skills` gate asserts packaging/frontmatter only, and prose contracts stay untested by repo convention.
- Behavior shifts accepted in design review: a dirty submodule surfaces as modified (git refuses, branch preserved); a clean submodule checkout is regenerable and may be deleted with the worktree; a gitignored file in an issue worktree (e.g. `.env`) is deleted on removal — visible in the preview, never blocked.
