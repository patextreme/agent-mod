## Purpose

Safely preview and explicitly confirm cleanup of local issue work whose matching GitHub PR was merged, preserving uncertain work and limiting pruning to stale remote-tracking refs.

## ADDED Requirements

### Requirement: Explicit invocation and narrow candidates
Cleanup SHALL be human-invoked only and inspect local branches matching `^issue-[0-9]+$`, with or without worktrees. It SHALL resolve repository identity, exact corresponding remote and access before cleanup, fetch without pruning, and inventory associated worktrees, local/upstream/remote tips and paginated PR evidence. Ambiguity SHALL block removal.

#### Scenario: Invocation without approval
- **WHEN** the user invokes cleanup
- **THEN** the skill inventories and previews candidates without treating invocation as authorization to delete or prune

### Requirement: Exact merged PR evidence
A candidate SHALL require exactly one matching merged PR, no competing open/ambiguous PR, matching head repository/branch and project-expected base, and local tip equal to the authoritative PR head SHA. An existing remote branch SHALL have that same tip. Missing head evidence, unpublished/divergent/post-merge commits or issue closure alone SHALL not qualify.

#### Scenario: Squash-merged PR has unchanged issue tip
- **WHEN** the local issue tip and any existing remote tip equal the authoritative merged PR head despite different merge ancestry
- **THEN** exact PR/head evidence can qualify the candidate without inferring safety from ancestry or patch similarity

#### Scenario: Local commits were added after merge
- **WHEN** the local issue tip differs from the merged PR's recorded head
- **THEN** the branch is preserved with an explicit skip reason

### Requirement: Worktree preservation
Associated worktrees SHALL be accessible, clean, unlocked and free of untracked/ignored files and initialized submodules before removal. Cleanup SHALL skip the current session's worktree, main worktree, missing/prunable records and unexplained associations. Uncertain work SHALL be preserved rather than force-removed or automatically stashed.

#### Scenario: Ignored build output remains
- **WHEN** an otherwise eligible worktree contains ignored files
- **THEN** cleanup preserves it and reports the blocker instead of assuming ignored content is disposable

### Requirement: Snapshot-bound confirmation and recheck
Cleanup SHALL show branch/local SHA, worktree path or absence, PR/time and eligibility/skip reasons, plus the remote to prune. Explicit selection/confirmation SHALL bind approval to those identities. Each removal SHALL recheck current evidence; changes SHALL invalidate that candidate's approval. With no eligible candidates, prune-only work SHALL require separate confirmation.

#### Scenario: Tip changes after approval
- **WHEN** a candidate's tip changes between preview and removal
- **THEN** cleanup skips it and reports invalidated approval rather than deleting the newly changed ref

### Requirement: Guarded local removal
Approved worktrees SHALL be removed normally from a retained worktree outside the target. Removal failure SHALL preserve the branch. Local branch deletion SHALL occur only after confirming no worktree uses it; normal deletion refusal solely due to squash/rebase ancestry SHALL permit a rechecked forced local-ref deletion for that approved unchanged branch, not blanket force retries.

#### Scenario: Worktree removal fails
- **WHEN** normal worktree removal refuses an approved candidate
- **THEN** cleanup reports the blocker without forcing directory removal or deleting its branch

### Requirement: Restricted pruning and no remote deletion
After approved removals, cleanup SHALL inspect refspecs/prune settings and prune only stale remote-tracking branch refs on the verified remote. Settings that could prune local refs, tags or other refs SHALL pause for reconciliation. Remote branch/tag deletion, recursive filesystem deletion, unlocking, `git prune` and reflog expiry SHALL remain outside its authority.

#### Scenario: Unsafe prune configuration
- **WHEN** configured fetch/prune behavior could affect non-tracking refs
- **THEN** cleanup requests reconciliation rather than running the prune command

### Requirement: Verified partial outcomes and continuation
Cleanup SHALL verify actual removed paths, registrations and refs, and report removals, preserved candidates, pruning, failures and remaining input. Interruption SHALL require re-inventory and fresh confirmation for changed/new candidates; unchanged approved partial work SHALL retain its original identities. Partial cleanup MUST NOT be described as full success.

#### Scenario: One candidate was removed before interruption
- **WHEN** cleanup resumes after only some approved effects completed
- **THEN** it recognizes actual completed removals, preserves uncertain state and confirms changed/new work before proceeding
