# Tasks

## 1. Dependency and check integration

- [x] 1.1 Add acpx as a development dependency and update the lockfile; verify installation resolves `acpx/flows` and inspect missing integrity entries for Nix compatibility.
- [x] 1.2 Include `flows/**/*.ts` in TypeScript checks and flow tests in npm/Nix test commands, refreshing `npmDepsHash`; verify TypeScript resolves the acpx declarations and the Nix dependency fetch succeeds.

## 2. Target resolution and structural validation

- [x] 2.1 Implement input validation, local active-change membership, schema-resolved artifact allowlists, and safe command arguments; add tests rejecting missing, archived, store-backed, and path-escaping targets without edits.
- [x] 2.2 Implement targeted strict JSON validation and distinguish invalid artifacts from operational command failures; add tests for valid, repairable, malformed-output, and missing-artifact cases.
- [x] 2.3 Document supported local targets, existing-artifact-only repairs, and validation behavior in README; verify examples match the command implementation.

## 3. Fresh semantic review and resolution assessment

- [x] 3.1 Implement Pi review with the existing prose skill contract and only change ID as reviewer input, plus a fresh decision node selecting `critical`, `clear`, or `inconclusive`; add tests covering all outcomes and Major-only completion.
- [x] 3.2 Implement current-cycle assessment with validated resolutions, escalation IDs, and missing-artifact detection; add tests for autonomous corrections, consequential decisions, mixed issues, and inconclusive assessment.
- [x] 3.3 Ensure every ACP/decision invocation gets a new Pi session, including repeated graph visits; verify adapter-level session IDs and absence of previous-cycle transcripts in all phase prompts.
- [x] 3.4 Document Critical-only completion and escalation criteria; verify the documentation does not equate grooming success with implementation readiness.

## 4. Steering and scoped updates

- [x] 4.1 Implement terminal steering for every escalated issue with recommendations, nonblank per-issue answers, seven-day timeout, cancellation signal, and readline cleanup; add fake-terminal tests for complete/incomplete answers, EOF, cancellation, timeout, and missing TTY.
- [ ] 4.2 Implement a standalone flow-owned updater prompt in `flows/groom.ts`, leaving the OpenSpec-generated `openspec-update-change` skill unchanged; verify current-cycle authorization covers only assessed structural/Critical repairs, complete steering, and existing planning scope, with no missing-artifact creation, unrelated edits, or tool permission overrides.
- [ ] 4.3 Send the direct updater prompt to a fresh Pi session without invoking or wrapping the built-in update skill; migrate fixtures and prompt/skill-expansion tests, retaining complete-steering gating and no prior-cycle leaks, and test rejection of invalid scope/authorization plus unchanged ordinary skill confirmations.
- [ ] 4.4 Update README prerequisites and discovery guidance for the review skill and direct updater prompt, removing project update-skill pinning and exemption claims; retain adapter setup, separate tool permissions, seven-day steering, and lack of resume support.

## 5. Flow graph, budget, and outcomes

- [x] 5.1 Compose `flows/openspec-groom.flow.ts` with deterministic routing and shared ten-update-attempt accounting; add graph tests covering structural-first repair, repeated Critical findings, mixed-budget exhaustion, and final verification success after attempt ten.
- [x] 5.2 Emit structured outcomes and concise summaries with nonzero exit behavior for all non-success terminal paths; add CLI-level tests for budget exhaustion, unavailable steering, cancellation, inconclusive review, and agent/operational failure without retries.
- [x] 5.3 Add fixtures verifying existing dirty artifacts are preserved, writes remain within the selected change's existing planning artifacts, and no Git automation or additional report files occur; verify tests inspect resulting filesystem changes.
- [x] 5.4 Add README invocation and result examples for success and non-success paths; verify the documented `acpx flow run` command loads the graph with a fixture change.

## 6. Integration verification

- [ ] 6.1 Rerun fake-agent end-to-end grooming with the direct updater prompt, including review, mixed escalation, update, and fresh-cycle convergence; verify transcripts persist through acpx, failure cases preserve edits, and final results match actual exit codes.
- [ ] 6.2 Rerun repository quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`) and `nix flake check` after migrating the updater prompt, tests, and documentation.
