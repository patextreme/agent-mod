# Tasks

## 1. Local scope and synchronization inputs

- [ ] 1.1 Add finalize input/context/result contracts and reuse shared local-target preflight; verify unit tests reject missing/extra input fields, inactive/archived/store-backed targets, symlinks, and escaping roots without writes.
- [ ] 1.2 Resolve the complete status-declared delta set and nested capability main-spec paths, validate existing ancestors, and capture in-memory pre-sync content/absence; verify fixtures cover new specs, nested capabilities, dirty baselines, and unsafe delta/main paths.
- [ ] 1.3 Fetch and validate one specs-instruction snapshot before writes; verify command-seam tests cover command failure, malformed JSON, omitted rules, and no-delta/skip-specs paths with no lookup or writes.
- [ ] 1.4 Add README scope/readiness and authorization documentation plus the AGENTS.md layout entry; verify documentation states that invocation asserts prior verification and neither requires saved evidence nor invokes verification/implementation gates.

## 2. Unattended semantic synchronization

- [ ] 2.1 Implement the fresh Pi flow-owned sync prompt and structured worker output with selected-main-spec-only authority; verify prompt/dispatch tests forbid human prompts, implementation/planning repairs, permission bypass, and ordinary archive-skill invocation.
- [ ] 2.2 Implement and fixture-test merge inputs/contracts for ADDED, partial MODIFIED, REMOVED, RENAMED, nested capabilities, explicit retirement metadata, Purpose handling, content rules, and already-applied effects; verify unaffected scenarios and main-spec format remain represented in the contracts.
- [ ] 2.3 Add model-free worker fixtures covering success, ambiguity, malformed output, invocation errors, and partial edits; verify failures preserve edits, block archival, and do not dispatch repair or retry.
- [ ] 2.4 Document semantic merge, no-delta behavior, tool-permission prerequisites, and fresh-session/prompt-level scope limitations in README; verify examples and tests do not imply OS isolation or alter ordinary generated sync/archive skill behavior.

## 3. Independent synchronization acceptance

- [ ] 3.1 Add a fresh read-only sync assessor receiving all deltas, original main-spec baseline, current content, and applicable content rules without the worker transcript; verify session/prompt tests demonstrate independence and prohibit edits or implementation verification.
- [ ] 3.2 Validate accepted/mismatch/inconclusive reports with exact per-capability coverage and preservation evidence; verify tests reject duplicates, omissions, extra capabilities, missing evidence, contradictory acceptance, malformed output, and unsupported worker-success claims.
- [ ] 3.3 Add accepted-input fingerprints and refresh scope/selection before archive; verify delta edits, changed selections, main-spec edits, and no-delta-to-delta drift block archival without reassessment loops.
- [ ] 3.4 Add README acceptance/failure semantics; verify documentation distinguishes synchronization assessment from implementation verification and identifies mismatch/inconclusive results as non-repairing failures.

## 4. Move-only archival and progress reporting

- [ ] 4.1 Implement validated archive-root resolution, injected date naming, and non-following collision checks; verify tests cover date-prefix preservation, existing files/directories/dangling symlinks, and symlinked/escaping archive ancestors without overwrite or merge.
- [ ] 4.2 Implement guarded whole-directory move and post-move confirmation without another sync; verify filesystem fixtures preserve `.openspec.yaml`, confirm source absence/destination presence, and accurately report pre-move failure or unconfirmed post-move state.
- [ ] 4.3 Compose the acpx entrypoint and explicit sync/assessment/archive graph, including no-delta routing; verify model-free integration tests show stage ordering, no verification/repair/steering dispatch, and no archive before acceptance.
- [ ] 4.4 Emit exactly one terminal JSON result and stderr summary with stage states, assessment, issues, and archive state; verify success exits zero and command/agent/report/move failures exit nonzero with partial progress preserved.
- [ ] 4.5 Handle orderly cancellation in each active phase, including graph-routing bypass; verify fixtures emit cancelled once without false stage completion and preserve edits, while documenting forced-termination limits.
- [ ] 4.6 Document the exact acpx invocation, no-prompt lifecycle, archive naming, partial-state recovery, collision policy, exclusive-operation expectation, and no automatic Git management; verify documentation-contract tests and examples agree with terminal results and restart behavior.

## 5. Cross-stage integration and quality gates

- [ ] 5.1 Add end-to-end model-free fixtures for complete multi-capability finalization, no-delta archival, mismatch/inconclusive blocking, partial sync failure, archive failure after accepted sync, explicit rerun convergence, and already-archived rejection; verify recursive `npm test` discovers and passes them.
- [ ] 5.2 Verify existing implement/verify/groom and ordinary skill-contract tests still pass unchanged, and compare CONTEXT.md terminology against the new flow docs to confirm finalization remains separate from verification.
- [ ] 5.3 Run format → lint → typecheck → test and record results; run `nix flake check` additionally if implementation changes package manifests or Nix configuration, verifying no unrelated working-tree edits are overwritten.
- [ ] 5.4 Exercise the documented command on a disposable local fixture with configured unattended permissions, including one blocked-sync case; verify accepted sync precedes archival, failure leaves inspectable partial state, and the real proposal change remains active.
