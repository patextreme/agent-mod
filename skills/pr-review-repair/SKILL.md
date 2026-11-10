---
name: pr-review-repair
description: Review a PR in at most three full review rounds, then run a bounded fix-and-verify loop that defers new findings instead of chasing them. Authorizes qualifying commits, pushes, and comments, not merges. Use code-review for review-only requests.
compatibility: Requires Agent tooling, codemode or SubagentWorkflow, the code-review skill, git signing, and authenticated PR read/comment/push access.
---

# PR Review and Repair

Orchestrate; delegate investigation, review, judgment, repair, verification, and delivery to `general-purpose` subagents. Own sequencing, evidence acceptance, accounting, and escalation. Run stages sequentially in one PR worktree; parallelize only the Standards and Spec axes. Invocation authorizes qualifying edits, commits, pushes, and comments; merging remains with the user.

**Discovery is capped at three full review rounds.** Rounds 1-3 may find new issues. After round three there is no further discovery: fix and verify the recorded findings, defer anything else, and finish. A repair may tighten or narrow an existing finding; it may not open a new one.

## Contracts

Resolve `code-review` from the invoking environment. Read its SKILL.md and pass its absolute path and worktree context to delegates. Pause for missing prerequisites rather than substituting a procedure.

Before launching agents, read [the control flow](./references/pseudocode.md), the authority for stage transitions. Load the other contracts at these boundaries:

| Before | Read |
| --- | --- |
| Setup, resume, or posting records | [Preparation](./references/prepare.md) and [Report contracts](./references/report-contracts.md) |
| Briefing a reviewer or verifier | [Review scope](./references/review-scope.md) |
| Judgment, deferral, or human-input decisions | [Repair policy](./references/policy.md) |

Codemode suits judgment-heavy coordination; SubagentWorkflow suits the deterministic fix-and-verify loop.

## Prepare

Delegate read-only setup under the preparation contract. Accept a complete sticky run contract only after PR/worktree identity, pinned refs, sources, checks, access, and paginated history are verified and unpublished work is reconciled. Finish any authorized incomplete repair before starting another review.

## Shared guards

Delegate state checks at every stage boundary:

- Verify expected base and phase state. Review and verify require aligned local/remote heads; repair permits authorized working-tree changes; delivery may advance local HEAD before the remote.
- Track rounds used, open and deferred finding IDs, local and delivered SHAs, and repair-owned changes. Unexpected state pauses for reconciliation.
- Accept actual code/diffs and check results, not agent summaries alone. Incomplete coverage, unresolved investigation, or failed or unavailable required checks cannot establish success. PR-caused failures are repairable; unrelated or environmental failures are never repaired — escalate them before the window closes, and afterwards record them as deferred and report them as limitations.

## Stages

1. **Review** (rounds 1-3). Brief a fresh read-only Agent under the review-scope contract. Apply `code-review` to the full PR diff from the pinned merge-base to current head, with parallel Standards and Spec agents. Accept only complete axis reports with the reviewed SHA/diff, scope and inspected impact, sources read, checks/results, skipped coverage, and uncertainties. An interrupted review or unread required source is incomplete.
2. **Judge.** Use a separate read-only Agent with the run contract, current reports, repair policy, and the complete ledger. Require stable IDs, deduplication retaining axis provenance, and evidence-backed classifications under Report contracts. Reconcile every open ID against current code/checks, including IDs the fresh review omitted. Accept the actionable queue, report-only findings, ledger, checks, and limitations only after investigating uncertain classifications.
3. **Repair.** Give a repair Agent the worktree/SHA, sources, reports, and authorized queue; prioritize blockers and dependencies. Require qualifying corrections, regression tests or equivalent targeted evidence where practical, edited files, per-ID dispositions/evidence, check results, skips with reasons, and unresolved blockers. Independently inspect actual changes and complete required checks before delivery.
4. **Verify** (after the window). Brief a fresh read-only Agent with the recorded IDs (open and already resolved), each ID's fixing commits, and the review-scope contract. Verification **confirms, denies, or regresses; it never discovers.** It answers only whether each recorded ID is resolved at the current head (resolved IDs must stay resolved), whether a fix broke what it touched, and whether required checks pass. Anything else it notices is deferred: recorded in the ledger and summary, never repaired.
5. **Deliver.** Give a separate Agent the accepted evidence and owned changes. Stage only authorized files/hunks; follow signing and branch policy. Verify commit contents and the entire outgoing range, push without force to the exact PR head branch, confirm its remote SHA, then post and verify the round summary under Report contracts. Accept delivery only with signed commit SHA(s), push/remote receipts, comment URL/ID, and worktree status.

## Finish

Post and verify a summary for every round that changes state, including the final decision, so the ledger stays in PR history. Finish only at an unchanged current head with every open ID resolved and verified, the deferred list published, delivery receipts complete, and required checks passing — except an unrelated failure recorded as deferred, which is reported as a limitation and never counted as passing.

Three outcomes:

- **`verified`**: a review round converged with no repair-worthy findings and nothing was deferred.
- **`limited coverage`**: the window closed with repair work; everything found was resolved and verified, but no fourth review ran.
- **`escalated`**: a fix stalled or is blocked, human input is required, or evidence is incomplete.

Deferred findings never block a finish and never justify another review round. State deferred findings and the closed-window limitation in the visible summary, not buried in details.

## Resume

Recover rounds used, open and deferred IDs, and the last delivered SHA from verified PR records, then finish only the incomplete repair. Ambiguous history requires user reconciliation. A resume never restarts the review window or reopens discovery; retries keep their round and repair-cycle counts and avoid duplicate commits and comments.

Return only the concise final response from Report contracts: outcome, material limitations, deferred findings, required input, and verified PR comment link. Preserve complete stage outputs and a complete internal handoff of counts, receipts, checks, skipped scope, and needed input.
