# Design

## Context

See `proposal.md` for motivation. Existing flow entrypoints use acpx with fresh Pi sessions, injected command/emission seams, recursive colocated test discovery, and structured terminal results. `flows/shared/local-target.ts` resolves active local changes without requiring planning-artifact completion; that matches this flow's caller-asserted readiness contract.

The ordinary sync skill implements semantic merging and idempotent updates, but asks for clarification when intent is unclear. The ordinary archive skill performs interactive completion warnings and sync choices, can sync inline, and finally moves the change directory. Invoking it unchanged would violate the unattended, explicit-stage contract. Overriding those prompts through a wrapper would obscure authorization. Neither generated skill will be changed.

## Goals / Non-Goals

**Goals:**
- Separate the write-capable sync worker, fresh read-only sync assessor, and flow-owned archive operation.
- Base acceptance on complete per-capability evidence and original main-spec content, not the sync worker's summary.
- Make partial progress observable and restartable from the current working tree.
- Compose existing grooming, implementation, verification, and finalization graphs under one invocation without changing their acceptance policies, isolated sessions, separate budgets, or escalation behavior.

**Non-Goals:**
- Within finalization: invoke implementation verification, require verification history, reassess implementation/task completion, collect human steering, or perform automatic repairs/retries.
- Within `openspec-all`: invent a new acceptance policy, share repair budgets across stages, hide human escalation, or automatically retry an unsuccessful stage.
- Store support, Git checkpoints, transactional rollback, or persistent resume.
- Change ordinary sync/archive skill behavior or bypass tool permission policy.

## Decisions

### 1. Dedicated graph and explicit caller authorization

Add `flows/openspec-finalize/{index,flow,helpers}.ts` and colocated tests. Use the existing acpx/Pi flow patterns with stages:

`preflight → prepare sync → sync → assess sync → archive → terminal result`

No-delta changes explicitly mark sync and assessment not applicable and route to archive. Reject unknown input fields and unsupported targets using shared local-target preflight. The only input is `changeId`; no prompt selects a target. Invocation authorizes synchronization and archival, not arbitrary edits. No implementation verifier, gate runner, saved verification record, or task-completion judge is included. Fail closed on ambiguity instead of prompting. Adapter/Pi tool permissions must already permit unattended execution; authorization is not permission bypass.

Alternative for standalone finalization: compose `createVerifyFlow()` before archive. Rejected because readiness is a caller assertion and finalization must not verify or repair implementation. The separate `openspec-all` entrypoint does compose verification before finalization, as described below.

### 2. Flow-owned sync policy, not confirmation overrides

Use a dedicated fresh Pi sync session with a flow-owned prompt implementing the existing skill's semantic merge rules. Do not invoke the ordinary archive skill, nor invoke a skill and append instructions that suppress its required human interaction. Keep generated skills unchanged and include regression checks for their ordinary contracts.

Preflight resolves and validates planning-home paths. Select all and only `artifactPaths.specs.existingOutputPaths`; derive capability paths relative to the selected change's specs root, including nested capabilities, and resolve their main-spec paths under the validated local specs root. Reject symlinked/escaping delta and destination paths, including existing ancestor directories. Missing destination files for new capabilities are allowed only beneath validated ancestors.

If no deltas are resolved, do not request specs instructions or write main specs. Otherwise obtain one current valid `openspec instructions specs --change <id> --json` snapshot before any write. Omitted rules mean no configured rules; failed/invalid lookup is fatal. Supply artifact rules as spec-content constraints only. Capture the delta contents and selected main specs' original contents or absence in memory before dispatch, so preservation can be checked against the actual starting tree, including dirty edits.

The worker can edit only selected main specs. It applies additions, partial modifications, removals, and renames while preserving unaffected scenarios and existing Purpose text. New specs copy delta Purpose or report a TBD placeholder. Already-applied effects are no-ops, including already-removed and already-renamed requirements. Ambiguity is a structured failure, never a request for input or authorization to repair artifacts. Existing explicit capability-retirement metadata must be considered when determining the intended main-spec outcome; never infer permission to retire a capability solely from an empty result.

Alternative: use `openspec archive` to perform sync and archive together. Rejected because the stages must remain distinct and semantic merging must preserve unaffected content.

### 3. Fresh independent sync assessment with deterministic coverage guards

After a normally returned successful sync worker, dispatch a separate fresh read-only Pi assessor. Give it the authoritative delta set, specs-rule snapshot, pre-sync main-spec baseline, and current files. Do not pass the worker transcript or use its summary as evidence of correctness. The assessor reports a structured `accepted`, `mismatch`, or `inconclusive` verdict, per-capability coverage, intended effects, preservation evidence, and discrepancies. Each selected capability must have explicit assessment covering its operations and applicable content rules.

Validate the report shape and exact capability coverage deterministically; reject duplicates, missing/extra entries, empty required evidence, or contradictory acceptance. Semantic evidence must establish ADDED content present, MODIFIED intent incorporated without unrelated loss, REMOVED content absent, RENAMED content under the new name only, and correct Purpose/main-spec structure. No repair or reassessment loop follows rejection. Independently assess already-synced reruns as well.

Retain a content fingerprint of the accepted delta/main-spec inputs. Before archive, refresh local scope and the selected delta set and verify those fingerprints still match. Changed inputs invalidate acceptance and stop, rather than triggering silent retries. This is best-effort drift detection, not a concurrent-writer transaction: callers must avoid concurrent modifications during finalization.

Alternative: trust the sync worker or run structural validation alone. Rejected because neither demonstrates complete semantic synchronization or preservation.

### 4. Flow-owned move-only archival

Use validated filesystem operations after accepted sync (or no-delta status). Resolve the archive root from `planningHome.changesDir`, check its containment and symlink safety, and create it if necessary. Compute `YYYY-MM-DD-<changeId>` using the current date, preserving an existing date prefix; inject the date source for deterministic tests.

Check the destination with non-following filesystem inspection; any existing entry, including a dangling symlink, is a collision. Never overwrite, merge, choose another name automatically, or treat a collision as proof of previous success. Keep the move operation isolated and guarded; serialize this flow's own operation and document that external concurrent writers are unsupported. Do not invoke a command that might synchronize specs again. Move the whole change directory, preserving `.openspec.yaml` and all artifacts, then confirm source absence and destination presence before reporting archived success.

Archive guidance lookup, if reused from the ordinary lifecycle, is advisory only and cannot widen paths, add interaction, or alter the stage contract. No unconditional artifact/task warning prompt is inherited: the caller asserted prior verification. A completed filesystem move followed by failed confirmation must be reported as unconfirmed, not falsely described as a still-active change.

Alternative: invoke the ordinary archive skill after sync. Rejected because it re-assesses sync and asks for choices, obscuring the explicit archive-only stage.

### 5. Results describe observed progress, not transactional success

Emit one JSON terminal result on stdout and a concise stderr summary, following existing flow conventions. Include `changeId`, `outcome` (`success`, `failed`, or `cancelled`), `summary`, current/failed phase, sync-stage completion, assessment verdict/coverage, remaining issues, and archive destination/state when known. Distinguish `not_started`, `completed`, `failed`, and `not_applicable` stage states; an interrupted write/move must not be marked completed without observation. Only success exits zero.

Observe orderly cancellation on active abort signals and ensure terminal emission occurs once even if graph routing is bypassed. Forced termination can prevent output; retain acpx transcripts/run history without creating separate report files. No automatic agent/command retries. Git remains the user's checkpoint: do not commit, stash, reset, or roll back. On failure after sync, keep main-spec edits; on archive failure before a move, the active change remains. Explicit reruns resolve the current active tree afresh, not a previous report. Already-archived targets are rejected.

### 6. One native graph with stage-scoped composition

Add `flows/openspec-all/{index,flow,helpers}.ts` and colocated tests. Its only input is the same explicit local `changeId`. Resolve one canonical workspace identity, then compose the existing factory-created graphs in this order:

`groom → implement → verify → finalize`

The installed acpx 0.19.4 factories return graph definitions, not callable stages; there is no native subflow node. Naive graph concatenation is unsafe because callbacks reference literal stage-local output and step names, including repair counters. Use a tested stage-scoping adapter over the native graph definitions rather than running nested `FlowRunner` instances.

Namespace each stage's node IDs and edges. Wrap every context-dependent node/edge callback with a projected stage-local view of outputs, results, step history, and node identifiers. Preserve the real input, run identity, active abort signal, per-node timeouts, ACP profile/session configuration, and resolved cwd. Stage history must exclude other stages so groom's revision budget, implement's repair budget, and verify's repair budget remain independent. The adapter must account for every supported callback/context surface; tests must demonstrate parity with standalone stage behavior before composition is accepted.

Inject each factory's existing `emit` seam to capture its structured terminal result instead of printing constituent terminal JSON. Add a stage-boundary gate that advances only on a validated captured `success` for the same change/workspace; a missing, malformed, contradictory, or unsuccessful result terminates the parent. Adapt terminal unsuccessful throw nodes into parent result routing without treating the underlying failure as success. Unexpected exceptions remain failures. Keep stage terminal result capture idempotent and preserve standalone factories' default emission/exit behavior.

This is composition, not reimplementation: retain constituent nodes, stage policies, scoped authorization, command behavior, and fresh-session rules. Any necessary shared adapter extraction must preserve existing standalone contracts. Finalization runs once after accepted verification and retains its own independent synchronization assessment; it never re-verifies implementation.

Alternatives rejected:
- Nested runners inside a parent action: the installed public runner API has no parent-signal cancellation bridge, and enclosing action timeouts can interrupt long-running child work or steering incorrectly.
- Spawn/pipeline constituent CLI commands with captured streams: risks losing TTY steering and obscuring stage outcomes; shell chaining is not the reusable native composition contract.
- Copy each flow's decisions into `openspec-all`: creates divergent policy and repair behavior.

### 7. Transparent escalation and aggregate lifecycle reporting

Capture only constituent terminal emitters; do not intercept the entire stderr stream or replace steering with a noninteractive transport. Existing grooming, implementation, and verification steering must show the stage, issues, recommendations, and scoped questions on the invocation terminal. Answers flow directly into that stage's existing steering logic. Preserve its TTY requirements, seven-day steering allowance, complete-answer authorization, and cancellation semantics. There are no additional stage-transition confirmations; finalization remains unattended.

If an escalation cannot collect valid input, propagate `needs_human`, `cancelled`, or `failed` as appropriate and never start later stages. Budget exhaustion propagates `limit_reached`. Internal repairs remain available only under each stage's existing policy. Stage status messages on stderr identify where the pipeline is running or paused.

Emit one aggregate flow-owned terminal result containing `changeId`, overall `outcome`, active/failed stage, ordered stage statuses, captured constituent results, and finalization/archive details when available. Later stages are explicitly `not_started` after an unsuccessful stage. Only completion of all four stages is overall success and exits zero. acpx may additionally emit its own CLI run envelope; the flow-owned result guarantee does not suppress that runtime output.

Observe the active parent-run abort signal throughout the composed graph, including in stages that do not guarantee their own terminal emission when acpx bypasses graph routing. Emit the aggregate cancelled result exactly once using observed progress, without inventing a missing child result or starting another stage. Preserve all edits and archive observations. Forced termination may prevent emission.

An explicit `openspec-all` restart begins again at groom against the current active tree with fresh stage-local budgets; it does not skip stages based on an earlier report. Users can invoke standalone flows when they intentionally want to restart later in the lifecycle. Already-archived changes remain invalid targets. Neither entrypoint manages Git state.

## Risks / Trade-offs

- [Caller may finalize an unverified change] → Document invocation as a readiness assertion; do not mislabel success as implementation verification.
- [Semantic assessment is model-based] → Fresh session, authoritative inputs, pre-sync baseline, per-capability evidence, and deterministic coverage checks; no claim of formal proof.
- [Prompt scope is not OS isolation] → Document permission/isolation responsibilities and test authorization boundaries without claiming filesystem sandboxing.
- [Partial writes or archive failure leave a dirty tree] → Preserve work, report observed progress, support idempotent explicit reruns; user-controlled Git recovery only.
- [Concurrent edits can stale evidence or race collision checks] → Recheck scope, selection, fingerprints, and destination immediately before moving; document exclusive-operation expectation rather than promise atomic multi-file finalization.
- [Flow-owned sync semantics may diverge from generated skills] → Cover additions, partial modifications, removals, renames, Purpose, rules, and reruns with fixtures; leave ordinary skill behavior intact.
- [Graph scoping may corrupt output references or budgets] → Test callback projection, edge routing, repeated repair history, failure results, and standalone/composed parity using real acpx model-free fixtures.
- [Composition may conceal escalation or cancellation] → Preserve real terminal steering, per-node deadlines and abort signals; test TTY and non-TTY paths and aggregate emission when normal graph routing is bypassed.

## Migration Plan

1. Add finalization and its tests, then the stage-scoping adapter and `openspec-all` graph with composition tests, without modifying existing flow acceptance/repair policies or generated skills.
2. Document both entrypoints, prerequisites, local scope, finalization's no-prompt authorization, transparent earlier-stage escalation, sync assessment, aggregate/partial outcomes, and explicit restart semantics in README; add repository-layout entries and retain the glossary distinctions in `CONTEXT.md`.
3. Run format, lint, typecheck, and recursive tests. If implementation touches package manifests or Nix configuration, also run `nix flake check`.
4. Exercise disposable local changes covering standalone sync/check/archive, composed stage order, human escalation, and an unsuccessful stage that prevents later dispatch; do not finalize this proposal as part of implementation testing.
5. Rollback of the feature is removal of the new entrypoints/docs and unused composition helpers; rollback of runtime edits remains an explicit user-controlled Git operation, never a flow action.
