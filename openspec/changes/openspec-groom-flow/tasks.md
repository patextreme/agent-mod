# Tasks

## 1. Dependency and check integration

- [ ] 1.1 Add acpx as a development dependency and update the lockfile; verify installation resolves `acpx/flows` and inspect missing integrity entries for Nix compatibility.
- [ ] 1.2 Include `flows/**/*.ts` in TypeScript checks and flow tests in npm/Nix test commands, refreshing `npmDepsHash`; verify TypeScript resolves the acpx declarations and the Nix dependency fetch succeeds.

## 2. Target resolution and structural validation

- [ ] 2.1 Implement input validation, local active-change membership, schema-resolved artifact allowlists, and safe command arguments; add tests rejecting missing, archived, store-backed, and path-escaping targets without edits.
- [ ] 2.2 Implement targeted strict JSON validation and distinguish invalid artifacts from operational command failures; add tests for valid, repairable, malformed-output, and missing-artifact cases.
- [ ] 2.3 Document supported local targets, existing-artifact-only repairs, and validation behavior in README; verify examples match the command implementation.

## 3. Fresh semantic review and resolution assessment

- [ ] 3.1 Implement Pi review with the existing prose skill contract and only change ID as reviewer input, plus a fresh decision node selecting `critical`, `clear`, or `inconclusive`; add tests covering all outcomes and Major-only completion.
- [ ] 3.2 Implement current-cycle assessment with validated resolutions, escalation IDs, and missing-artifact detection; add tests for autonomous corrections, consequential decisions, mixed issues, and inconclusive assessment.
- [ ] 3.3 Ensure every ACP/decision invocation gets a new Pi session, including repeated graph visits; verify adapter-level session IDs and absence of previous-cycle transcripts in all phase prompts.
- [ ] 3.4 Document Critical-only completion and escalation criteria; verify the documentation does not equate grooming success with implementation readiness.

## 4. Steering and scoped updates

- [ ] 4.1 Implement terminal steering for every escalated issue with recommendations, nonblank per-issue answers, seven-day timeout, cancellation signal, and readline cleanup; add fake-terminal tests for complete/incomplete answers, EOF, cancellation, timeout, and missing TTY.
- [ ] 4.2 Revise `.pi/skills/openspec-update-change/SKILL.md` with explicit current-cycle grooming authorization that preserves ordinary confirmations; verify the policy covers structural and Critical repairs but not missing-artifact creation, unrelated edits, or tool permission overrides.
- [ ] 4.3 Invoke the updated skill in a fresh Pi session with assessed fixes, complete steering, and resolved scope, applying the cycle in one coordinated update; add tests proving no updater dispatch before escalation is complete and no prior-cycle steering leaks.
- [ ] 4.4 Document skill discovery, adapter prerequisites, separate tool permissions, seven-day steering, and lack of resume support; verify the project update skill is discoverable through the documented invocation.

## 5. Flow graph, budget, and outcomes

- [ ] 5.1 Compose `flows/openspec-groom.flow.ts` with deterministic routing and shared ten-update-attempt accounting; add graph tests covering structural-first repair, repeated Critical findings, mixed-budget exhaustion, and final verification success after attempt ten.
- [ ] 5.2 Emit structured outcomes and concise summaries with nonzero exit behavior for all non-success terminal paths; add CLI-level tests for budget exhaustion, unavailable steering, cancellation, inconclusive review, and agent/operational failure without retries.
- [ ] 5.3 Add fixtures verifying existing dirty artifacts are preserved, writes remain within the selected change's existing planning artifacts, and no Git automation or additional report files occur; verify tests inspect resulting filesystem changes.
- [ ] 5.4 Add README invocation and result examples for success and non-success paths; verify the documented `acpx flow run` command loads the graph with a fixture change.

## 6. Integration verification

- [ ] 6.1 Run a fake-agent end-to-end grooming scenario including review, escalation, update, and fresh-cycle convergence; verify transcripts persist through acpx and the final result matches the actual exit code.
- [ ] 6.2 Run repository quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`) and `nix flake check`; verify all pass after dependency/hash and test-wiring changes.
