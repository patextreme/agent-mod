---
name: pr-review-repair
description: Review a PR in at most three full review rounds, then run a bounded fix-and-verify loop that classifies new findings instead of chasing them. Authorizes qualifying commits, pushes, and comments, not merges. Use code-review for review-only requests.
compatibility: Requires Agent tooling, codemode or SubagentWorkflow, the code-review skill, git signing, and authenticated PR read/comment/push access.
---

# PR Review and Repair

Orchestrate; delegate investigation, review, judgment, repair, verification, and delivery to `general-purpose` subagents. Own sequencing, evidence acceptance, accounting, and escalation. Run stages sequentially in one PR worktree; parallelize only the Standards and Spec axes. Invocation authorizes qualifying edits, commits, pushes, and comments; merging remains with the user.

**Discovery is capped at three full review rounds**, with a maintainer-selected smaller total window of one or two. Three is a ceiling, not a quota: stop at the first complete clean round. After the effective window closes, fix and verify recorded findings, classify everything else, and finish or escalate within the accepted finite budgets. A repair may tighten or narrow an existing finding; it may not open a new one. References/examples using three describe the default ceiling; apply the accepted smaller limit everywhere.

## Contracts

Resolve `code-review` from the invoking environment. Read its SKILL.md and pass its absolute path and worktree context to delegates. Pause for missing prerequisites rather than substituting a procedure.

Before launching agents, read [the control flow](./references/pseudocode.md), the authority for stage transitions, and [Lifecycle guard](./references/lifecycle.md). Persist and validate every dispatch/result with the bundled [lifecycle.mjs](./references/lifecycle.mjs); its CLI, accepted budgets, input schema and recovery rules are in that reference. A rejected boundary stops work. Load the other contracts at these boundaries:

| Before | Read |
| --- | --- |
| Setup, resume, or posting records | [Preparation](./references/prepare.md) and [Report contracts](./references/report-contracts.md) |
| Briefing a reviewer or verifier | [Review scope](./references/review-scope.md) |
| Judgment, deferral, or human-input decisions | [Repair policy](./references/policy.md) |

Codemode suits judgment-heavy coordination; SubagentWorkflow suits the deterministic fix-and-verify loop.

## Prepare

Create or recover the lifecycle journal before delegating bounded read-only setup under the preparation contract. Accept a complete sticky run contract only after PR/worktree identity, pinned refs, sources, checks, access, and paginated history are verified and unpublished work is reconciled. Record effective limit, consumed/remaining rounds, stage/continuation attempts, turn bounds and measurable progress/escalation conditions. Finish any authorized incomplete repair or delivery before starting another review; setup and resume never grant a new window.

## Shared guards

Delegate state checks at every stage boundary:

- Verify expected base and phase state. Review and verify require aligned local/remote heads; repair permits authorized working-tree changes; delivery may advance local HEAD before the remote.
- Track rounds used, all attempts and repair cycles, open and deferred finding IDs, local and delivered SHAs, and repair-owned changes. Charge a persisted `start` before dispatch; accept a `result` only against actual evidence. Every attempt uses the recorded finite turn bound. Unexpected state pauses for reconciliation without resetting accounting.
- Accept actual code/diffs and check results, not agent summaries alone. Incomplete coverage, unresolved investigation, or failed or unavailable required checks cannot establish success. PR-caused failures are repairable; unrelated or environmental failures are never repaired — escalate them before the window closes, and afterwards report them as material limitations, never as deferred findings. An escalation answered as environmental (for example "environmental, proceed") authorizes continuing in the same run at that same limit: record the answer in the `reconcile`/`resume` authorization, keep the failure visible as a material limitation, and never count it as passing. Acceptance changes no accounting, closes no discovery, and buys no round.

## Stages

1. **Review** (within the accepted one-to-three-round window). Brief a fresh read-only Agent under the review-scope contract. Apply `code-review` to the full PR diff from the pinned merge-base to current head, with parallel Standards and Spec agents. Accept only complete axis reports with the reviewed SHA/diff, scope and inspected impact, sources read, checks/results, skipped coverage, and uncertainties. Keep each axis report within the review-scope budget: the complete report is republished inline with the ledger, checks and lifecycle accounting and must fit one comment. Require the Review scope evaluator's accepted coverage for both axes and pass actual report/input/output locators in the lifecycle result's stage manifest. An interrupted review or unread required source is incomplete. Charge continuations to the same consumed round and original attempt budgets; accept no partial review. Retry only with measurable coverage progress and remaining budget, otherwise preserve work and escalate.
2. **Judge.** Use a separate read-only Agent with the run contract, current reports, repair policy, and the complete ledger. Require stable IDs, deduplication retaining axis provenance, and evidence-backed classifications under Report contracts. Reconcile every open ID against current code/checks, including IDs the fresh review omitted. Accept the actionable queue, report-only findings, ledger, checks, and limitations only after investigating uncertain classifications within the frozen investigation/judgment budgets. Exhausted uncertainty escalates instead of authorizing edits.
3. **Repair.** Give a repair Agent the worktree/SHA, sources, reports, and authorized queue; prioritize blockers and dependencies. Require qualifying corrections, regression tests or equivalent targeted evidence where practical, edited files, per-ID dispositions/evidence, check results, skips with reasons, and unresolved blockers. Independently inspect actual changes and complete required checks before delivery.
4. **Verify** (after the window). Brief a fresh read-only Agent with the recorded IDs (open and already resolved), each ID's fixing commits, and the review-scope contract. Verification **confirms, denies, or regresses; it never discovers.** It answers only whether each recorded ID is resolved at the current head (resolved IDs must stay resolved), whether a fix broke what it touched, and whether required checks pass. Accept its substantive report only after Review scope's coverage evaluation, with actual evidence locators in the lifecycle result's stage manifest. Anything else it notices is never repaired: classify it under Review scope and Repair policy.
5. **Deliver.** Give a separate Agent the accepted evidence and owned changes. Stage only authorized files/hunks; follow signing and branch policy. Verify commit contents and the entire outgoing range, push without force to the exact PR head branch, confirm its remote SHA, then post and verify the round summary under Report contracts. Accept delivery only with signed commit SHA(s), push/remote receipts, comment URL/ID, and worktree status. Persist separate bounded commit, push and comment attempts/receipts against the authorized operation; recover a completed effect by read-back rather than duplicating it.

## Finish

Post and verify a summary for every round that changes state, including the final decision, so the ledger stays in PR history. Validate `finish` only at an unchanged current head with complete accepted coverage, every open ID resolved and verified, the deferred list published, delivery receipts complete, and required checks passing — except an unrelated failure, which is reported as a material limitation and never counted as passing.

Three outcomes:

- **`verified`**: a review round converged with no repair-worthy findings, required checks passed, and that round repaired and deferred nothing.
- **`limited coverage`**: discovery ended with repair work, deferred findings, or a required check that did not pass; every open ID is resolved and verified, any deferred findings are repair-worthy and outside the PR's scope, and no review beyond the accepted window ran. Closing discovery alone is not a clean review and waives no finish gate.
- **`escalated`**: a fix stalled or is blocked, human input is required, or evidence is incomplete.

Deferred findings never block a finish and never justify another review round. State deferred findings and the closed-window limitation in the visible summary, not buried in details.

## Resume

Recover the original journal from local state and verified paginated PR records: run identity, effective limit, frozen budgets, consumed rounds, attempts, current stage, complete ledger and incomplete-operation/receipt state. Replay it with `show` and reconcile any unpublished suffix; never initialize a replacement. Follow [Lifecycle guard](./references/lifecycle.md#recovery-and-durable-handoff) for terminal return, interruption/pause before guarded resume, interrupted attempts, unexpected heads and delivery/notice receipt recovery. Ambiguous history requires user reconciliation. A resume never restarts the review window or reopens discovery; retries retain cumulative counts and operation identity. Finish the authorized incomplete operation first. A maintainer-requested shorter total is a `limit` event retaining already-consumed rounds, not a reset.

Return only the concise final response from Report contracts: outcome, material limitations, deferred findings, required input, and verified PR comment link. Preserve complete stage outputs and a complete internal handoff of counts, receipts, checks, skipped scope, and needed input.
