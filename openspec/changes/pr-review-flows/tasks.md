# Tasks

## 1. PR contracts and execution boundary

- [ ] 1.1 Add PR-specific shared input, snapshot, finding, validation, decision, and result contracts under `flows/pr-shared/`; verify parser tests reject missing identity, invalid enums, contradictory evidence, and SHA mismatches.
- [ ] 1.2 Implement an injected argument-vector Git/GitHub command adapter with exit, cancellation, and deadline handling, separate from the OpenSpec command helper; verify command-fixture tests cover failure and injection-resistant argument construction.
- [ ] 1.3 Resolve canonical PR/base/head/head-ref identity and explicit publication authorities without an authorship restriction; verify preflight tests accept another author's accessible PR and reject missing push/comment authority before prohibited work.
- [ ] 1.4 Document prerequisite tools, availability of the existing `code-review` skill in the configured ACP agent, issue-tracker setup guidance, explicit requirements/no-spec inputs, caller-owned operation selection, publication authorities, and trust boundaries in README; verify documented inputs correspond to tested contracts, use no developer-specific skill path, and imply neither automatic setup nor worktree sandboxing.

## 2. Ownership and workspace lifecycle

- [ ] 2.1 Add a shared per-PR single-writer coordinator outside repository checkouts, injected for tests; verify concurrent entrypoints and separate checkouts on the supported host contend while different PRs do not, and terminal routes release ownership.
- [ ] 2.2 Add dedicated snapshot/repair worktree creation and safe lifecycle bookkeeping; verify temporary-repository tests leave dirty caller checkouts unchanged and return preserved workspace paths on failure.
- [ ] 2.3 Add remote-head refresh and stale-work abandonment/reprovisioning without rebase or force push; verify temporary-repository tests preserve abandoned repairs and restart against the new head.
- [ ] 2.4 Document single-host coordination limits, preserved-worktree recovery, and cleanup behavior; verify the examples distinguish active successful cleanup from retained failed/abandoned work.

## 3. Durable ledger

- [ ] 3.1 Implement the versioned ledger schema with Standards/Spec occurrence provenance and citations, package-owned comment markers, identity/ownership checks, pagination, and safe create/update operations; verify fixture tests preserve both axes for related root causes and reject malformed, duplicate, foreign, unsupported-version, and wrong-PR state without overwriting it.
- [ ] 3.2 Implement controller-assigned IDs and evidence-checked occurrence, matching, resolution, reopening, deferral, and scoped human-acceptance transitions; verify unit tests preserve recurring identities and reject unknown IDs, incomplete reconciliation, and repair-claim-only closure.
- [ ] 3.3 Persist review snapshots, human decisions, acceptance history, and reporting-independent state at phase boundaries; verify resume tests retain finding history while refusing stale acceptance and detect unexpected durable-state revisions.
- [ ] 3.4 Document ledger ownership, invalid-state recovery, and non-import of upstream Ptah comments; verify fixture examples round-trip through the strict ledger parser.

## 4. Shared review pass

- [ ] 4.1 Integrate the existing `code-review` skill through the configured ACP agent's supported skill mechanism, with flow-specific snapshot/reconciliation/output context rather than a replacement review policy; verify skill-availability/expansion tests fail actionably when unavailable and pass pinned comparison, diff/commits, PR intention, standards, requirements, and unresolved findings into independent parallel Standards/Spec contexts. Verify full-file inspection, repository-overrides-baseline behavior, tooling-check exclusion, labelled non-blocking smells, requirement conflicts, and introduced-defect scope.
- [ ] 4.2 Compose a fresh independent validator stage covering every raised issue from either review axis and proposed review-finding closure; verify model-free tests distinguish validated/refuted/inconclusive evidence and reject missing coverage, reviewer self-validation, or cross-axis reviewers acting as validators.
- [ ] 4.3 Implement controller-checked reconciliation proposals without agent authority over IDs or acceptance; verify tests retain uncertainty, refutation history, and evidence-backed reopening without losing unresolved blockers.
- [ ] 4.4 Implement full discovery using the pinned PR base, delta selection using the last reviewed head, unchanged-head/empty-delta reconciliation without a false clean skill verdict, and full fallback on base/ancestry changes; verify temporary-Git and agent-fixture tests reject invalid comparisons or mismatched HEAD and show every unresolved finding receives reconciliation in each applicable pass.
- [ ] 4.5 Document skill invocation, the shared review pass, axis provenance, and evidence/identity contracts alongside its modules; verify examples describe distinct review, validation, and disposition axes and never equate an agent claim with resolution.
- [ ] 4.6 Implement the skill's requirements-source discovery and clarification adapter, including issue-tracker setup guidance, supplied specs/PR criteria, unknown or inaccessible sources, and explicitly confirmed no-spec decisions; verify model-free tests skip Spec only for confirmed absence, preserve `no spec available` in reports, return headless `needs_human` for missing clarification, and prevent unconfirmed or stale absence from satisfying repair acceptance.

## 5. Reporter and advisory flow

- [ ] 5.1 Implement the upstream-derived reporter prompt with separate Standards/Spec labels and axis summaries/counts/worst issues, nonempty structured report parser, three fresh output attempts, and deterministic status prefix; verify tests cover blocker-first section ordering without cross-axis reranking, explicit skipped-axis/history omissions, complete finding inventories despite concise summaries, invalid output exhaustion, and inability to change acceptance.
- [ ] 5.2 Implement separate report-comment selection/publication after ledger persistence; verify fixture tests distinguish ledger/report identities and preserve durable state and computed outcome when reporting fails.
- [ ] 5.3 Add `flows/review/index.ts` and its factory/graph using shared review components only; verify model-free `FlowRunner` tests complete advisory reports with blockers and never dispatch repair, commit, or push operations.
- [ ] 5.4 Cover review CLI results, nonzero operational failures, cancellation, cleanup, and preserved-workspace diagnostics with integration tests; verify successful advisory findings do not imply PR acceptance.
- [ ] 5.5 Add README review invocation/results/report examples and upstream attribution; verify the entrypoint loads through the documented acpx command using the fake ACP profile.

## 6. CI evidence and controller acceptance

- [ ] 6.1 Resolve repository-required check policy and collect head-bound status/check evidence with pagination; verify fixtures cover legacy status contexts, check runs, missing access/policy, absent results, pending states, and superseded SHAs without vacuous acceptance.
- [ ] 6.2 Create/reconcile CI-sourced ledger findings and bounded CI waiting; verify tests route actual failures to assessment, close them only with corresponding current-head green checks, and do not dispatch speculative repairs for pending/unknown states.
- [ ] 6.3 Implement the deterministic repair-acceptance predicate and head rechecks before acceptance/report publication; verify table-driven tests cover unresolved blockers, waived risks, deferred blockers, uncertainty, CI failures, and stale review/check evidence.
- [ ] 6.4 Document CI-backed acceptance versus advisory review completion and merge approval; verify examples include unknown/pending CI and explain why local tests cannot replace the remote hard gate.

## 7. Scoped repair and human steering

- [ ] 7.1 Implement read-only repair assessment and root-cause batch scopes for validated blockers and CI failures; verify tests exclude suggestions/refuted/inconclusive issues and reject unsupported or escaping scopes.
- [ ] 7.2 Add consequential-decision detection, complete-answer steering, scoped persisted decisions, and headless needs-human termination using existing safe steering helpers; verify mixed batches make no edits until all required decisions are available.
- [ ] 7.3 Add explicit risk acceptance and deferral handling without CI waiver; verify tests remove only authorized review risks from blockers and invalidate decisions when their scope no longer applies.
- [ ] 7.4 Add a fresh scoped repair agent contract and controller verification of actual edits and configured trusted tests; verify fake-agent tests detect unauthorized changes and never treat repair prose as proof of resolution.
- [ ] 7.5 Implement controller commit/normal-push verification and resulting-head checks; verify temporary-Git tests cover successful publication, rejected pushes, remote movement, and absence of force-push/merge operations.
- [ ] 7.6 Document repair scopes, human decision/resume behavior, and publication failure recovery; verify examples retain caller control and do not suggest automatic dependency installation or policy rewriting.

## 8. Repair graph and lifecycle

- [ ] 8.1 Add `flows/review-fix/index.ts` and its graph composing the same internal review pass without calling the complete advisory flow or introducing a mode switch; verify graph tests distinguish entrypoint authorities and terminal outcomes.
- [ ] 8.2 Wire assessment, steering, repair, publication, CI, and re-review with a ten-dispatch budget and finite overall/phase/wait bounds; verify tests cover initial review at zero attempts, failed/abandoned attempt counting, tenth-attempt success, and no eleventh dispatch.
- [ ] 8.3 Route external head changes to fresh-worktree review without resetting budget; verify integration tests exercise movement during repair, publication, CI wait, and acceptance while preserving stale work.
- [ ] 8.4 Implement interruption/failure result emission, durable terminal reporting where possible, ownership release, success cleanup, and unsuccessful preservation; verify CLI integration tests cover SIGINT, timeout, needs-human, limit reached, and reporter failure after predicate acceptance.
- [ ] 8.5 Add README repair invocation and result examples, including mandatory push authority and ledger-based resume; verify the entrypoint loads with the documented acpx command and examples distinguish computed acceptance from overall reporting failure.

## 9. Cross-flow integration and quality gates

- [ ] 9.1 Run a model-free end-to-end scenario across advisory discovery, resumed repair, independent validation, current-head CI, persistent report updates, and another advisory invocation; verify stable IDs/history and shared-ledger ownership across both entrypoints.
- [ ] 9.2 Run repository quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`) and confirm recursive flow-test discovery includes the new suites; if package or Nix files change, also run `nix flake check` and refresh dependency hashes as required.
- [ ] 9.3 Validate the change with `openspec validate pr-review-flows --strict` and audit delivered tests against every delta scenario; verify no existing OpenSpec flow or permission capability changed unintentionally.
