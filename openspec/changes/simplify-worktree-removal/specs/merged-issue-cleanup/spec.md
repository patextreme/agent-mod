# Spec Delta

## MODIFIED Requirements

### Requirement: Worktree preservation

Associated worktrees SHALL be accessible and unlocked. Removal SHALL use only normal `git worktree remove` without force, unlocking, or filesystem deletion performed by the skill; a git refusal SHALL preserve the branch and be reported as the blocker. Cleanup SHALL skip the current session's worktree, the main worktree, missing/prunable records, and unexplained associations. Ignored files SHALL NOT gate eligibility: the preview SHALL enumerate them as content removal will delete.

#### Scenario: Ignored build output remains
- **WHEN** an otherwise eligible worktree contains ignored files
- **THEN** cleanup enumerates them in the preview as content removal will delete and removal proceeds without treating them as a blocker

#### Scenario: Excluded worktrees stay out of scope
- **WHEN** a branch's only worktree is the main worktree, the current session's worktree, a missing/prunable record, or an unexplained branch/path association
- **THEN** cleanup skips the branch and reports the exclusion

### Requirement: Snapshot-bound confirmation and recheck

Cleanup SHALL show branch/local SHA, worktree path or absence, PR/time and eligibility/skip reasons, the ignored-file listing per candidate worktree, plus the remote to prune. Explicit selection/confirmation SHALL bind approval to those identities. Each removal SHALL recheck branch/remote tips, PR merge state, worktree path, lock state, and exclusions; changes SHALL invalidate that candidate's approval. Worktree content is re-evaluated by git at removal time; a refusal SHALL be treated as fresh evidence and not retried. With no eligible candidates, prune-only work SHALL require separate confirmation.

#### Scenario: Tip changes after approval
- **WHEN** a candidate's tip changes between preview and removal
- **THEN** cleanup skips it and reports invalidated approval rather than deleting the newly changed ref

#### Scenario: Worktree content changes after approval
- **WHEN** files appear or change inside an approved worktree between preview and removal while branch tip, PR state, and worktree path are unchanged
- **THEN** approval survives and git's refusal at removal time governs content: untracked or modified content preserves the branch, ignored content is deleted with the worktree

### Requirement: Restricted pruning and no remote deletion

After confirmation and before removals, cleanup SHALL inspect refspecs/prune settings and prune only stale remote-tracking branch refs on the verified remote. Settings that could prune local refs, tags or other refs SHALL pause for reconciliation. Remote branch/tag deletion, direct filesystem deletion by the skill, unlocking, `git prune` and reflog expiry SHALL remain outside its authority.

#### Scenario: Prune precedes removals
- **WHEN** candidates are approved
- **THEN** cleanup prunes stale remote-tracking refs on the verified remote before removing any approved worktree or branch

#### Scenario: Unsafe prune configuration
- **WHEN** configured fetch/prune behavior could affect non-tracking refs
- **THEN** cleanup requests reconciliation rather than running the prune command

### Requirement: Verified partial outcomes and continuation

Cleanup SHALL verify actual removed paths, registrations and refs, and report removals, preserved candidates, pruning, failures and remaining input. Interruption SHALL require re-inventory and fresh confirmation for changed/new candidates; unchanged approved partial work SHALL retain its original identities. Partial cleanup MUST NOT be described as full success.

#### Scenario: One candidate was removed before interruption
- **WHEN** cleanup resumes after only some approved effects (pruning and removals) completed
- **THEN** it recognizes actual completed effects, preserves uncertain state and confirms changed/new work before proceeding
