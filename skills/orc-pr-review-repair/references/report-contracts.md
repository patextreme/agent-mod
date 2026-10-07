# Report contracts

Use these contracts for judge output, PR records, and the final user report. Resolve relative reference paths against the skill directory. Preserve full Standards and Spec reports alongside the curated ledger; grouping findings for repair does not replace either axis.

## Finding record

Give each finding a stable ID within the run (for example, `F-001`). Match recurring findings by requirement, affected behavior, and root cause rather than title alone.

| Field | Content |
| --- | --- |
| ID / provenance | Stable ID; Standards, Spec, or both; links to original findings. |
| Category | blocker, significant bug, report-only, refuted, or needs investigation. |
| Evidence | File/line or code path, reproduction/test where available, established requirement or mandatory rule. |
| Impact | Concrete trigger, consequence, supported scenario, and significance rationale. |
| Correction | Proposed scope, dependencies, risk, and whether human input is needed; for archived sources, code-only / approved behavior-affecting / new consequential intent with authorization citations. |
| Archived alignment (if applicable) | Code evidence, archived requirement/design/task citations, relevant main specs; each affected document changed with rationale or unchanged with evidence; preservation and validation results at the current SHA. |
| Disposition | open, repaired-and-verified, recurring, refuted, or awaiting human input. |
| Resolution evidence | Current code/test evidence; reviewed SHA; earlier occurrence/comment links. |

For standards-only findings, mark runtime trigger/consequence as not applicable and cite the mandatory rule or material maintenance risk. For report-only items, explain why they do not qualify. For uncertainty, record the missing evidence and next investigation instead of inventing it.

## Record identity

Start each PR record with:

```text
<!-- orc-pr-review-repair run=<initial-head-sha> round=<n> kind=<repair-start|summary|escalation> -->
```

Round numbers identify review/judgment cycles; `repairs used` counts reserved repair attempts, not comments or agent retries. Keep the original run ID on resume. Validate markers against PR identity, actual git state, and record contents; a marker alone is not authoritative evidence. Treat copied or conflicting records as an ambiguity to reconcile.

## Repair-start comment

Post and verify this before dispatching a repair:

```markdown
## PR review/repair — repair start
- PR / run / round:
- Pinned base / merge-base:
- Expected local and remote head:
- Repairs used: <incremented count>/10
- Authorized actionable IDs:
- Intended scope:
- Archived sources / correction class / authorized document scope: <if applicable>
- State: repair reserved; no delivery confirmed
```

An unfinished start reserves the attempt across interruptions. Link subsequent summary/escalation records to it.

## Round-summary comment

```markdown
## PR review/repair — round <n>
- PR / run:
- Pinned base / merge-base:
- Reviewed SHA:
- Delivered SHA(s): <values or no repair>
- Repairs used: <count>/10
- Repair-start record: <link or not applicable>
- Continuation state: <same recovered run/count; completed and remaining attempt operations>

### Standards
<Complete review report, or a durable link to its complete PR record.>

### Spec
<Complete review report, or explicit authorized skipped coverage.>

### Judge ledger
<Finding records, including unresolved actionable IDs and resolved IDs with evidence.>

### Repairs and validation
- Changes / affected files:
- Per-finding results:
- Check commands and results at the reviewed/delivered SHA:
- Skipped checks and coverage limitations:
- Archived alignment (if applicable): confirmed archive path/inventory and relevant main specs; code/requirement evidence; affected document changes or unchanged rationale; preservation evidence:
- Affected document/spec validation (if applicable): actual source paths, direct comparison or disposable-fixture mapping, commands/results and SHA:

### Delivery
- Commit / signing result:
- Push result / confirmed remote SHA:
- Original sync acceptance / confirmed archive path and complete current inventory (if applicable):
- Authorized code/test/archive/main-spec inclusion evidence (if applicable):
- Fresh review / affected validation / required final-gate SHA after fixes:

### Decision
<Review again, nothing repair-worthy, partial delivery, or human intervention.>
<Exact blocker and required human input, when applicable.>
```

The comment receipt URL/ID is returned by the delivery Agent after posting; it need not reference itself. For a no-repair round, explicitly mark repair and commit/push fields as not applicable. For archived-source repairs, use the existing ledger/summary rather than a parallel history protocol. New consequential intent needs an escalation containing the finding, investigation/attempted fixes, proposed intent, affected documents, options/consequences and scoped question before edits. For partial delivery, state which operations completed and the next recovery action, with actual expected/local/remote SHAs and commit/push/comment receipts. Follow [Continuation](./continuation.md) for interrupted attempts; link the same reservation rather than create another record protocol or budget. When commenting fails, report the unrecorded state directly to the user.

## Final report to the user

```markdown
## PR review/repair result
- PR:
- Outcome: verified | limited coverage | escalated
- Reviews / repair attempts: <counts>; repairs <count>/10
- Findings: <blockers>, <significant bugs>, <report-only>, <unresolved investigations>
- Delivered commits:
- Recovered run / reserved count / completed and remaining operations:
- PR history links:
- Checks and results:
- Skipped scope:
- Sync acceptance / confirmed archive path and complete current inventory: <if applicable>
- Archived alignment / affected document validation / delivered inclusion evidence: <if applicable>
- Final reviewed / delivered / required-gate SHA:
- Human input / recovery action: <specific request or none>
```

Use **verified** only for complete agreed coverage with no actionable findings and passing required checks. Use **limited coverage** when the user explicitly authorized narrower coverage and it completed successfully; describe the limit. Any unresolved actionable finding, uncertainty, failed required operation, or repair-budget exhaustion uses **escalated**, including runs that made useful partial progress.
