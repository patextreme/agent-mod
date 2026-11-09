---
name: pr-review-repair
description: Review and fix a PR or loop PR review/repair, using full boundary reviews and incremental repair reviews. Authorizes qualifying commits, pushes, and comments, not merges. Use code-review for review-only requests.
compatibility: Requires Agent tooling, codemode or SubagentWorkflow, the code-review skill, git signing, and authenticated PR read/comment/push access.
---

# PR Review and Repair

Orchestrate; delegate investigation, review, judgment, repair, validation, and delivery to `general-purpose` subagents. Own sequencing, evidence acceptance, repair accounting, and escalation. Run stages sequentially in one PR worktree; parallelize only the Standards and Spec axes. Invocation authorizes qualifying edits, commits, pushes, and comments; merging remains with the user.

## Contracts

Resolve `code-review` from the invoking environment. Read its SKILL.md and pass its absolute path and worktree context to delegates. Pause for missing prerequisites rather than substituting a procedure.

Before launching agents, read [the control flow](./references/pseudocode.md), the authority for stage transitions. Load the other contracts at these boundaries:

| Before | Read |
| --- | --- |
| Setup | [Preparation](./references/prepare.md) and [Report contracts](./references/report-contracts.md) |
| Selecting/resuming coverage, briefing reviewers, or reusing evidence | [Review scope](./references/review-scope.md) |
| Judgment, repair authorization, amendments, or human-input decisions | [Repair policy](./references/policy.md) |
| Briefing judges or record writers | [Report contracts](./references/report-contracts.md) |

Use codemode for judgment-heavy coordination or SubagentWorkflow for deterministic loops.

## Prepare

Delegate read-only setup under the preparation contract. Accept a complete sticky run contract only after PR/worktree identity, pinned refs, sources, checks, access, and paginated history are verified and unpublished work is reconciled. Finish any authorized incomplete attempt before starting another review.

## Shared guards

Delegate state checks at every stage boundary:

- Verify the expected base and phase state. Review/judge require aligned local/remote heads; repair permits authorized working-tree changes; delivery may advance local HEAD before the remote.
- Track last full-review and last accepted reviewed SHAs, scope/range, local/delivered SHAs, and repair-owned changes. Unexpected state pauses for reconciliation.
- Accept actual code/diffs and check results, not agent summaries alone. Incomplete coverage, unresolved investigation, or failed/unavailable required checks cannot establish success. PR-caused failures may qualify for repair; unrelated/environmental failures require escalation rather than unrelated edits.

Use repair policy to distinguish human decisions from orchestrator-owned recovery. Record and continue authorized recovery, including eligible scope amendments; escalate blocked/unsafe corrections, failed required operations, agent failure, or recurring findings without substantive progress. Preserve safe work, the reserved count, and exact operation state through the control flow's escalation branch.

## Stages

1. **Review.** Select full or delta scope and brief a fresh read-only Agent under the review-scope contract. Apply `code-review` with parallel Standards and Spec agents. Accept only complete axis reports with the reviewed SHA/diff, scope and inspected impact, sources read, checks/results, skipped coverage, and uncertainties. An interrupted review or unread required source is incomplete; unbounded delta impact routes to full review.
2. **Judge.** Use a separate read-only Agent with the run contract, current reports, repair policy, and complete ledger/history. Require stable IDs, deduplication retaining axis provenance, and evidence-backed classifications under Report contracts. Reconcile every prior actionable ID against current code/checks, including IDs omitted by fresh review. Accept the actionable queue, report-only findings, full ledger, checks, limitations, and escalation questions only after investigating uncertain classifications. Accept both reports and judgment before authorizing repairs.
3. **Repair.** Delegate posting and verification of a repair-start reserving the incremented attempt count, expected SHA, authorized IDs, and scope. Only a verified reservation permits edits. Give a separate repair Agent the worktree/SHA, sources, reports, and authorized queue; prioritize blockers and dependencies. Require qualifying corrections, regression tests or equivalent targeted evidence where practical, edited files, per-ID dispositions/evidence, check results, skips with reasons, and unresolved blockers. Independently inspect actual changes and complete required checks before delivery. Amend scope only under repair policy; return false positives to judgment and fresh review.
4. **Deliver.** Give a separate Agent the accepted repair evidence and owned changes. Stage only authorized files/hunks; follow signing/branch policy. Verify commit contents and the entire outgoing range, push without force to the exact PR head branch, confirm its remote SHA, then post and verify the round summary under Report contracts. Accept delivery only with signed commit SHA(s), push/remote receipts, comment URL/ID, and worktree status.

## Resume and finish

Each verified repair-start reserves one of ten attempts, including partial repairs and failed delivery. Recover the original run ID, count, unresolved IDs, and resolution evidence from append-only PR records; link amendments, summaries, and escalations to their repair-start. Ambiguous history requires user reconciliation, not a fresh budget. Retries and resumes finish only the reserved attempt's remaining work and keep its count; avoid duplicate commits/comments. Resume a human-input branch only after the user's answer and state reconciliation.

Finish only at an unchanged current head with complete full review/judgment, every prior actionable ID accounted for, no repair-worthy findings or unresolved uncertainty, passing required checks, and complete delivery/history receipts. Explicitly authorized narrower coverage is limited coverage, not full verification. Follow the control flow for clean deltas, final review, and budget exhaustion.

Delegate posting and verification of the final PR decision, including no-repair rounds, so the full ledger remains in PR history. Return only the concise final response from Report contracts: outcome, material limitations, required input, and verified PR comment link. Preserve complete stage outputs and a complete internal handoff of counts, receipts, checks, skipped scope, and needed input.
