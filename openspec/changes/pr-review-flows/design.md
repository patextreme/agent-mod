# Design

## Context

See `proposal.md` for motivation and the two delta specs for behavioral contracts. Existing flows use `acpx/flows` with tiny entrypoints, factory-composed graphs, injected commands/steering/results, fresh ACP sessions, and colocated tests. `openspec-verify` supplies useful scoped assessment, human steering, bounded repair, and interruption patterns, but its target, task, evidence, and edit-authorization contracts are OpenSpec-specific. `flows/shared/command.ts` invokes OpenSpec and is not a generic Git/GitHub execution boundary.

The reference implementation is `patextreme/ptah-libs` at commit `0cd1accee7d19a18f364b416eec7dd3bdf70def0`:

- [PR playbook](https://github.com/patextreme/ptah-libs/blob/0cd1accee7d19a18f364b416eec7dd3bdf70def0/playbooks/pr/playbook.luau)
- [Protocol](https://github.com/patextreme/ptah-libs/blob/0cd1accee7d19a18f364b416eec7dd3bdf70def0/playbooks/pr/protocol.luau)
- [README](https://github.com/patextreme/ptah-libs/blob/0cd1accee7d19a18f364b416eec7dd3bdf70def0/playbooks/pr/README.md)

Upstream uses Ptah's ACP runtime, not acpx. Its durable ledger, discovery/delta review, root-cause batching, final post-fix review, and reporter separation are policy to adapt, not runtime code to translate literally. Its judge can accept weak resolution evidence; `needsHuman` is report-only; comment discovery trusts markers without ownership checks; concurrency is only documented. This design strengthens those boundaries.

## Goals / Non-Goals

**Goals:**

- Share one review-pass contract without collapsing distinct flow authorities and outcomes.
- Make state transitions and acceptance auditable and deterministic while preserving agents' investigative freedom.
- Resume finding history without trusting stale conclusions.
- Separate reviewed code, repair workspace, published head, CI evidence, and human decisions.
- Keep runtime, Git/GitHub boundaries, clock/locking, and agent outputs injectable for model-free tests.

**Non-Goals:**

- OpenSpec change selection, task completion, artifact editing, sync, or archive.
- Formal GitHub approval/request-changes submissions, automatic merge, force pushes, automatic rebase of competing updates, or unrelated cleanup.
- Automatic dependency installation or a new general-purpose sandbox.
- Reproducing upstream's permissive schema, report-only human flags, or unvalidated resolution claims.

## Decisions

### 1. Two graphs compose shared review components

Create `flows/review/index.ts` and `flows/review-fix/index.ts`, each backed by its own factory and graph. Place PR-specific contracts, prompts, graph fragments, Git/GitHub/worktree adapters, ledger logic, and reporting in `flows/pr-shared/`. Share components rather than invoking the complete review flow as a nested operation: the repair graph must retain ownership of budget, publication, final reporting, and lifecycle.

```text
review:
  preflight → acquire PR ownership → snapshot/worktree → load ledger
    → shared review pass → persist → reporter → publish report → finish

review-fix:
  preflight/push authority → acquire PR ownership → snapshot/worktree → load ledger
    → shared review pass → CI snapshot → controller acceptance
        ├─ supported → persist → reporter → publish report → success
        ├─ uncertainty/consequential choice → steering or needs-human
        └─ actionable blockers → budget → assess → scoped repair
              → verify scope/tests/head → commit/push → refresh → repeat
```

Each shared review pass consists of review, independent issue validation, and controller-checked ledger reconciliation. Its data does not declare terminal acceptance. No second classifier agent has authority to override the controller predicate. Fresh sessions receive explicit context rather than relying on a repair session's memory.

Alternative: one mode-switched public graph makes repair authority and advisory success ambiguous. Two entirely duplicated graphs drift in evidence and ledger policy.

### 2. Explicit authority and canonical target

Resolve caller input to canonical repository identity, PR number/URL, base SHA, head SHA, and actual head repository/ref. Never infer repair authority from authorship. Repair invocation grants scoped editing; pushing requires explicit authorization and technically usable access. Comment publication is independently authorized, not implicitly granted by edit or push authority. Because durable comment state is a core contract, these public flows require authorized ledger publication; a local-only preview is not part of this change.

Use an argument-vector command adapter for Git and GitHub rather than shell-interpolating PR text. Capture exit status, structured results, cancellation, and deadlines. Refuse inaccessible or unusable targets before repair, without introducing an author restriction.

### 3. Finding and ledger contracts

The versioned ledger contains canonical PR identity, revision, discovery snapshot, last-reviewed base/head, cached PR intention, findings, family/root-cause associations, scoped human decisions, and accepted-head history. Use a new package-owned marker namespace rather than overwriting Ptah's comments; importing an upstream ledger is not in scope.

A finding separates these axes:

- Identity: controller-assigned ID, source (`review` or `ci`), title, root-cause family, and code/check references.
- Severity: blocking or non-blocking.
- Review validation: validated, refuted, or inconclusive, with validator evidence and reviewed SHA. CI findings instead carry controller-observed check evidence.
- Disposition: open, resolved, deferred, or human-accepted; refutation remains available in history.
- Human state: required decision, scoped answer/rationale, and the snapshot/scope to which it applies.
- History: evidence-backed occurrences, resolution, reopening, and related fix commits.

Agents propose matches rather than assigning durable IDs. Reconciliation must cover every unresolved finding, reject unknown IDs and unsupported transitions, retain recurrence history, and reopen findings when new evidence invalidates closure. Store resolution evidence instead of merely labeling a finding fixed. Review closure requires fresh read-only review plus independent validation; CI closure requires the corresponding passing check on the current head. A fix commit alone proves neither.

Ledger parsing strictly checks schema/version, PR identity, field values, references, and ownership. Select only the configured publishing identity's package-owned comment. Ambiguous duplicates, malformed state, or unsupported versions fail with diagnostics instead of silently resetting or overwriting history. Human decisions are scoped data; changing code or requirements can require a new decision rather than blanket reuse of an old waiver.

Alternative: agent-owned JSON or marker-only comment discovery makes workflow memory and acceptance vulnerable to stale, forged, or malformed state.

### 4. Full discovery, delta investigation, explicit reconciliation

Review the full PR on discovery. On later passes, compare the current head with the last reviewed head and always supply the full PR base/head, intention, and unresolved findings. Delta review investigates introduced changes since the last reviewed head, but validation/reconciliation revisits all unresolved issues and relevant surrounding code. Read entire affected files using the existing `prompts/review.md` principles, not only isolated diff hunks.

If the base changes, ancestry diverges, or the snapshot cannot support a meaningful delta, review the full PR. Resume always includes an applicable review pass, even for an apparently clean ledger or unchanged head; do not blindly fix stored blockers or short-circuit to acceptance. Advance reviewed snapshot state only after the review/validation/reconciliation contract succeeds.

Alternative: full review every cycle is costlier. Delta-only review without reconciliation loses blockers and interaction evidence.

### 5. Deterministic outcomes and CI as independent evidence

`review` succeeds when an evidence-backed advisory review and its reporting complete; blockers can remain and do not mean merge rejection. Its status is `review_completed`, never PR acceptance. Unusable phase output, unavailable required clarification, cancellation, or reporting failure remains distinguishable from a completed report containing advisory concerns.

`review-fix` acceptance is a controller predicate over the same current head: published head equals reviewed head, repository-configured required CI is green, no unwaived validated review blockers remain, and no human-required uncertainty remains. Resolve required-check policy from repository configuration, including relevant status contexts and check runs; paginate rather than cap evidence silently. Missing, inaccessible, pending, or indeterminate required-check evidence cannot establish green CI. Do not invent local gate commands as substitutes for remote CI.

Failed required CI produces CI-sourced findings with check identity, head, and failure URLs. Repair assessment investigates their cause; it cannot waive CI or rewrite policy to become green. Optional/local targeted tests are useful pre-push evidence but do not replace repository CI. Waiting for CI consumes finite runtime, not a repair attempt, and unknown/pending CI does not trigger speculative edits.

Persist computed review/repair outcomes separately from publication diagnostics. Reporter or GitHub failure makes the overall invocation unsuccessful without changing the historical fact that a review or acceptance predicate was previously established for a particular SHA. Recheck current head before publishing a current acceptance status; retain stale outcomes only as labeled history.

### 6. Scoped assessment and human decisions

A read-only assessor maps actionable blockers to root-cause repair batches and explicit scopes. Automatically repair mechanical issues within those scopes. Public-contract changes, dependency changes, security-policy choices, conflicting requirements, and unresolved review uncertainty require human decisions. Collect all necessary answers before editing a mixed batch.

Use shared steering helpers when interactive; otherwise persist the pending decisions and return `needs_human`. Record rationale and scope for human risk acceptance; it can waive a review blocker, never CI. Deferral remains blocking. Unknown answers or non-blocking observations cannot expand repair scope. Fresh agents receive applicable decisions explicitly.

### 7. Dedicated worktrees, controller publication, and external movement

Provision dedicated worktrees at the resolved PR head without adopting or mutating the caller's checkout. ACP session isolation is not filesystem isolation, so set every investigative/repair session's cwd explicitly. Assessors/reviewers/validators are read-only by contract; repairs receive only assessed scope. Verify actual changed paths and commit state at the controller boundary.

The controller owns commit/push orchestration and verifies command results plus the resulting remote head. Use normal pushes only. Check remote head before publishing; an external update abandons stale repair publication and starts another pass in a fresh worktree at the new head. Preserve the abandoned workspace and its diagnostic reference, do not rebase or overwrite it automatically, and do not reset the attempt count. Recheck head after publication and before acceptance to catch races.

Each repair dispatch consumes one of ten attempts even if it fails or becomes stale. Review the results of the tenth normal repair before checking exhaustion. Set configurable finite phase, CI-wait, and overall deadlines; exact defaults belong to implementation rather than this architecture. Failures are not treated as successful repairs or hidden by arbitrary phase retries.

Success cleans the active workspace only after reporting completes and publication is verified. Failure, interruption, unmet decisions, exhaustion, and abandoned repairs preserve workspaces with reported paths. A later successful active run does not delete the sole preserved copy of an earlier abandoned repair.

### 8. Single writer protects durable state

Both entrypoints acquire ownership keyed by canonical repository/PR before dispatching agents or writing comments. Hold it through final persistence/reporting and release it on every terminal path. Reject contention rather than attempting to merge concurrent ledgers.

Use an injectable single-writer coordinator. Initial supported deployment is one machine with a shared per-user lock location outside checkouts, so separate worktrees or package checkouts cannot bypass the guard. Simultaneous execution from independent machines is unsupported without a shared coordinator; do not claim that GitHub marker comments offer distributed atomic locking. Include revision/owner metadata and check for unexpected durable-state changes before overwriting a comment, failing safely if an external writer violates the deployment constraint.

Alternative: GitHub comment POST/PATCH alone offers neither atomic acquisition nor compare-and-swap, so it cannot substantiate global single-writer guarantees.

### 9. Preserve upstream reporter policy, strengthen boundaries

Persist the ledger before reporter invocation. Give a fresh reporter the PR URL, settled controller outcome, ledger render, latest review prose (or an explicit ledger-only context), and section instructions. Retain upstream's structured `{ report: string }` output boundary, with nonempty body validation and no authority to update state.

Preserve report organization:

1. Open blocking findings first when unresolved/not accepted.
2. What this PR does.
3. Findings resolved, newest first; cap displayed history at 50 with an explicit omitted count.
4. Open non-blocking findings.
5. Deferred findings.
6. Accepted findings.
7. Review summary.

The controller prefixes a deterministic status line distinguishing advisory completion, repair acceptance, and unsuccessful outcomes, including reviewed SHA and CI state where applicable. Publish one dedicated human-readable issue comment, updating it separately from the machine ledger. Do not submit formal approve/request-changes reviews. Trust and ambiguity checks apply to report selection too.

Match upstream's three fresh reporter attempts when structured output is absent/unusable. Invocation failures propagate; do not turn prose into an acceptance claim or silently fall back after exhausted attempts. Ledger persistence and terminal diagnostics survive reporter failure.

### 10. Test graph behavior without live services

Adapt the existing fake ACP fixture pattern for reviewer, independent validator, assessor, repairer, and reporter roles. Inject Git/GitHub responses, clock/deadlines, ownership coordination, worktree roots, and steering. Cover real `FlowRunner` routing and CLI result/exit behavior in addition to parser unit tests. Use temporary real Git repositories for worktree, commit, normal-push, and stale-head integration tests; GitHub/CI remains fixture-driven by default.

Reuse safe data and steering helpers where contracts match. Do not extract OpenSpec-specific authorization into generic PR infrastructure or change existing flow behavior as a side effect. Existing recursive npm/Nix flow-test discovery should pick up new tests; only change package/build wiring if actually necessary.

## Risks / Trade-offs

- [Agent evidence can still be wrong] → Require independent validation, explicit scenarios/code references, and reproducible tests where feasible; make uncertainty visible.
- [Delta review misses wider interactions] → Carry full PR context and reconcile all unresolved findings; full fallback on base/history changes.
- [CI may require access, approvals, or unavailable policy APIs] → Preserve unknown/pending state and terminate within bounds; never treat missing evidence as green.
- [Tests execute untrusted code] → Worktrees are not sandboxes. Run only caller/repository-trusted configured commands under existing permission controls; no automatic install or PR-authored tool instructions.
- [Comment growth hits GitHub limits] → Keep displayed reports bounded with explicit omissions; detect ledger-size/write failures before overwriting durable history rather than silently truncating it.
- [Cross-host runs bypass a local coordinator] → Document the supported single-host deployment and require a shared coordinator before claiming cross-host concurrency safety.
- [Remote head can move between reads] → Tie all evidence to SHAs, use non-force publication, refresh after push, and stop/restart stale decisions.
- [Reporter fails after successful repair] → Preserve computed acceptance history and ledger, report publication failure, and retain the workspace for diagnosis.

## Migration Plan

1. Add new PR-specific shared contracts and adapters without modifying existing OpenSpec flow contracts.
2. Implement and test the advisory entrypoint first, then compose the repair entrypoint from the same review components.
3. Document required GitHub/ACP setup, explicit authorities, durable comment ownership, single-host concurrency limits, result semantics, and preserved-workspace recovery.
4. Validate both flows through model-free tests and repository quality gates before using authenticated live PRs.

No existing flow or Ptah comment is migrated automatically. Rollback removes/disables the new entrypoints; existing GitHub comments remain historical records. Published repair commits are not automatically reverted.
