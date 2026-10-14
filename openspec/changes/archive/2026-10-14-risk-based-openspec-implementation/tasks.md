# Tasks

Groups are ordered by dependency: 2 depends on 1; 3 depends on 1 and 2; 4 integrates all three. Each group updates the skill and pseudocode together and delivers its own structural coverage and manual fixtures. These are implementation tasks, not actions authorized by proposing this change.

## 1. Dependency/risk scheduling and review acceptance

- [x] 1.1 Update `skills/orc-openspec-implement/SKILL.md` preparation/scheduling contracts, description, and execution guidance to separate sequential group/chunk workers from review boundaries; document exact task IDs, dependency/risk rationale, low-risk batching, unknown-risk isolation, and mandatory prerequisite release conditions. Verify skill/reference consistency and coverage against the delta's scheduling scenarios.
- [x] 1.2 Update `references/pseudocode.md` to implement preparation, reconciled review plans, sequential dispatch, focused repository-provided checks, independent semantic boundary review, and serialized verified-only bookkeeping. Verify a traced low-risk batch needs one boundary review while a high-risk prerequisite blocks its dependent until acceptance/bookkeeping.
- [x] 1.3 Add ownerless structural tests under `tests/gates/` for plan fields, independent review, check discovery, prerequisite gating, and pending task checkboxes; verify the new file runs through `npm test` discovery and existing skill packaging/reference tests still pass without implying runtime proof.
- [x] 1.4 Establish `tests/semantic/openspec-implement/` fixtures, local-only materialization/run procedure, and grading rubric for safe batching, unknown/high-risk prerequisite blocking, and green checks with a semantic defect; verify fixture materialization works and the suite stays outside gate discovery under ADR 0001.

## 2. Bounded workers, handoffs, and source-bound evidence

- [x] 2.1 Document invocation/preparation context policy, fresh workers per group, explicit task-ID chunks, reliable host telemetry and fallback behavior in the skill and pseudocode. Add structural coverage and no-telemetry/threshold semantic cases; verify cumulative billed tokens are never interpreted as occupancy and large assignments have finite checkpoints.
- [x] 2.2 Define concise local plan/handoff/finding/ledger record templates, configurable gitignored per-change storage, source binding including dirty/untracked/deleted source, commands/results, remaining work, and separate implementation/check/acceptance/bookkeeping statuses. Add structural and semantic coverage; verify unsafe storage pauses before writes and record templates contain every required field without publishing run evidence.
- [x] 2.3 Add cooperative handoff and writer/subprocess quiescence reconciliation to the skill and pseudocode, using only established host capabilities and pausing when proof is unavailable. Add safe and interrupted-writer fixtures and structural assertions; verify no replacement writer or bookkeeping writer can overlap an unreconciled writer.
- [x] 2.4 Specify evidence reconciliation and selective invalidation for changed source, shared contracts, dependencies, check configuration, and assumptions, including correction of affected previously bookkept tasks and blocked dependent release. Add unchanged-scope reuse and stale-evidence fixtures/tests; verify HEAD-only equality and stale task checkboxes cannot authorize completion.

## 3. Targeted repairs and fresh integrated completion

- [x] 3.1 Update skill/reference repair loops to use requirement/source-bound findings and fresh reviewer-controlled targeted verification, expanding for architecture changes, wider or uncertain impact, and invalidated evidence. Add bounded-versus-expanded semantic cases and structural coverage; verify genuine decisions and recurring no-progress findings still pause.
- [x] 3.2 Update final/all-done/resume control flow to require fresh repository-wide checks, integrated semantic review, current apply status, and repair-driven refresh of affected final evidence. Add final-defect and resumed-all-done fixtures/tests; verify intermediate acceptance never substitutes for fresh integrated completion.
- [x] 3.3 Reconcile reporting and authorization wording across the skill and pseudocode, documenting boundary coverage, evidence freshness, remaining tasks, checks, blockers, host limitations, and unchanged commit/push/sync/archive policies. Verify reference links resolve and fixtures cannot infer delivery authorization from accepted implementation evidence.

## 4. Integration assurance

- [x] 4.1 Run repository quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`) using the development environment as needed, and validate this change with `openspec validate risk-based-openspec-implementation`; verify required commands pass and no unrelated formatting changes or generated semantic evidence are included. Run `nix flake check` as well if implementation unexpectedly touches package manifests or Nix configuration.
- [x] 4.2 Run the manual semantic suite against the updated skill using its documented procedure, independently grade scheduling, repairs, invalidation, and writer-handoff outcomes, and repair any contract failures. Verify all required cases meet the rubric; retain raw outputs and summaries only locally and report limitations rather than claiming structural tests prove runtime behavior.
- [x] 4.3 Perform an integrated read-only review against the delta and issue #70 acceptance criteria, verify skill/pseudocode/test consistency, and confirm fresh apply status supports task completion without syncing specs, archiving, or changing delivery authorization.
