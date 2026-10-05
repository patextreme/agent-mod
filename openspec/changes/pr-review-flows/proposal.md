# Proposal

## Why

The repository has OpenSpec-specific verification flows but no reusable acpx flow for reviewing GitHub pull requests or repairing their validated defects through CI-backed convergence. Porting the useful policy from `patextreme/ptah-libs`'s `reviewFixLoop` provides durable review memory and reporting while retaining independent validation and controller-owned acceptance.

## What Changes

- Add two public acpx flows, `review` and `review-fix`, with shared internal review, validation, ledger, and reporting components; do not implement a single mode-switched flow.
- Review introduced defects and unmet PR requirements, independently validate every raised issue, and retain non-blocking observations without autonomously repairing them.
- Persist stable findings and explicit human decisions in a PR-comment ledger across invocations, with only one active flow per PR.
- Use full initial review, followed by delta review and explicit reconciliation of unresolved findings; fall back to full review when the base changes or history diverges.
- Keep review-only results advisory. Let the repair controller derive acceptance for a specific head SHA from green repository CI, resolved or explicitly human-accepted review blockers, and no unresolved human-required uncertainty.
- Repair scoped blockers and CI failures in dedicated worktrees, with explicit human steering for consequential decisions, required push authority, at most ten repair dispatches, and fresh review after repairs.
- Use a separate reporter agent following upstream's report organization; the controller persists state and publishes the deterministic outcome and generated report without allowing the reporter to alter findings.
- Preserve failed workspaces, clean up successful ones, and restart against a changed remote head rather than publishing stale repairs or acceptance.

## Capabilities

### New Capabilities

- `pr-review`: Shared evidence-backed PR review, independent finding validation, durable ledger, advisory review entrypoint, and reporter-agent publication.
- `pr-review-fix`: Separate bounded repair entrypoint, human-steered resolution, verified publication, CI-backed acceptance, and repair-workspace lifecycle.

### Modified Capabilities

None. Existing OpenSpec verification and permission behavior remains unchanged.

## Impact

- New entrypoints under `flows/review/` and `flows/review-fix/`, with cohesive PR-specific shared components under `flows/pr-shared/`.
- Reuse existing acpx flow composition, dependency injection, shared data/steering helpers, and model-free ACP testing patterns; do not inherit OpenSpec target or artifact authorization.
- Add Git/GitHub command boundaries, worktree management, durable comment state, and required-check inspection. Git, GitHub CLI authentication, acpx, and a configured ACP agent are prerequisites.
- Add colocated unit/integration tests and README usage documentation. Existing recursive flow test/typecheck discovery should cover new files without dependency changes.
- Uses GitHub PR metadata, commits, checks, and issue comments. No automatic merge, force push, dependency installation, or changes to caller-owned checkout state.
