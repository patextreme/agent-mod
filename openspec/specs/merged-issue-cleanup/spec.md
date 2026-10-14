# merged-issue-cleanup Specification

## Purpose

Safely preview and explicitly confirm cleanup of local issue work whose matching GitHub PR was merged, preserving uncertain work and limiting pruning to stale remote-tracking refs.

## Requirements

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

Associated worktrees SHALL be accessible and unlocked. Removal SHALL use only normal `git worktree remove` without force, unlocking, or filesystem deletion performed by the skill; a git refusal SHALL preserve the branch and be reported as the blocker. Removal SHALL satisfy the configuration, quiescence, exclusion, and preview prerequisites below.

#### Scenario: Establish effective configuration in the removal context
- **WHEN** cleanup prepares to attempt a worktree removal
- **THEN** Before attempting removal, cleanup SHALL establish that the effective `status.showUntrackedFiles` applicable to Git's internal status check in the target worktree is unset (default `normal`), `normal`, or `all`, accounting for all applicable configuration scopes, includes/conditional includes, and inherited environment-based configuration in the actual removal context.
- **AND** An effective `no`, invalid value, or inability to establish that configuration SHALL pause the affected removal for operator reconciliation and preserve its branch; cleanup SHALL NOT change configuration or inject invocation flags/environment overrides to satisfy this prerequisite.

#### Scenario: Require operator-confirmed quiescence through removal
- **WHEN** cleanup prepares to attempt a worktree removal
- **THEN** Cleanup SHALL also require explicit operator confirmation that all writers to the target worktree are stopped and will remain stopped through completion of worktree removal; absent, uncertain, or lost quiescence SHALL pause that removal and preserve its branch.

#### Scenario: Exclude protected or unexplained worktree associations
- **WHEN** cleanup inventories associated worktrees
- **THEN** Cleanup SHALL skip the current session's worktree, the main worktree, missing/prunable records, and unexplained associations.

#### Scenario: Preview ignored content without an eligibility gate
- **WHEN** cleanup assesses eligibility and previews candidate worktrees
- **THEN** Ignored files SHALL NOT gate eligibility: the preview SHALL enumerate them as content removal will delete, not as a guarantee of safe deletion.

#### Scenario: Ignored build output remains
- **WHEN** an otherwise eligible worktree contains ignored files and safe effective configuration and explicit operator-confirmed quiescence are established
- **THEN** cleanup enumerates them in the preview as content removal will delete and attempts normal removal without treating ignored content as a blocker

#### Scenario: Excluded worktrees stay out of scope
- **WHEN** a branch's only worktree is the main worktree, the current session's worktree, a missing/prunable record, or an unexplained branch/path association
- **THEN** cleanup skips the branch and reports the exclusion

#### Scenario: Effective configuration suppresses untracked content
- **WHEN** the configuration applicable to the target worktree's internal status check sets `status.showUntrackedFiles=no`, is invalid, or cannot be established
- **THEN** cleanup pauses that removal for operator reconciliation and preserves the branch without changing configuration, injecting overrides, or attempting deletion

#### Scenario: Quiescence is not established
- **WHEN** the operator has not explicitly confirmed that all worktree writers have stopped and will remain stopped through removal, or that condition becomes uncertain or lost before removal
- **THEN** cleanup pauses the affected removal and preserves its branch; if the assertion was missing from otherwise unchanged approval before removal began, cleanup SHALL request only the missing assertion; uncertain or lost quiescence SHALL require reconciliation and renewed explicit quiescence confirmation before resumption

### Requirement: Snapshot-bound confirmation and recheck

Cleanup SHALL show branch/local SHA, worktree path or absence, PR/time and eligibility/skip reasons, the ignored-file listing and effective status-configuration result per candidate worktree, plus the remote to prune. Approval and rechecks SHALL follow the scenarios below. A git refusal SHALL be treated as fresh evidence and not retried. With no eligible candidates, prune-only work SHALL require separate confirmation.

#### Scenario: Bind explicit approval to the previewed snapshot
- **WHEN** the operator selects and confirms candidates from the preview
- **THEN** Explicit selection/confirmation SHALL bind approval to those identities and results, including effective configuration applicability evidence/context, and SHALL record the operator's explicit assertion that all writers to every selected target worktree covered by it are stopped and will remain stopped through completion of removal, not infer it from generic deletion consent.

#### Scenario: Continuing assertion covers uninterrupted multi-target removal
- **WHEN** the operator explicitly approves the previewed snapshot and asserts continuing stopped writers for every selected target, and execution remains uninterrupted with unchanged approval-bound evidence/configuration and established quiescence
- **THEN** that single approval and assertion SHALL cover all those targets through completion; routine automated checks, completed pruning, and transitions to another unchanged approved target SHALL NOT alone require another human assertion.

#### Scenario: Generic approval omits the assertion
- **WHEN** the operator approves an unchanged preview with generic consent such as "go ahead" but has not explicitly asserted continuing stopped writers
- **THEN** cleanup SHALL preserve the snapshot approval, pause worktree removal and preserve the branch, and request only the missing stopped-writers assertion, not repeat snapshot approval

#### Scenario: Recheck identities and eligibility before each removal
- **WHEN** cleanup prepares each approved removal
- **THEN** Each removal SHALL recheck repository/remote identity, branch/remote tips, PR merge/head state, worktree paths/associations, lock state, and exclusions; changes SHALL invalidate that candidate's approval, skip it, and be reported; only reconciliation that establishes eligibility SHALL permit a fresh preview and applicable confirmation.

#### Scenario: Recheck configuration and quiescence immediately before removal
- **WHEN** cleanup is about to remove each approved worktree
- **THEN** Immediately before each worktree removal, cleanup SHALL re-establish the applicable effective status configuration and assess whether the recorded continuing stopped-writers assertion remains applicable, rather than automatically requesting another human assertion.
- **AND** Changed configuration results or applicability evidence/context SHALL invalidate affected approval and require reconciliation and fresh applicable confirmation, even if still safe; unsafe/unknown configuration or absent, uncertain, or lost quiescence SHALL pause the affected removal and preserve its branch; renewed consent SHALL NOT bypass eligibility or configuration prerequisites.

#### Scenario: Safe configuration changes after approval
- **WHEN** the effective status configuration changes from `normal` to `all`, or its bound applicability evidence/context changes, before removal
- **THEN** cleanup SHALL pause the affected removal and preserve its branch; only reconciliation that re-establishes safe applicable configuration and eligibility SHALL permit a fresh preview, snapshot approval, and explicit continuing stopped-writers assertion

#### Scenario: Disclose the non-atomic observation boundary at approval
- **WHEN** cleanup previews candidates and seeks confirmation
- **THEN** Git's content check and recursive deletion are separate, non-atomic operations: preservation of non-ignored untracked/modified content is bounded to what Git observes in its check under safe effective configuration.
- **AND** Cleanup SHALL disclose at preview/confirmation that a writer violating quiescence after that check can cause content loss and that the ignored-path preview does not guarantee safe deletion.

#### Scenario: Tip changes after approval
- **WHEN** a candidate's tip changes between preview and removal
- **THEN** cleanup skips it and reports invalidated approval rather than deleting the newly changed ref

#### Scenario: Worktree content changes after approval
- **WHEN** files appear or change inside an approved worktree before Git's content check while branch tip, PR state, and worktree path are unchanged, and safe effective configuration and operator-confirmed quiescence are established before removal
- **THEN** content changes alone do not invalidate approval: non-ignored untracked or modified content observed by Git causes refusal and branch preservation, while ignored content may be deleted with the worktree

#### Scenario: Writer violates quiescence after Git's check
- **WHEN** a writer changes worktree content after Git's content check despite the operator's quiescence assertion
- **THEN** Git's non-atomic removal may delete that content; the preview/confirmation discloses this residual risk rather than promising preservation beyond Git's observation boundary

### Requirement: Guarded local removal
Approved worktrees SHALL be removed normally from a retained worktree outside the target. Removal failure SHALL preserve the branch. Local branch deletion SHALL occur only after confirming no worktree uses it; normal deletion refusal solely due to squash/rebase ancestry SHALL permit a rechecked forced local-ref deletion for that approved unchanged branch, not blanket force retries.

#### Scenario: Worktree removal fails
- **WHEN** normal worktree removal refuses an approved candidate
- **THEN** cleanup reports the blocker without forcing directory removal or deleting its branch

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
- **THEN** it recognizes actual completed effects without repeating completed pruning or removals, preserves uncertain state and confirms changed/new work before proceeding

#### Scenario: Resume unchanged approval after interruption or pause
- **WHEN** approved execution resumes after interruption or a pause in the removal sequence, even with unchanged remaining targets
- **THEN** cleanup SHALL re-inventory and reconcile current evidence/configuration, retain unchanged approved identities, and obtain renewed explicit stopped-writers confirmation for every remaining worktree to be removed before its immediate rechecks; fresh snapshot approval SHALL be required for changed/new candidates only after eligibility and configuration prerequisites are satisfied

#### Scenario: Writer quiescence becomes uncertain or is lost
- **WHEN** a writer may have resumed or is known to be writing to an approved target before removal
- **THEN** cleanup SHALL pause that removal and preserve its branch until reconciliation and renewed explicit continuing stopped-writers confirmation establish quiescence; unchanged snapshot approval alone SHALL NOT authorize removal
