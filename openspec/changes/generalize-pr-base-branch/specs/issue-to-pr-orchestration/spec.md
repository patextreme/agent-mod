# Spec Delta

## MODIFIED Requirements

### Requirement: Verified issue worktree reuse or provisioning
Orchestration SHALL establish the run's base branch before provisioning: the base supplied in the request input when present, otherwise the currently checked out local branch proposed and confirmed through the orchestration's human-input contract, or the base derived from existing worktree/PR state on resume; the confirmed base SHALL remain sticky for the run. Orchestration SHALL inspect existing worktrees, `issue-<n>` refs and matching PRs before provisioning, reuse verified matching state or create one worktree with basename/branch `issue-<n>` from freshly fetched `origin/<base>`. Active branch duplication, occupied paths, unexplained changes, ambiguous PRs and closed/merged PRs SHALL require reconciliation.

#### Scenario: Existing partial delivery
- **WHEN** matching worktree or PR state exists from an interrupted attempt
- **THEN** orchestration re-establishes evidenced completion and resumes remaining work instead of creating a duplicate worktree or PR

#### Scenario: Base supplied in the request
- **WHEN** the run's request input specifies a base branch
- **THEN** orchestration uses that base for provisioning and delivery without prompting

#### Scenario: Base confirmed with the user
- **WHEN** no base is supplied in the request and no existing worktree/PR state fixes one
- **THEN** orchestration pauses with the human-input question, options, and a recommendation proposing the currently checked out local branch before provisioning

#### Scenario: Headless run without a determinable base
- **WHEN** orchestration runs headless and the base is neither supplied in the request nor derivable from existing worktree/PR state
- **THEN** orchestration surfaces the blocked base question as a paused outcome instead of guessing a base branch name

#### Scenario: Resume derives the base from existing state
- **WHEN** orchestration resumes a run that already has a worktree or PR
- **THEN** orchestration derives the base from that existing PR/worktree state and does not re-derive or re-ask it

### Requirement: Source-defined delivery conventions
Delivery SHALL validate authorized contents, commit with signing and DCO, push without force to `issue-<n>`, and create/reuse its PR targeting the run's confirmed base `<base>` with the issue closing reference. It SHALL reconcile current `origin/<base>` and rerun affected checks when needed. Project instructions and mandatory delivery gates SHALL remain controlling; incompatible policy SHALL block rather than be weakened.

#### Scenario: PR targets the confirmed base
- **WHEN** delivery creates or reuses the PR for `issue-<n>`
- **THEN** the PR targets the run's confirmed base `<base>` and carries the unchanged issue closing reference

#### Scenario: Base moved before delivery
- **WHEN** the intended merge base no longer matches current `origin/<base>`
- **THEN** delegated safe reconciliation and affected validation occur before delivery is accepted
