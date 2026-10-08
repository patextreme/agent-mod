# Spec Delta

## MODIFIED Requirements

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
- **THEN** cleanup pauses the affected removal and preserves its branch; resumption requires reconciliation and renewed explicit quiescence confirmation

### Requirement: Snapshot-bound confirmation and recheck

Cleanup SHALL show branch/local SHA, worktree path or absence, PR/time and eligibility/skip reasons, the ignored-file listing and effective status-configuration result per candidate worktree, plus the remote to prune. Approval and rechecks SHALL follow the scenarios below. A git refusal SHALL be treated as fresh evidence and not retried. With no eligible candidates, prune-only work SHALL require separate confirmation.

#### Scenario: Bind explicit approval to the previewed snapshot
- **WHEN** the operator selects and confirms candidates from the preview
- **THEN** Explicit selection/confirmation SHALL bind approval to those identities and results and SHALL include the operator's explicit quiescence assertion for approved worktree removals, not infer it from generic deletion consent.

#### Scenario: Recheck identities and eligibility before each removal
- **WHEN** cleanup prepares each approved removal
- **THEN** Each removal SHALL recheck branch/remote tips, PR merge state, worktree path, lock state, and exclusions; changes SHALL invalidate that candidate's approval.

#### Scenario: Recheck configuration and quiescence immediately before removal
- **WHEN** cleanup is about to remove each approved worktree
- **THEN** Immediately before each worktree removal, cleanup SHALL recheck the applicable effective status configuration and that operator-confirmed quiescence is still established; a changed configuration result SHALL require reconciliation and fresh confirmation, and unsafe/unknown configuration or unestablished quiescence SHALL pause the affected removal and preserve its branch.

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
