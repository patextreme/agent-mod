# Proposal

## Why

The issue-to-PR orchestration hardcodes `develop` as the PR and worktree base branch, but base branch names are repo-specific: this repository itself has no `develop` and its tracker policy declares `main` as the default PR base, so the skill is wrong even in its owning repo and unusable in any repo that bases PRs elsewhere.

## What Changes

- Remove every hardcoded `develop` base from the skill and its spec; the orchestration never advertises or assumes a base branch name.
- Derive the base per run: use the base supplied in the request input when present; otherwise confirm with the user before provisioning or delivery, proposing the currently checked out local branch as the default recommendation. The confirmation flows through the orchestration's existing human-input contract (pause with question, options, recommendation), so headless runs surface the blocked question instead of guessing.
- Make the confirmed base sticky for the run: provision the worktree from freshly fetched `origin/<base>`, create the PR with base `<base>`, and guard the merge base against current `origin/<base>`.
- On resume of an existing worktree/PR, derive the base from the existing PR/worktree state instead of re-deriving or re-asking.
- Keep the closing reference (`Closes #<n>`, repository-qualified) and all other delivery, review, and completion requirements unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `issue-to-pr-orchestration`: worktree provisioning, PR delivery, and merge-base movement requirements change from hardcoded `origin/develop` to a confirmed, sticky, per-run base branch with explicit selection/confirmation and resume derivation behavior.

## Impact

- `skills/orc-issue-to-pr/SKILL.md`: stage 2 (provisioning/resume from confirmed `origin/<base>`, base-selection confirmation contract) and stage 4 (PR base and merge-base guard).
- `skills/orc-issue-to-pr/references/pseudocode.md`: base derivation and use of the confirmed base in provisioning and delivery steps.
- `openspec/specs/issue-to-pr-orchestration/spec.md`: three requirements updated via this change's delta (worktree provisioning, delivery conventions, merge-base movement).
- No code, API, dependency, or test changes; behavior is markdown-defined orchestration policy. Downstream orchestrators operating on repos without the confirmed base's remote branch will pause for the base question rather than failing on a nonexistent `origin/develop`.
