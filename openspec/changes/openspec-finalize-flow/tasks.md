# Tasks

## 1. Local scope and synchronization inputs

- [x] 1.1 Add finalize input/context/result contracts and reuse shared local-target preflight; verify unit tests reject missing/extra input fields, inactive/archived/store-backed targets, symlinks, and escaping roots without writes.
- [x] 1.2 Resolve the complete status-declared delta set and nested capability main-spec paths, validate existing ancestors, and capture in-memory pre-sync content/absence; verify fixtures cover new specs, nested capabilities, dirty baselines, and unsafe delta/main paths.
- [x] 1.3 Fetch and validate one specs-instruction snapshot before writes; verify command-seam tests cover command failure, malformed JSON, omitted rules, and no-delta/skip-specs paths with no lookup or writes.
- [x] 1.4 Add README scope/readiness and authorization documentation plus the AGENTS.md layout entry; verify documentation states that invocation asserts prior verification and neither requires saved evidence nor invokes verification/implementation gates.

## 2. Unattended semantic synchronization

- [x] 2.1 Implement the fresh Pi flow-owned sync prompt and structured worker output with selected-main-spec-only authority; verify prompt/dispatch tests forbid human prompts, implementation/planning repairs, permission bypass, and ordinary archive-skill invocation.
- [x] 2.2 Implement and fixture-test merge inputs/contracts for ADDED, partial MODIFIED, REMOVED, RENAMED, nested capabilities, explicit retirement metadata, Purpose handling, content rules, and already-applied effects; verify unaffected scenarios and main-spec format remain represented in the contracts.
- [x] 2.3 Add model-free worker fixtures covering success, ambiguity, malformed output, invocation errors, and partial edits; verify failures preserve edits, block archival, and do not dispatch repair or retry.
- [x] 2.4 Document semantic merge, no-delta behavior, tool-permission prerequisites, and fresh-session/prompt-level scope limitations in README; verify examples and tests do not imply OS isolation or alter ordinary generated sync/archive skill behavior.

## 3. Independent synchronization acceptance

- [x] 3.1 Add a fresh read-only sync assessor receiving all deltas, original main-spec baseline, current content, and applicable content rules without the worker transcript; verify session/prompt tests demonstrate independence and prohibit edits or implementation verification.
- [x] 3.2 Validate accepted/mismatch/inconclusive reports with exact per-capability coverage and preservation evidence; verify tests reject duplicates, omissions, extra capabilities, missing evidence, contradictory acceptance, malformed output, and unsupported worker-success claims.
- [x] 3.3 Add accepted-input fingerprints and refresh scope/selection before archive; verify delta edits, changed selections, main-spec edits, and no-delta-to-delta drift block archival without reassessment loops.
- [x] 3.4 Add README acceptance/failure semantics; verify documentation distinguishes synchronization assessment from implementation verification and identifies mismatch/inconclusive results as non-repairing failures.

## 4. Move-only archival and progress reporting

- [x] 4.1 Implement validated archive-root resolution, injected date naming, and non-following collision checks; verify tests cover date-prefix preservation, existing files/directories/dangling symlinks, and symlinked/escaping archive ancestors without overwrite or merge.
- [x] 4.2 Implement guarded whole-directory move and post-move confirmation without another sync; verify filesystem fixtures preserve `.openspec.yaml`, confirm source absence/destination presence, and accurately report pre-move failure or unconfirmed post-move state.
- [x] 4.3 Compose the acpx entrypoint and explicit sync/assessment/archive graph, including no-delta routing; verify model-free integration tests show stage ordering, no verification/repair/steering dispatch, and no archive before acceptance.
- [x] 4.4 Emit one terminal JSON result and stderr summary on normal routing with stage states, assessment, issues, and archive state; share an invocation-local at-most-once emission guard with cancellation listeners and verify success exits zero and command/agent/report/move failures exit nonzero with partial progress preserved.
- [x] 4.5 Implement best-effort flow-owned cancellation emission using supported active attempt abort signals in installed acpx, with listener installation, already-aborted checks, cleanup, and the shared emission guard; verify observable cancellation during commands/agents/moves and routing bypass after installation emits at most once, preserves edits, blocks later stages, and never claims unobserved completion. Add interruption regressions for callback gaps, node-start persistence, and routing bypass before installation that allow absent flow-owned JSON and identify acpx persisted run history/transcripts as fallback; document these limits and forced termination without claiming a public parent-run signal or whole-invocation coverage.
- [x] 4.6 Document the exact acpx invocation, no-prompt lifecycle, archive naming, partial-state recovery, collision policy, exclusive-operation expectation, and no automatic Git management; verify documentation-contract tests and examples agree with terminal results and restart behavior.

## 5. Stage-scoped pipeline composition

- [x] 5.1 Add `flows/openspec-all/` input/result contracts and canonical workspace preflight; verify tests reject unsupported input/targets before writes and retain the same change/workspace across all four stages.
- [x] 5.2 Implement a stage-scoping adapter over existing factory-created native graphs, namespacing nodes/edges and projecting every callback's outputs, results, step history, and node identifiers; verify model-free adapter tests cover callback evaluation, backward edges, failure summaries, and unchanged abort signals, timeouts, ACP profile, cwd, and isolated-session settings.
- [x] 5.3 Verify constituent budget isolation with repeated repair/revision fixtures and standalone/composed parity tests; demonstrate that implementation repairs never consume verification's budget and that existing acceptance and edit-authorization policies remain unchanged.
- [x] 5.4 Capture constituent terminal results through factory emit seams and adapt unsuccessful terminal routing into parent reporting; verify malformed/missing/contradictory results, unexpected throws, and every unsuccessful outcome block later stages without being converted into success.
- [x] 5.5 Compose the single native graph in groom → implement → verify → finalize order with success-only stage gates; verify real-runner model-free fixtures observe exact stage order, one invocation, fresh stage sessions, and finalization's independent sync check without duplicate implementation verification.
- [x] 5.6 Document pipeline invocation and composition boundaries in README and add the AGENTS.md layout entry; verify documentation-contract tests distinguish pipeline verification from standalone finalization's caller-asserted readiness and retain all standalone entrypoints.

## 6. Transparent escalation and aggregate results

- [x] 6.1 Preserve terminal steering and stage-labelled stderr progress while capturing only constituent terminal emitters; verify stage fixtures retain issues, recommendations, scoped questions, complete-answer rules, TTY requirements, and seven-day steering deadlines without extra transition confirmations.
- [x] 6.2 Add interactive and noninteractive escalation coverage using disposable fixtures; verify complete answers reach the originating stage, incomplete answers cannot authorize edits, and unavailable steering yields needs_human with all later stages unstarted.
- [x] 6.3 Emit one aggregate flow-owned result on normal routing with ordered stage statuses, retained child results, overall outcome, failed/active stage, and known archive state; share an invocation-local at-most-once guard with cancellation listeners and verify success exits zero only after all stages succeed and reported limit_reached/needs_human/cancelled/failed exit nonzero without duplicate constituent terminal output.
- [x] 6.4 Implement best-effort aggregate cancellation reporting through supported active attempt abort signals preserved in projected callback contexts, with listener installation, already-aborted checks, cleanup, and the shared aggregate emission guard; verify model-free interruptions during commands, agents, steering, and finalization, including routing bypass after installation, use only observed progress, emit at most once, preserve edits, and prevent later dispatch without fabricated child results or false completion. Test callback gaps, node-start persistence, and routing bypass before installation as uncovered intervals where flow-owned JSON may be absent; retain installed acpx and one native graph without a parent-run signal, runtime/dependency change, or whole-invocation guarantee.
- [x] 6.5 Document transparent escalation, aggregate output versus acpx's CLI envelope, bounded best-effort cancellation emission and possibly absent JSON with acpx persisted run history/transcripts as diagnostic fallback, forced-termination limits, preserved edits, full-pipeline restart from groom, standalone later-stage recovery, and no automatic Git management; verify examples and documentation-contract tests match those behaviors.

## 7. Cross-stage integration and quality gates

- [x] 7.1 Add end-to-end model-free fixtures for complete multi-capability finalization, no-delta archival, mismatch/inconclusive blocking, partial sync failure, archive failure after accepted sync, explicit rerun convergence, and already-archived rejection; verify recursive `npm test` discovers and passes them.
- [x] 7.2 Add full-pipeline fixtures for all-stage success, unsuccessful outcomes at each stage, transparent escalation, independent budgets, sync-check rejection after verification acceptance, dirty-tree preservation, restart from groom, and archived-target rejection; verify real acpx runner tests exercise scoped callbacks rather than only mocked orchestration.
- [x] 7.3 Verify existing implement/verify/groom and ordinary skill-contract tests still pass unchanged, and compare CONTEXT.md terminology against both new flows' docs to confirm finalization remains separate from implementation verification.
- [x] 7.4 Run format → lint → typecheck → test and record results; run `nix flake check` additionally if implementation changes package manifests or Nix configuration, verifying no unrelated working-tree edits are overwritten.
- [x] 7.5 Exercise both documented entrypoints on disposable local fixtures with configured permissions, including standalone blocked sync and a pipeline escalation/failure; verify stage order, visible steering, archive-after-accepted-sync, inspectable partial state, and that the real proposal change remains active.
