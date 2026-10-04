# Tasks

## 1. Prerequisite and target handling

- [x] 1.1 Confirm `openspec-implement-flow` has landed before implementing this change; verify per-flow entrypoints, reusable shared helpers, and recursive JS/Nix test discovery exist and migrated groom/implement tests pass. Do not duplicate its migration or edit its planning artifacts.
- [x] 1.2 Add verifier-owned module scaffolding and dependency-injectable local preflight/context helpers using actual landed shared interfaces; verify unit tests accept an explicit completed local target and reject omitted, archived, store-backed, symlinked, escaping, missing, unusable, and incomplete targets before agent dispatch.
- [x] 1.3 Document the new `flows/openspec-verify/` ownership and incomplete-entry boundary in repository guidance; verify paths agree with the landed layout and diagnostics point incomplete changes toward implementation.

## 2. Verification evidence and independent classification

- [x] 2.1 Implement the read-only verification prompt and validated supporting report envelope while preserving skill prose; verify unit tests cover all three severities, unique finding IDs, checked/skipped dimensions, applicable gates, explicit missing evidence, and malformed/truncated reports.
- [x] 2.2 Implement constrained accepted/blocking/inconclusive classification with deterministic acceptance consistency guards; verify tests reject warnings despite archive-ready prose, incomplete current tasks, missing required evidence, and inconclusive reports, while allowing conclusive suggestion-only reports and justified inapplicable checks.
- [x] 2.3 Refresh CLI task/artifact context before each verification cycle and supply target cwd/current context in fresh sessions; verify tests treat tasks reopened during repair as blocking completeness findings and do not require a previous implement-flow transcript.
- [x] 2.4 Add native Pi skill-expansion coverage and README adapter-wrapper instructions pinning the existing `openspec-verify-change` skill; verify expansion from another workspace with same-name collision handling preserves explicit change selection and the stricter read-only flow policy without duplicating or renaming the skill.

## 3. Resolution assessment, steering, and scoped repair

- [x] 3.1 Implement read-only assessment and validated resolution packets tied to current blocking findings; verify unit tests reject unrelated, empty, malformed, incomplete, and escaping-path packets and accept repository-scoped new code/test paths where appropriate.
- [x] 3.2 Reuse shared steering with all consequential issues answered before any mixed-batch repair, carrying scoped authorization across fresh sessions; verify tests cover ambiguous requirements, design changes, destructive actions, missing access, non-TTY needs_human, cancellation, deadline/error behavior, and no waiver of required evidence.
- [x] 3.3 Implement scoped repair prompts and report handoff without nesting the implement flow; verify prompt and fake-agent tests limit work to blocking findings, require applicable gates, preserve unrelated dirty edits, prohibit autonomous artifact rewriting/suggestion cleanup, and route every normal return back to fresh verification.
- [x] 3.4 Document assessment versus decision-node roles, human-input requirements, repair authority, and separate tool permissions in README; verify documentation matches tested escalation and read-only/scoped-policy behavior without claiming OS isolation.

## 4. Graph convergence and observable terminal behavior

- [x] 4.1 Compose the runnable entrypoint and guarded graph with at most ten counted repair dispatches; verify unit/graph tests prove initial verification is free, failed dispatches count, repair ten is freshly verified, final acceptance succeeds, persistent findings hit limit_reached, and no eleventh repair or exhausted-budget steering occurs.
- [x] 4.2 Implement structured outcome emission and nonzero unsuccessful exits; verify tests cover success, limit_reached, needs_human, cancelled, failed, invalid decisions, invocation failures, timeouts, and diagnostics without automatic phase retries.
- [x] 4.3 Add real acpx runner integration cases using shared fake-agent infrastructure; verify distinct ACP session identities, persisted prompts/transcripts, mechanical and mixed-batch repairs, carried steering across cycles, fresh context/evidence after repairs, filesystem preservation, and actual CLI exit codes.
- [x] 4.4 Document the runnable invocation, budget, outcomes, suggestions-only acceptance, evidence requirements, and absence of sync/archive/commit/stash/rollback; verify integration tests keep the change active and perform none of those lifecycle actions.

## 5. Cross-flow integration gates

- [x] 5.1 Confirm existing recursive JS/Nix discovery includes all new verifier tests and existing groom/implement suites; adjust configuration only if necessary and verify no earlier coverage disappears.
- [x] 5.2 Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm test`; also run `nix flake check` if package manifests or Nix configuration changed, and verify all applicable gates pass.
