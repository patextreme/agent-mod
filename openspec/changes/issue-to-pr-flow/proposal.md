# Proposal

## Why

The existing OpenSpec pipeline starts from an already-created local change and does not own GitHub intake, isolated checkouts or publication. An unattended issue-to-PR flow should turn an actionable issue into a locally verified, remotely green, ready-for-review PR without disturbing concurrent work, while retaining a safe path for human clarification and recovery.

## What Changes

- Add `issue-to-pr`, limited to issues belonging to the invoking repository, with a configurable base branch and native worktree preparation.
- Snapshot issue intent, create complete OpenSpec planning artifacts, and compose the existing `openspec-all` pipeline in the prepared workspace without per-stage confirmation.
- Extract a shared escalation module from existing terminal steering and in-flight PR pending-decision patterns: support live stdin answers and asynchronous operator answers on a later invocation of the same issue attempt.
- Add safe embedded workspace/steering/budget seams while preserving default standalone OpenSpec inputs, acceptance rules, restart semantics and no-Git policies.
- Controller-commit and publish a draft PR; perform bounded issue-scoped CI repairs and mark it ready only when current-head required checks and configured gates are green.
- Persist attempt identity, completed effects, pending decisions and cumulative budgets; preserve prior work, revalidate continuations, incorporate target-branch movement and escalate unexpected external head edits.

## Capabilities

### New Capabilities

- `issue-to-pr`: Issue intake, isolated planning/implementation, safe publication, current-head CI acceptance and recoverable attempt lifecycle.
- `flow-escalation`: Shared scoped human-decision collection and durable operator-mediated clarification, independent of any one flow's repair authority.

### Modified Capabilities

- `openspec-all`: Support native embedding in a prepared canonical workspace and caller-owned steering/continuation budgets without changing standalone pipeline behavior or weakening stage policies.
- `openspec-groom`: Make caller-supplied workspace, scoped steering and conserved hosted revision budgets explicit while retaining default terminal behavior.
- `openspec-implement`: Preserve initial-apply and repair accounting across hosted continuations without changing default standalone restarts.
- `openspec-verify`: Support scoped hosted steering and conserved repair budgets while keeping independent verification and default standalone behavior unchanged.

## Impact

- New entrypoint and composition under `flows/issue-to-pr/`; shared escalation, workspace/ownership and composition seams under `flows/shared/` as appropriate.
- Runtime workspace and embedded invocation dependencies in OpenSpec factories; existing constituent input schemas and default CLI behavior remain compatible.
- Reuse neutral Git, GitHub, CI and pending-decision mechanics from the in-flight `pr-review-flows` work after that prerequisite is stabilized/integrated. Do not transplant its PR-review acceptance predicate, comment ledger or success-cleanup policy.
- GitHub issue/PR/check APIs, trusted repository setup/gates, local durable attempt state, documentation and recursive model-free flow tests. Worktrees provide checkout isolation, not a security sandbox or cross-host locking.
- No acpx upgrade, new workflow engine, GitHub-comment answer listener, automatic merge, dirty-caller snapshotting or issue closure is required. No implementation changes are part of this proposal.
