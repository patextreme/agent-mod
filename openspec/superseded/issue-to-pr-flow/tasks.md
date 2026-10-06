# Tasks

## 1. Prerequisite integration and domain contracts

- [ ] 1.1 Integrate the stabilized `pr-review-flows` prerequisite into the implementation branch without altering its ongoing checkout; verify existing PR/OpenSpec tests and the neutral helper inventory before extraction.
- [ ] 1.2 Define strict new-attempt/continuation inputs and versioned attempt/question/effect/result contracts; verify parser tests reject ambiguous modes, unknown fields, malformed revisions and cross-repository identities.
- [ ] 1.3 Define and document trusted operator setup/gate configuration, finite limits and state/workspace roots; verify fixtures load configuration before agent edits and reject issue-derived commands or missing prerequisites.

## 2. Shared workspace and ownership mechanics

- [ ] 2.1 Extract/adapt neutral Git argv execution and detached allocation/path validation into shared workspace mechanics, preserving PR adapters; verify real-Git tests provision a unique working branch at the pinned base with a linked `.git` file.
- [ ] 2.2 Add canonical repository/issue and physical-workspace ownership with atomic acquisition/revision checks and explicit uncertain-lock recovery; verify simultaneous acquisition has one winner and distinct issues can proceed.
- [ ] 2.3 Implement retained-workspace records and explicit owned clean-only/discard cleanup rather than success-implies-removal; verify dirty caller preservation, successful uncommitted-result retention, abandoned workspace protection and cleanup refusal.
- [ ] 2.4 Validate/sanitize inherited Git overrides, apply command-local approved-hook policy and support isolated configured setup; verify fixtures cannot redirect writes to caller index/files or share writable dependencies and document non-sandbox/single-host limits.

## 3. Shared escalation and durable questions

- [ ] 3.1 Introduce shared escalation packets and live interaction backed by existing steering; verify complete-answer, blank, EOF, non-TTY, cancellation and caller-timeout behavior remains compatible.
- [ ] 3.2 Add durable pending/answered/consumed records with owner/revision/scope checks and atomic persistence; verify death after pending persistence and unknown, stale, partial or repeated submissions never authorize duplicate actions.
- [ ] 3.3 Adapt PR consumers and opt-in OpenSpec consumers to the shared mechanics while retaining domain authorizers; verify neither shared handling nor human answers waive CI/evidence, tool permissions or unrelated edit scope.
- [ ] 3.4 Document live stdin and later operator-answer invocation with attempt/question references; verify documented examples against strict parser fixtures and compatibility tests for default standalone no-TTY behavior.

## 4. Native OpenSpec embedding and conserved accounting

- [ ] 4.1 Add a runtime cwd resolver seam to all five factory preflights and canonical pipeline-to-child binding including finalization; verify parent preparation output is hidden from children yet every command/agent/archive path uses the selected worktree.
- [ ] 4.2 Extract only necessary neutral namespacing/input-projection/terminal-capture mechanics from the pipeline adapter; verify native nested composition preserves permissions, callbacks, sessions, deadlines and failure switches without a nested runner or subprocess stages.
- [ ] 4.3 Add opt-in hosted counter/initial-apply accounting with pre-dispatch persistence hooks; verify death after accounting cannot grant an extra initial apply or reset groom/implement/verify budgets, and terminal tenth-attempt evidence remains assessable.
- [ ] 4.4 Implement hosted pending-question delivery and active-pipeline re-entry at groom with fresh assessment; verify stale answers do not apply to new blockers and saved results/transcripts cannot skip verification or authorize edits.
- [ ] 4.5 Preserve standalone CLI inputs, fresh-budget restarts, no-Git/no-report boundaries and archived rejection; run existing constituent/pipeline integration tests and add documentation-contract coverage for opt-in hosted differences.

## 5. Issue intake, attempt persistence and planning

- [ ] 5.1 Add `flows/issue-to-pr/index.ts` and native preflight/acquire/snapshot/preparation nodes with guarded failure routing; verify inaccessible/cross-repository issues and setup failures dispatch no planner or writer.
- [ ] 5.2 Snapshot title/body/selected comments and trusted configuration, resolve the configurable base to a full SHA and persist workspace/branch identity; verify caller dirt and later issue edits are not silently adopted.
- [ ] 5.3 Create complete active OpenSpec artifacts through a flow-owned planning contract with scoped escalation for consequential gaps; verify fake-ACP scenarios never enter grooming with missing artifacts or implement invented product intent.
- [ ] 5.4 Compose the full OpenSpec pipeline natively with strict projected `{changeId}` input; verify stage order, same canonical workspace, independent acceptance policies and unsuccessful-stage blocking.
- [ ] 5.5 Implement revisioned attempt storage and recovery routing from reconciled domain state, with preserved budgets and explicit successor-attempt semantics; verify injected interruption before/after provisioning, planning and archive distinguishes active from confirmed archived targets.
- [ ] 5.6 Document issue input, trusted setup, captured-intent behavior and asynchronous continuation; verify the documented new/continue commands in CLI fixtures with useful machine-readable attempt/workspace/pending-question output.

## 6. Verified publication and archived-result acceptance

- [ ] 6.1 Add finalized-tree gates, complete change inventory and controller-only scoped commit checks; verify archived planning/main specs are included while unrelated files, secrets, unsafe hooks and agent-created publication effects are rejected.
- [ ] 6.2 Implement normal push and draft-PR creation/reconciliation with pre/post remote-head checks and durable effect receipts; verify lost-response/crash tests do not duplicate PRs, blindly replay commits or force-overwrite external work.
- [ ] 6.3 Add independent archived-result verification using the existing skill with explicit archive context and strict evidence acceptance; verify no unarchive/active-flow bypass occurs and CI repairs invalidate prior acceptance.
- [ ] 6.4 Cover finalization failure/partial-sync recovery with fresh verification after authorized edits and current-state reassessment; verify archive collisions and absent move confirmation never infer success.
- [ ] 6.5 Document publication authority, included artifacts, retained output and post-archive verification; verify model-free CLI scenarios distinguish local completion, draft publication and final acceptance.

## 7. Remote CI, movement and readiness

- [ ] 7.1 Reuse/adapt complete required-check/status and configured-gate evidence retrieval without the PR review-ledger acceptance predicate; verify pagination, missing/empty policy, inaccessible, pending, failed and stale-head cases.
- [ ] 7.2 Implement bounded CI waiting and issue-scoped failure assessment/repair with pre-dispatch cumulative accounting; verify pending evidence triggers no speculative edits, unrelated failures escalate and each repair gets fresh verification before normal push.
- [ ] 7.3 Implement bounded target movement detection/integration and fresh local/remote acceptance; verify moved-base fixtures invalidate evidence, successful non-force integration reruns applicable checks, and conflicts preserve work and escalate.
- [ ] 7.4 Detect unexpected remote PR-head edits and require explicit scoped human direction before adoption; verify no stale publication or force push occurs and continued external work is revalidated.
- [ ] 7.5 Implement deterministic current-head/base acceptance and draft-to-ready transition with post-transition recheck; verify only accepted revisions yield success, readiness failure is non-success and observed stale transitions return to draft when authorized.
- [ ] 7.6 Document finite CI/deadline/repair behavior and required CI support for drafts; verify exhausted, unknown and draft-skipped CI scenarios preserve pending blockers without a ready or green claim.

## 8. Cross-cutting concurrency, crash recovery and quality gates

- [ ] 8.1 Run two real simultaneous fixture-driven CLI invocations for distinct issues from one repository and shared state root; verify isolated writes/sessions/run bundles and unchanged caller HEAD/index/tracked/untracked content.
- [ ] 8.2 Exercise same-issue contention, linked checkouts/separate clones, retained-workspace reuse, uncertain lock recovery, SIGINT/SIGKILL and cleanup failure; verify ownership is not released while owned work runs and no abandoned output is automatically deleted.
- [ ] 8.3 Exercise end-to-end planning escalation, operator continuation, archived CI repair, base integration, external edits and uncertain PR publication; verify cumulative limits, evidence freshness, draft retention and one structured terminal result without fabricated child completion.
- [ ] 8.4 Run format → lint → typecheck → recursive tests and strict OpenSpec validation; if package/Nix wiring changes, also run `nix flake check`, and record results without authenticated live-service dependencies.

## Workflow follow-up

- Independently review the implementation against this change before archiving it.
- Archive this change only after implementation and verification are complete; do not confuse implementation of the flow's archival behavior with archival of this planning change.
