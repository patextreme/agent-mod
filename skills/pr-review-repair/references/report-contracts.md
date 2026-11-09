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

## Review coverage record

For every review/judgment cycle, retain these fields in the collapsed audit and internal handoff:

- Mode/purpose: full (initial, fallback, or final) or delta; accepted, incomplete, or insufficient scope.
- Pinned base/merge-base, exact comparison SHAs and diff/log commands, and reviewed head.
- Last accepted full-review SHA and last accepted reviewed SHA, with durable links to complete reports/judgments establishing the coverage chain (or explicitly absent coverage).
- Requirements, standards, instructions, and check-definition fingerprints; source discovery/revalidation results and any invalidation/fallback reason.
- Delta impact inspected beyond the changed lines, scope expansions, skipped coverage, and uncertainty.
- Whether final full review/judgment is pending or complete at the current head; check evidence and any reuse rationale under [review scope](./review-scope.md).

Post and verify a clean delta's intermediate summary before starting its final full review, preserving the accepted reports/judgment and coverage chain even if the final review is interrupted. Before acceptance, distinguish the candidate reviewed head from the last accepted reviewed SHA. A delta report supplements the coverage chain; it never replaces the earlier complete full reports. Old records without verifiable coverage fields can recover repair accounting but cannot authorize incremental coverage.

## Record identity

Start each PR record with:

```text
<!-- pr-review-repair run=<initial-head-sha> round=<n> kind=<repair-start|scope-amendment|summary|escalation> -->
```

Round numbers identify review/judgment cycles; `repairs used` counts reserved repair attempts, not comments or agent retries. Keep the original run ID on resume. A run started under the skill's former `orc-pr-review-repair` name keeps its existing markers and run ID; later records in that same run continue under that recorded identity rather than restarting the count. Validate markers against PR identity, actual git state, and record contents; a marker alone is not authoritative evidence. Treat copied or conflicting records as an ambiguity to reconcile.

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

An unfinished start reserves the attempt across interruptions. Link subsequent scope amendments, summaries, and escalations to it. Repair-start records stay complete and verifiable before edits: they never move fields behind collapsed details, and reservation sequencing is unchanged.

## Scope-amendment comment

When the active attempt's required validation discovers an additional in-scope finding, the orchestrator may amend the active reservation instead of opening a new attempt. Post and verify this before editing:

```markdown
## PR review/repair — scope amendment
- PR / run / round:
- Active repair-start:
- Pinned base / merge-base:
- Expected local and remote head:
- Repairs used: <unchanged count>/10
- Added actionable IDs:
- Added scope:
- In-scope rationale:
- State: scope amended; no new reservation; no delivery confirmed
```

A scope amendment adds only findings that satisfy the in-attempt amendment rules in [the repair policy](./policy.md). It never increments `repairs used`, changes the run ID, or replaces the active repair-start. If the finding needs new product intent, new requirements, product behavior, a consequential design, architecture or public-contract change, a security/custody policy change, a high-risk correction, any correction that fails the in-attempt amendment conditions, or accounting is ambiguous, post an escalation instead. Keep the amendment complete and verifiable before edits; do not hide its fields behind collapsed details.

## PR record layers

Round summaries and final PR decisions are one comment with two layers:

- **Visible summary** — concise, factual, and outcome-first, derived from accepted reports, the ledger, and check evidence. Readers must understand it without access to the agent's filesystem.
- **Collapsed audit details** — a same-comment HTML `<details>` block preserving the complete records. Nothing is replaced by a digest, external storage, or local-file links; a durable link already permitted by this contract may remain, but no external storage prerequisite is introduced.

The identity marker precedes the visible summary; both layers live in the same comment, and PR history stays append-only.

### Visible summary contract

- Outcome first, using the existing final acceptance semantics (`verified`, `limited coverage`, `escalated`); never invent a new success threshold. Intermediate delivery or clean delta summaries say `in progress — final full review pending`, not whole-PR verified.
- Unresolved blockers and the specific human decisions or recovery actions immediately below the outcome when present.
- Finding counts, including unresolved investigations; concise repair bullets carrying stable finding IDs, fixing commits, and validation attribution where applicable.
- Check results, including failures, pending/unknown/unavailable checks, skips, and material caveats. Distinguish newly executed checks from cached evidence accepted against the reviewed source, and never label unknown or unavailable checks as green.
- Material coverage and scope limitations remain visible; never move them into collapsed details.
- Reviewed commit, full/delta scope and range, final-full-review status, and cumulative repair attempts used (`n/10`); include the delivered head when it differs from the reviewed head, so validation is never misleadingly attributed.
- Omit empty section headings and routine not-applicable fields; every field dropped from the visible summary remains required in the collapsed audit.
- Target roughly **150 words for a clean round**. This is a readability target, not a hard cap: never omit blockers, actionable findings, required input, or material limitations to meet it.

### Collapsed audit contract

The `<details>` block in the same comment preserves complete records, not summaries:

- Complete original Standards and Spec reports verbatim (or the explicit authorized skipped coverage, or the durable link already permitted for a previously posted complete record).
- The full finding ledger: every record with dispositions, resolution evidence, unresolved investigations, and prior-ID reconciliation.
- Validation and evidence details: check commands and results at the reviewed/delivered SHA, fresh-versus-cached provenance, skipped checks with reasons, and evidence receipts. Local log paths and hashes may appear here only as non-public audit references, never presented as accessible evidence links or substitutes for the actual results and limitations.
- Run identity, pinned refs, reviewed/local/delivered SHAs, the repair-start and any scope-amendment record links, cumulative repairs used, delivery state and receipts, and the exact incomplete-operation/recovery state when applicable.
- The complete Review coverage record, including baseline/chain links, scope, input fingerprints, invalidation, and final-full-review status.

Repair-start/scope-amendment/summary/escalation links and all mandatory bookkeeping stay recoverable from the full comment contents even when the visible summary omits them.

### Example: clean round

```markdown
<!-- pr-review-repair run=<initial-head-sha> round=1 kind=summary -->
## Review complete — no repair-worthy findings

Standards and Spec reviews covered the full PR diff `a1b2c3d..f0df981`. **No findings or unresolved investigations.** This clean initial full review also completes the final review at the unchanged head `f0df981`.

**Validation:** 525 tests passed, 1 skipped; format, lint, and typecheck passed. Nix acceptance used cached results matched to the reviewed source—not a fresh run.

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
validation evidence and limitations, delivery state and receipts;
complete Review coverage record: full initial/final, exact commands, input fingerprints,
last full-review and last reviewed SHA f0df981, no prior chain, final full review complete]

</details>
```

### Example: repaired round

```markdown
<!-- pr-review-repair run=<initial-head-sha> round=2 kind=summary -->
## In progress — repairs delivered; final full review pending

**Resolved**
- `F-001` — [brief correction summary] · `abc1234` · regression test added and passed.
- `F-002` — [brief correction summary] · `def5678` · targeted checks passed at the delivered head.

**Findings:** 0 blockers · 0 unresolved investigations · 1 report-only (recorded in the audit).

**Validation:** full suite passed at the delivered head `def5678`; the lint/typecheck results from reviewed head `abc1234` were accepted as cached evidence for unchanged sources. One optional check remained unavailable and is not counted as passing.

**Scope:** full PR diff `<merge-base>..abc1234`; delivered repair `abc1234..def5678` awaits delta review, then final full review. [Material coverage limitations, if any.]

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
check commands and results, skipped checks with reasons, signing/push receipts;
complete Review coverage record: full, exact commands, input fingerprints, baseline/chain links,
last full-review and last reviewed SHA abc1234, delivered def5678 not yet reviewed,
final full review pending]

</details>
```

### Example: incremental round

```markdown
<!-- pr-review-repair run=<initial-head-sha> round=3 kind=summary -->
## In progress — delta clean; final full review pending

Standards and Spec reviewed repair delta `abc1234..def5678`, including affected callers and contracts. No new repair-worthy findings or unresolved investigations. The judge verified every prior actionable ID against current code/checks.

**Validation:** required checks passed at `def5678`.
**Scope:** incremental coverage only; this is not whole-PR verification. Next: fresh full review of `<merge-base>..def5678` at the unchanged head.
**Reviewed / delivered:** `def5678` · **Attempts:** 1/10 · **Human input:** none

<details>
<summary>Full delta reports and audit details</summary>

### Standards
[Complete original Standards report for delta and inspected impact]

### Spec
[Complete original Spec report for delta and inspected impact]

### Judge ledger
[Complete ledger with current resolution evidence for every prior actionable ID]

### Audit record
[Run identity, repair-start link, delivery receipts, checks and evidence;
complete Review coverage record: delta abc1234..def5678, exact commands,
input fingerprints and revalidation, last full-review SHA abc1234,
last reviewed SHA def5678, durable baseline/chain report and judgment links,
inspected callers/contracts, final full review pending]

</details>
```

### Example: escalated round

```markdown
<!-- pr-review-repair run=<initial-head-sha> round=3 kind=escalation -->
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
operation state and evidence, and the specific recovery input required;
complete Review coverage record: mode/range, last full-review and last reviewed SHAs,
baseline/chain links, input fingerprints, invalidation reasons, final full review status]

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

Use **verified** only for complete agreed coverage with no actionable findings and passing required checks, after a fresh full review/judgment at the unchanged current head. A clean delta alone is in progress, not a final decision. Use **limited coverage** when the user explicitly authorized narrower coverage and it completed successfully; describe the limit. Any unresolved actionable finding, uncertainty, failed required operation, or repair-budget exhaustion uses **escalated**, including runs that made useful partial progress.
