---
name: pr-review-repair
description: Review and repair a PR through delegated fresh review, history-aware judgment, and targeted fixes. Use when asked to review and fix a PR or loop PR review and repair. Authorizes qualifying commits, pushes, and comments; ten-attempt budget. Use code-review for review-only requests.
compatibility: Requires Agent tooling, codemode or SubagentWorkflow, the code-review skill, git signing, and authenticated PR read/comment/push access.
---

# PR Review and Repair Orchestration

Act only as the orchestrator: delegate investigation, review, judgment, repair, validation, and delivery to `general-purpose` subagents. Own sequencing, evidence acceptance, repair accounting, and escalation. Run stages sequentially in one PR worktree; parallelize only the Standards and Spec axes. This skill authorizes qualifying commits, pushes, and comments; merging remains with the user.

## Dependencies and control

Resolve `code-review` from the invoking environment; read its SKILL.md and pass its absolute path, repository/worktree, and change/store context to delegates. Missing prerequisite: pause; never invent a path or substitute a procedure.

Read [the preparation contract](./references/prepare.md) before setup, [the pseudocode](./references/pseudocode.md) before launching agents, [Report contracts](./references/report-contracts.md) during preparation and before briefing judges or record writers, and [repair policy](./references/policy.md) before judgment or repair decisions. The pseudocode is the control-flow source of truth. Records pair a concise visible summary with a collapsed audit preserving complete reports, ledger, and evidence; concise presentation never discards internal stage outputs, which remain required for judgment, handoffs, and resumes. Use codemode for judgment-heavy coordination or SubagentWorkflow for deterministic loops.

A human-input branch pauses until the user answers and PR state is reconciled. Pause only for decisions this skill assigns to the user: new product intent, consequential design, architecture or public-contract changes, security/custody policy changes, high-risk corrections, ambiguous identity/history/accounting, or missing prerequisites. Do not pause for a mechanical in-scope scope amendment or another orchestrator-owned action; record it and continue.

## Repair policy

Only evidenced repair-worthy blockers or significant bugs drive repair; high-risk corrections need human input, and minor, cosmetic, speculative, or smell-only findings stay report-only. In-attempt scope amendments keep the active reservation. The attempt count stays unchanged.

## Prepare

Delegate read-only setup with the repository and requested PR, following [the preparation contract](./references/prepare.md): resolve requirements and standards sources, PR identity, pinned refs, checks, access, and paginated history; use an existing permitted worktree; reconcile unpublished work; and accept a sticky run contract. Ambiguous selection, unsafe isolation, missing prerequisites, or unclear history pauses.

## Shared guards

At each stage boundary, verify the expected base and phase state: review/judge use an aligned local/remote head; repair may create authorized working-tree changes; delivery may advance local HEAD before the remote. Track reviewed, local, and delivered SHAs and repair-owned changes. Unexpected state pauses.

Accept evidence, not summaries: inspect actual code/diffs and check results through delegated validation. Incomplete coverage, unresolved investigation, or failed/unavailable required checks cannot establish success. PR-caused failures may qualify for repair; unrelated or environmental failures require escalation, not unrelated edits.

On a blocked human decision, unsafe correction, failed required operation, agent failure, or recurring findings without substantive progress, preserve safe work and the reserved count. Orchestrator-owned recovery—an in-scope scope amendment or another authorized accounting action—record and continue. Escalate only the actual human decision, with ledger, evidence, checks, exact operation state, and specific question/recovery action; verify its receipt. If commenting is unavailable, report the gap directly. Pause rather than repeat unchanged work.

## Stages

1. **Review.** Spawn a fresh read-only Agent without inherited conversation. Supply only PR/worktree identity, project instructions, absolute `code-review` path, clean requirements/standards sources, pinned base, and current head; exclude prior reports, judgments, repair summaries, and history comments from it and both axis prompts. Apply `code-review` with parallel Standards and Spec agents over the full diff including repairs. Return both complete reports, reviewed SHA/diff, sources read, checks/results, skipped coverage, and uncertainties. Interrupted review or an unread required source is incomplete.
2. **Judge.** Spawn a separate read-only Agent with the contract, current reports, threshold, and complete prior ledger/history. Require stable IDs, deduplication retaining axis provenance, and evidence-backed classification using Report contracts. Reconcile every prior actionable ID against current code/checks even if fresh review omitted it; past claims are not proof. Return the actionable queue, report-only findings, full ledger, check status, limitations, and escalation questions. Investigate uncertain classifications. Read and accept reports and judgment before authorizing repairs.
3. **Repair.** First delegate posting and verification of a repair-start with run/round ID, expected SHA, authorized IDs/scope, and incremented repairs used; only a verified reservation permits edits. Spawn a separate repair Agent with the exact worktree/SHA, sources, reports, and authorized queue; prioritize blockers and respect dependencies. Archived change: apply archived-intent rules—in-scope repairs keep the change archived; behavior-changing repairs check code, archived artifacts, and main specs together, update affected documents, and rerun affected validation; code-only corrections never reopen, rearchive, or rerun the lifecycle; new requirements or consequential design changes require user authorization; archival never exempts validation. Require qualifying corrections, regression tests or equivalent targeted evidence where practical, actual edited files, per-finding dispositions/evidence, check commands/results, skipped checks with reasons, and unresolved blockers. Delegate remaining validation and independent inspection of actual changes before delivery. Apply an in-attempt scope amendment when validation finds an additional in-scope finding. False positives return to judgment and fresh review.
4. **Deliver.** Spawn a separate Agent with accepted repair evidence and owned changes. Stage only authorized files/hunks; follow signing and branch policy. Verify commit contents and the entire outgoing range, push without force to the exact PR head branch, confirm its remote SHA, then post and verify the round summary as a Report-contracts record. Return signed commit SHA(s), push result, remote SHA, comment URL/ID, and worktree status. Delivery completes only when commit, push, and comment are verified.

## Resume and finish

Each verified repair-start reserves one attempt, including partial repairs or failed delivery; a verified in-attempt scope amendment keeps the reservation and count. Recover the run ID and cumulative count from append-only PR records; keep unresolved IDs and resolution evidence; link amendments, summaries, and escalations to their start records. Ambiguous or conflicting history requires user reconciliation, not a fresh budget.

On resume, reconcile actual git/PR state and finish an authorized incomplete attempt before a new review. A repair-worthy blocker discovered by that attempt's own validation is part of finishing it and may be amended into the reservation; a finding from fresh review or judgment starts the next repair cycle. Retry only that attempt's remaining work; avoid duplicate commits/comments. Agent retries and session resumes do not replenish the ten-attempt budget.

Allow at most ten repair attempts followed by a final fresh review/judgment. Finish only when both are complete, every prior actionable finding is accounted for, no repair-worthy findings or unresolved uncertainty remain, required checks pass at the reviewed head, and delivery/history records are complete. Explicitly authorized narrower coverage is limited coverage, not full verification.

Delegate posting and verification of the final PR decision, including no-repair rounds, as a Report-contracts record, so the full ledger remains in PR history. Return the user only the concise final response—outcome, material limitations, required human input, and verified PR comment link. Callers still receive the complete internal handoff: counts, receipts, checks, skipped scope, and needed input. Remaining actionable findings after attempt ten or any unresolved blocker require escalation, not success.
