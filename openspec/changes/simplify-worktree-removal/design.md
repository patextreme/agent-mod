# Design

## Context

The `merged-issue-cleanup` skill gates worktree removal on the worktree being "free of untracked/ignored files and initialized submodules". Git's actual behavior (verified empirically in a scratch repository):

| Worktree state | `git worktree remove` (no `--force`) |
|---|---|
| Ignored files only (`node_modules/`, `result` symlink, `.env`) | Removes the worktree — deleting the ignored files with it |
| Untracked non-ignored file | Refuses |
| Modified tracked file | Refuses |

So the gate is stricter than the tool it guards, and its implied protection does not exist: blocked candidates were cleaned manually anyway (issue #71 / PR #72), destroying the same content later with less visibility. Git upstream already made the judgement call — ignored means disposable-enough, untracked/modified means refuse. Safety lives in (a) exact merged-PR evidence and (b) git's refusal boundary, not in a content precondition git does not enforce.

## Goals / Non-Goals

- Goal: a merged-PR candidate with an ignored-files-only worktree cleans in one confirmed pass.
- Goal: preservation of uncertain work via git's refusal, reported as the blocker — with no skill-side content inspection acting as a gate.
- Goal: prune executes once per invocation, after confirmation, before removals.
- Non-Goal: classifying ignored files as regenerable vs precious (rejected, see D1).
- Non-Goal: changing merge-evidence requirements, the `-D` squash carve-out, invocation/preview/confirm structure, or remote-deletion limits.

## Decisions

- **D1 — Git-mediated removal replaces the content gate.** The skill attempts plain `git worktree remove` and treats refusal as the preservation mechanism. *Alternative rejected*: two-tier classification of ignored files (regenerable allowlist — `node_modules/`, nix `result` symlinks, `dist/` — vs unclassified) with preview tiers and an optional classifier script. Rejected because the experiment disproved the gate's protective value: content is destroyed either way, and classification adds a maintained allowlist, portability knobs, and a test surface to preserve zero protection.
- **D2 — Preview enumerates ignored paths informationally.** `git status --porcelain --ignored` stays in Inspect with a new job: report ("ignored files present: N paths — deleted by removal"), never gate. This is the surviving trace of informed consent at one line of cost, and it is the only thing that separates the new flow from blind deletion.
- **D3 — Prune-first behind the single confirmation.** Execution order after confirmation: refspec inspection → `git fetch --prune` → removals. This reconciles "prune first" with the existing promise to confirm before pruning refs. It loses nothing: prune only drops tracking refs whose remote branch is gone, so a post-merge push to `origin/issue-<n>` survives pruning and still trips the evidence check; stale refs (the `origin/issue-71` case) stop complicating evidence gathering.
- **D4 — Submodules ride on git.** The explicit initialized-submodule gate dies with the rest of the content gate. A dirty submodule surfaces as modified content → git refuses → preserved; a clean submodule checkout is regenerable by definition (fetchable) and may be deleted with the worktree.
- **D5 — Authority wording: "direct filesystem deletion by the skill".** Git's own recursive removal is sanctioned and is the only deletion mechanism; the ban now unambiguously targets the skill running its own `rm -rf` (including the pre-cleanup artifact deletion the old flow forced).

## Risks / Trade-offs

- [A gitignored precious file in an issue worktree (e.g. `.env`) is deleted on removal] → enumerated in the preview before the confirm; issue worktrees are per-branch scaffolding whose canonical gitignored files live in the main checkout, which cleanup never touches.
- [Content appears between preview and removal] → git re-evaluates atomically at removal time: untracked/modified content refuses and preserves the branch; no skill-side recheck can be raced this way.
- [Behavior change for callers relying on skip-on-ignored-files] → flagged **BREAKING** in the proposal; the skill is human-invoked, so the operator confirming the preview sees the new behavior.
- [Clean submodule checkout deleted silently] → checkout is reproducible from the remote; dirty submodule content still refuses.

## Migration Plan

Markdown-only change (skill prose + spec delta); no data or config migration. The next cleanup invocation after merge behaves differently on the first ignored-files-only worktree it meets. Rollback: revert the commit.

## Open Questions

(none)
