# Report contracts

Use these contracts for judge output, PR records, and the final user response. Resolve relative reference paths against the skill directory. Preserve full Standards and Spec reports alongside the curated ledger; grouping findings for repair does not replace either axis.

## Finding record

Give each finding a stable ID within the run (for example, `F-001`). Match recurring findings by requirement, affected behavior, and root cause rather than title alone.

| Field | Content |
| --- | --- |
| ID / provenance | Stable ID; Standards, Spec, or both; links to original findings. |
| Category | blocker, significant bug, report-only, refuted, or needs investigation. |
| Evidence | File/line or code path, reproduction/test where available, established requirement or mandatory rule. |
| Impact | Concrete trigger, consequence, supported scenario, and significance rationale. |
| Correction | Proposed scope, dependencies, risk, and whether human input is needed. |
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
- State: repair reserved; no delivery confirmed
```

An unfinished start reserves the attempt across interruptions. Link subsequent summary/escalation records to it. Repair-start records stay complete and verifiable before edits: they never move fields behind collapsed details, and reservation sequencing is unchanged.

## PR record layers

Round summaries and final PR decisions are one comment with two layers:

- **Visible summary** — concise, factual, and outcome-first, derived from accepted reports, the ledger, and check evidence. Readers must understand it without access to the agent's filesystem.
- **Collapsed audit details** — a same-comment HTML `<details>` block preserving the complete records. Nothing is replaced by a digest, external storage, or local-file links; a durable link already permitted by this contract may remain, but no external storage prerequisite is introduced.

The identity marker precedes the visible summary; both layers live in the same comment, and PR history stays append-only.

### Visible summary contract

- Outcome first, using the existing acceptance semantics (`verified`, `limited coverage`, `escalated`); never invent a new success threshold.
- Unresolved blockers and the specific human decisions or recovery actions immediately below the outcome when present.
- Finding counts, including unresolved investigations; concise repair bullets carrying stable finding IDs, fixing commits, and validation attribution where applicable.
- Check results, including failures, pending/unknown/unavailable checks, skips, and material caveats. Distinguish newly executed checks from cached evidence accepted against the reviewed source, and never label unknown or unavailable checks as green.
- Material coverage and scope limitations remain visible; never move them into collapsed details.
- Reviewed commit and cumulative repair attempts used (`n/10`); include the delivered head when it differs from the reviewed head, so validation is never misleadingly attributed.
- Omit empty section headings and routine not-applicable fields; every field dropped from the visible summary remains required in the collapsed audit.
- Target roughly **150 words for a clean round**. This is a readability target, not a hard cap: never omit blockers, actionable findings, required input, or material limitations to meet it.

### Collapsed audit contract

The `<details>` block in the same comment preserves complete records, not summaries:

- Complete original Standards and Spec reports verbatim (or the explicit authorized skipped coverage, or the durable link already permitted for a previously posted complete record).
- The full finding ledger: every record with dispositions, resolution evidence, unresolved investigations, and prior-ID reconciliation.
- Validation and evidence details: check commands and results at the reviewed/delivered SHA, fresh-versus-cached provenance, skipped checks with reasons, and evidence receipts. Local log paths and hashes may appear here only as non-public audit references, never presented as accessible evidence links or substitutes for the actual results and limitations.
- Run identity, pinned refs, reviewed/local/delivered SHAs, the repair-start record link, cumulative repairs used, delivery state and receipts, and the exact incomplete-operation/recovery state when applicable.

Repair-start/summary/escalation links and all mandatory bookkeeping stay recoverable from the full comment contents even when the visible summary omits them.

### Example: clean round

```markdown
<!-- orc-pr-review-repair run=<initial-head-sha> round=1 kind=summary -->
## Review complete — no repair-worthy findings

Standards and Spec reviews covered the full PR diff at `f0df981`. **No findings or unresolved investigations.**

**Validation:** 525 tests passed, 1 skipped; format, lint, typecheck, and OpenSpec checks passed. Nix acceptance used cached results matched to the reviewed source—not a fresh run.

**Scope:** migration distribution validation only; live workflows and cleanup/deletion were not exercised.

**Repairs:** none · **Attempts:** 0/10 · **Human input:** none

<details>
<summary>Full review reports and audit details</summary>

### Standards
[Complete original Standards report]

### Spec
[Complete original Spec report]

### Judge ledger
[Complete ledger and classifications, including prior-ID reconciliation]

### Audit record
[Run identity, pinned refs, reviewed/delivered SHAs, repair-start link,
validation evidence and limitations, delivery state and receipts]

</details>
```

### Example: repaired round

```markdown
<!-- orc-pr-review-repair run=<initial-head-sha> round=2 kind=summary -->
## Review complete — repairs delivered and verified

**Resolved**
- `F-001` — [brief correction summary] · `abc1234` · regression test added and passed.
- `F-002` — [brief correction summary] · `def5678` · targeted checks passed at the delivered head.

**Findings:** 0 blockers · 0 unresolved investigations · 1 report-only (recorded in the audit).

**Validation:** full suite passed at the delivered head `def5678`; the lint/typecheck results from reviewed head `abc1234` were accepted as cached evidence for unchanged sources. One optional check remained unavailable and is not counted as passing.

**Scope:** [material coverage limitations, if any].

**Reviewed:** `abc1234` · **Delivered:** `def5678` · **Attempts:** 1/10 · **Human input:** none

<details>
<summary>Full review reports and audit details</summary>

### Standards
[Complete original Standards report]

### Spec
[Complete original Spec report]

### Judge ledger
[Complete ledger: F-001 and F-002 repaired-and-verified with evidence, the report-only record, and prior-ID reconciliation]

### Audit record
[Repair-start link, run identity, pinned refs, reviewed/delivered SHAs,
check commands and results, skipped checks with reasons, signing/push receipts]

</details>
```

### Example: escalated round

```markdown
<!-- orc-pr-review-repair run=<initial-head-sha> round=3 kind=escalation -->
## Review escalated — 1 blocker needs input

**Needs decision:** `F-003` — [concrete blocker and specific question/recovery action].

**Findings:** [blocker/significant bug/report-only/unresolved investigation counts].

**Resolved**
- `F-001` — [brief correction] · `abc1234` · regression test passed.
- `F-002` — [brief correction] · `def5678` · targeted checks passed.

**Validation:** [actual results, failed/unavailable checks, and material limitations].
**Scope:** [material coverage limitations, if any].
**Reviewed:** [SHA] · **Delivered:** [SHA, if different] · **Attempts:** 1/10

<details>
<summary>Full reports, ledger, and audit details</summary>

### Standards
[Complete original Standards report]

### Spec
[Complete original Spec report]

### Judge ledger
[Complete ledger and classifications, including F-003 awaiting human input]

### Audit record
[Repair-start links, reservation accounting, exact incomplete-operation state,
operation state and evidence, and the specific recovery input required]

</details>
```

The comment receipt URL/ID is returned by the delivery Agent after posting; it need not reference itself. For a no-repair round, explicitly mark repair and commit/push fields as not applicable in the visible summary (or omit the empty fields) while keeping them in the collapsed audit. For partial delivery, the visible summary states which operations completed and the next recovery action. When commenting fails, report the unrecorded state directly to the user.

## Final response to the user

State the result briefly and link the verified PR record instead of duplicating it:

```markdown
PR review/repair on <PR URL>: <verified | limited coverage | escalated>.
<Material limitations, if any.>
<Required human decision/recovery action, if any.>
Record: <verified PR comment link>
```

Do not reproduce the audit, ledger, or full reports already preserved in the PR comment. If publication of a required record failed, do not claim success: disclose the missing history record, the exact operation state, and the recovery action; never invent a receipt or link.

Use **verified** only for complete agreed coverage with no actionable findings and passing required checks. Use **limited coverage** when the user explicitly authorized narrower coverage and it completed successfully; describe the limit. Any unresolved actionable finding, uncertainty, failed required operation, or repair-budget exhaustion uses **escalated**, including runs that made useful partial progress.
