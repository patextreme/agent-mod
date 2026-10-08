# Design

## Context

The `merged-issue-cleanup` skill gates worktree removal on the worktree being "free of untracked/ignored files and initialized submodules". Git's behavior observed in a scratch repository applies only to the configuration and content observed during its check, not an atomic check-and-delete operation:

| Worktree state | `git worktree remove` (no `--force`) |
|---|---|
| Ignored files only (`node_modules/`, `result` symlink, `.env`) | Removes the worktree — deleting the ignored files with it |
| Untracked non-ignored file observed with effective `status.showUntrackedFiles` unset (default `normal`), `normal`, or `all` | Refuses |
| Untracked non-ignored file with effective `status.showUntrackedFiles=no` | May be missed and deleted; removal must pause |
| Modified tracked file | Refuses |

So the gate is stricter than the tool it guards, and its implied protection does not exist: blocked candidates were cleaned manually anyway (issue #71 / PR #72), destroying the same content later with less visibility. Git's refusal boundary does not unconditionally protect untracked content: its internal `git status --porcelain --ignore-submodules=none` honors `status.showUntrackedFiles`, and its content check is followed by a separate recursive deletion. Safety therefore requires (a) exact merged-PR evidence, (b) safe effective configuration for that check, and (c) operator-established quiescence through removal. Refusal protects observed non-ignored untracked/modified content, not content arriving after the check. These limits are supported by Git v2.54.0 [`check_clean_worktree`](https://github.com/git/git/blob/v2.54.0/builtin/worktree.c#L1314-L1362), [removal sequencing](https://github.com/git/git/blob/v2.54.0/builtin/worktree.c#L1378-L1430), and [`status.showUntrackedFiles` configuration](https://github.com/git/git/blob/v2.54.0/Documentation/config/status.adoc).

## Goals / Non-Goals

- Goal: a merged-PR candidate with an ignored-files-only worktree cleans in one confirmed pass.
- Goal: preservation of uncertain work via git's refusal within its observation boundary, reported as the blocker — with no skill-side content inspection acting as a gate; unsafe/unknown effective configuration or unestablished quiescence pauses the affected removal and preserves the branch.
- Goal: prune executes once per invocation, after confirmation, before removals.
- Non-Goal: classifying ignored files as regenerable vs precious (rejected, see D1).
- Non-Goal: changing merge-evidence requirements, the `-D` squash carve-out, invocation/preview/confirm structure, or remote-deletion limits.

## Decisions

- **D1 — Git-mediated removal replaces the content gate.** The skill attempts plain `git worktree remove` only under the configuration and operational prerequisites below, and treats refusal as the preservation mechanism for content Git observes. No force, manual deletion fallback, configuration mutation, or invocation-level configuration override is authorized.
  - **Safe effective configuration:** Inspect the effective `status.showUntrackedFiles` applicable to Git's internal status command in each target worktree, accounting for system/global/repository/worktree configuration, includes/conditional includes, and inherited environment-based configuration in the actual removal context. Accept only an unset value whose default is `normal`, or effective `normal`/`all`; `no`, an invalid value, or inability to establish the applicable effective value pauses that worktree's removal for operator reconciliation and preserves its branch. Do not infer safety from only the retained worktree's configuration or one config file. Record the result in the preview and recheck it immediately before removal; a changed result requires reconciliation/fresh confirmation. The skill does not change configuration or add flags/environment overrides to make the check safe.
  - **Operational quiescence:** Before approving a worktree removal, the operator must explicitly confirm that all writers to that worktree have stopped (including agents, editors/autosave, builds/watchers, and background processes) and will remain stopped through completion of `git worktree remove`. A generic cleanup confirmation is not this assertion. Reconfirm that this condition is still established immediately before each worktree removal; if absent, uncertain, or lost, pause the affected removal and preserve its branch. Resuming it requires reconciliation and renewed explicit quiescence confirmation. No locking, enforced concurrency architecture, or race-proof guarantee is introduced.
  - **Bounded protection:** Git checks content and then deletes recursively; those steps are non-atomic. Safe configuration exposes non-ignored untracked content to its check, but a writer violating quiescence after the check can still cause deletion of new/changed content. Disclose this residual risk at preview/confirmation; the ignored-path listing is informational, not proof of safe deletion.
  *Alternative rejected*: two-tier classification of ignored files (regenerable allowlist — `node_modules/`, nix `result` symlinks, `dist/` — vs unclassified) with preview tiers and an optional classifier script. Rejected because the experiment disproved the gate's protective value: content is destroyed either way, and classification adds a maintained allowlist, portability knobs, and a test surface to preserve zero protection.
- **D2 — Preview enumerates ignored paths informationally.** `git status --porcelain --ignored` stays in Inspect with a new job: report ("ignored files present: N paths — deleted by removal"), never gate on ignored content. Bind approval to the listed snapshot, but do not present that listing as proof of complete content visibility or safe deletion. The separate effective-configuration check and explicit quiescence assertion in D1 remain mandatory; the preview explains Git's non-atomic observation boundary.
- **D3 — Prune-first behind the single confirmation.** Execution order after confirmation: refspec inspection → `git fetch --prune` → removals. This reconciles "prune first" with the existing promise to confirm before pruning refs. It loses nothing: prune only drops tracking refs whose remote branch is gone, so a post-merge push to `origin/issue-<n>` survives pruning and still trips the evidence check; stale refs (the `origin/issue-71` case) stop complicating evidence gathering.
- **D4 — Submodules ride on git.** The explicit initialized-submodule gate dies with the rest of the content gate. A dirty submodule surfaces as modified content → git refuses → preserved; a clean submodule checkout is regenerable by definition (fetchable) and may be deleted with the worktree.
- **D5 — Authority wording: "direct filesystem deletion by the skill".** Git's own recursive removal is sanctioned and is the only deletion mechanism; the ban now unambiguously targets the skill running its own `rm -rf` (including the pre-cleanup artifact deletion the old flow forced).

## Risks / Trade-offs

- [A gitignored precious file in an issue worktree (e.g. `.env`) is deleted on removal] → enumerated in the preview before the confirm; issue worktrees are per-branch scaffolding whose canonical gitignored files live in the main checkout, which cleanup never touches.
- [Effective status configuration suppresses untracked content] → inspect the actual target's effective configuration and recheck before removal; `status.showUntrackedFiles=no` or an unknown/invalid result pauses that removal for reconciliation without overrides or branch deletion.
- [Content appears between preview and Git's content check] → with safe effective configuration and quiescence established before removal, non-ignored untracked/modified content observed by Git causes refusal and branch preservation; ignored content remains deletable.
- [A concurrent writer changes content after Git's check] → require stopped writers and explicit operator confirmation through removal, and pause when that prerequisite is not established. Git remains non-atomic: a writer violating that operational condition can cause content loss; neither the preview nor this workflow promises race-proof preservation.
- [Behavior change for callers relying on skip-on-ignored-files] → flagged **BREAKING** in the proposal; the skill is human-invoked, so the operator confirming the preview sees the new behavior.
- [Clean submodule checkout deleted silently] → checkout is reproducible from the remote; dirty submodule content still refuses.

## Migration Plan

Markdown-only change (skill prose + spec delta); no data or config migration. The next cleanup invocation after merge behaves differently on the first ignored-files-only worktree it meets. Rollback: revert the commit.

## Open Questions

(none)
