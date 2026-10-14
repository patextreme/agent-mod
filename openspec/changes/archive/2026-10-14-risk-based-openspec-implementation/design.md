# Design

## Context

See `proposal.md` for motivation and the `openspec-skill-orchestration` delta for behavior. The implementation skill currently dispatches whole groups through host-provided agents/workflows, reviews each group, and bookkeeps before proceeding. This package distributes instructions, not an execution runtime. Neither reliable worker context telemetry nor safe worker/subprocess termination can be assumed from the existing contract.

The main spec's `Sequential whole-group implementation` requirement changes; its existing name is retained for delta compatibility, but groups no longer imply review boundaries. The standalone grooming and verification skills are unchanged. Existing external implementation-skill resolution, action-context constraints, host orchestration opt-in rules, and delivery authorization remain prerequisites.

## Goals / Non-Goals

**Goals:** Make worker dispatch, prerequisite release, review scope, and evidence acceptance independently explicit; provide usable host-neutral fallbacks and resumable local records.

**Non-Goals:** Add a runtime, promise unavailable instrumentation or termination, automatically parallelize writers, weaken independent review, alter standalone verification acceptance, or publish live-model evidence. Configurable values are invocation/preparation policy recorded in the plan, not a new package configuration API.

## Decisions

### 1. Schedule dependency/risk boundaries separately from workers

Preparation returns a review plan containing selected repository/worktree/change/store, current tasks and requirement mapping, dependency edges, risk classifications/rationale, ordered groups and task-ID chunks, boundary membership, prerequisite release conditions, and focused/final check commands. A group defaults to its own boundary unless safe batching is affirmatively justified.

High-risk includes security/authorization, durable custody/storage, mutation admission/idempotency, recovery/reconciliation, and other consequential cross-component invariants. Unknown risk gets a separate boundary. Lower-risk groups can share a boundary only when none consumes an unverified prerequisite contract. Mere file independence or presentation labels do not establish safety. Reconcile newly discovered dependencies before continuing; freeze affected dependents until prerequisite acceptance and bookkeeping.

Implementation remains sequential. Default to a fresh worker per group; large groups may be divided into explicit task-ID chunks. A worker boundary need not cause review, but cannot bypass a required prerequisite boundary. Bookkeeping is a separate serialized writer after the applicable review passes. Read-only investigation may remain concurrent where independent. Alternatives rejected: batching every heading automatically, mandatory review after every writer, or deferring all review until the end.

### 2. Discover executable checks once and keep semantic review independent

Preparation reads repository instructions and executable configuration to record exact focused and required final commands, working directories, scope, and relevant environment assumptions. Workers run focused checks and report command, result/exit status, covered scope, and inspected source binding; missing or blocked required checks are not passes.

Fresh read-only reviewers inspect actual source and requirements, cross-component invariants, failure/cancellation/restart/concurrency behavior where relevant, prerequisite regressions, and whether the tests reach production paths. They can require additional checks or reproductions. Reuse applies only to valid scoped evidence; test success cannot authorize semantic acceptance. Alternative rejected: running every suite in every reviewer or accepting check results as semantic proof.

### 3. Target repair review, but let the independent reviewer widen it

A finding record has a stable ID, violated requirement/task, file/line and source binding, reproduction/failing regression (or an explicit limitation), expected behavior, affected contract/dependents, and regression scope. Repair briefs carry this record, accepted unaffected evidence, and current source state.

A fresh repair reviewer inspects the actual repair, reproduction, regression, and affected contracts; it explicitly states why targeted coverage is sufficient. Broaden to the affected boundary and dependent contracts for architecture changes, widened scope, changed shared assumptions, invalidated prior evidence, or uncertain impact. Bounded repairs do not force rediscovery of unaffected work. Genuine consequential decisions pause; recurring findings without edits or new evidence pause rather than retrying unchanged briefs. Alternative rejected: trusting the repair worker's scope assessment or forcing whole-group review after every small fix.

### 4. Rotate cooperatively, with capability-aware budgeting

Preparation records a context policy: default fresh worker per group, explicit task-ID chunks for unusually large groups, and optional host-supported context-occupancy signal and configured handoff threshold. There is no universal token threshold. A reliable signal's units and interpretation must be documented; cumulative billed input tokens are not occupancy. Without telemetry, finite assignments and planned checkpoints are the fallback, not a claim of automatic token detection. If preparation cannot form a safe assignment within the available host limits, pause to resolve it.

At safe boundaries, workers persist progress, return a concise handoff, and finish. Handoffs include assigned/completed/remaining IDs, requirement coverage, changed files, exact commands/results, source fingerprint, findings/reproductions/blockers, prerequisite assumptions, and known subprocess state. Unfinished work stays unfinished. Replacement waits for confirmed worker exit plus reconciliation that no remaining subprocess can mutate source. A returned summary alone does not establish subprocess quiescence. Use only capabilities established by the invoking host; if termination or process state cannot be confirmed, pause. Never start a competing writer or invent a stop API. Alternative rejected: forced interruption at a guessed threshold or continuing indefinitely in one worker.

### 5. Persist local evidence and reconcile fingerprints, not summaries

Preparation chooses a configurable repository-local per-change directory, default `.openspec-orchestration/<change>/`, within the allowed action context. Confirm ignore status using repository tooling before any writes; do not silently edit ignore policy or force-add records. If the default is unsafe, request an already ignored location or pause. The plan, handoffs, findings, and acceptance ledger use that location and remain outside planning artifacts and commits. Revalidate storage on resume. Durability means surviving agent rotation within the worktree; lost records require fresh reconstruction, not inferred acceptance.

Record formats can be concise Markdown tables/records, but must expose:

- Identity and exact task/requirement/contract scope.
- Source binding: base revision plus deterministic content fingerprints for relevant tracked files, dirty/staged state, untracked source, and deletions; relevant shared contracts, dependencies, check configuration, and environment assumptions.
- Exact commands, results, scope, and evidence limitations.
- Separate `implementation`, `checks`, `semantic acceptance`, and `bookkeeping` statuses, including invalidation reasons and affected dependents.

A whole-tree fingerprint helps reconciliation but must not automatically invalidate unaffected scoped evidence. Compare actual relevant contents and assumptions, not just HEAD, timestamps, line numbers, or a worker's list of edited files. Capture source before and after checks/review; changes during evidence production require reconciliation before acceptance. An unknown impact invalidates the affected boundary. Ignore local ledger churn and known checkbox-only bookkeeping for source acceptance, but task meaning/requirement edits invalidate relevant mappings.

On resume, reconcile source, task state, prerequisite release, and process state. Invalidate affected check/review evidence when source, shared contracts, dependencies, relevant configuration, or environment assumptions change. Previously bookkept tasks with invalidated acceptance no longer authorize release or completion: serialize correction of affected checkboxes/statuses, preserve unrelated completed tasks, and re-review before reaccepting. A repair does not discard demonstrably unaffected evidence. Alternative rejected: HEAD-only binding, blanket invalidation after any edit, or using checked boxes as proof of current acceptance.

### 6. Retain fresh final acceptance and proportionate assurance

After all applicable boundaries pass and tasks are bookkept, freshly execute required repository-wide checks, perform independent integrated semantic review, and read current OpenSpec apply status. This also applies to a resumed all-done state. Technical findings go through scoped repair/review; rerun final evidence affected by the repair and refresh status. A pre-repair integrated result cannot authorize a changed contract. Completion requires no unresolved blocking findings or required checks and no stale prerequisite acceptance.

Add ownerless structural tests under `tests/gates/` for the skill/reference contract and portable reference/packaging invariants; these test document structure and guardrails, not runtime behavior. Add a manual semantic suite under `tests/semantic/openspec-implement/` with fixture inputs, a materialization procedure, and a grading rubric. Cover safe low-risk batching, blocked high-risk dependencies, green checks with a semantic defect, targeted and expanded repairs, no-telemetry chunking, stale dirty/shared/check-config evidence, and safe versus uncertain interrupted-writer continuation. Raw outputs and summaries stay local under ADR 0001; semantic runs never become CI gates. Alternative rejected: claiming regex assertions establish operational safety or adding a new runtime to obtain deterministic workflow tests.

## Risks / Trade-offs

- Risk classification can be optimistic → require explicit rationale, unknown-risk isolation, and reviewer reconciliation of newly discovered contracts.
- Host capabilities vary → record capability evidence; finite assignments provide a fallback, while uncertain process quiescence pauses.
- Scoped fingerprints can omit relevant assumptions → include prerequisite contracts and configuration; widen invalidation when impact is uncertain.
- Local records can be missing, sensitive, or unexpectedly tracked → verify ignore status, avoid credentials/raw personal data, and reconstruct missing acceptance from fresh inspection.
- Prose tests cannot establish orchestration behavior → distinguish structural gates from manual semantic exercises and report limitations.
- Fresh workers still reload context → brief them with concise reconciled records rather than full history; optimize review boundaries without compromising writer exclusion.

## Migration Plan

Update the skill and pseudocode together, including description/execution text that currently promises per-group verification. No active ledger migration is needed because this introduces the record policy. Existing runs resume only after fresh preparation establishes the new plan and reconciles actual source; unbound legacy summaries do not establish reusable acceptance. Preserve current store/action-context and authorization behavior. Rollback restores the previous skill/reference revision and conservative per-group review; new local records remain ignored and are not proof under the old procedure.
