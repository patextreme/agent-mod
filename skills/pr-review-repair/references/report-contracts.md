# Report contracts

Read before preparation, judgment, or record writing. Preserve complete Standards and Spec reports alongside the ledger; grouping findings for repair keeps both axis reports intact.

## Finding record

Assign a stable run-local ID (for example, `F-001`). Match recurrence by requirement, affected behavior, and root cause, not title alone.

| Field | Content |
| --- | --- |
| ID / provenance | Stable ID; Standards, Spec, or both; links to original findings. |
| Category | blocker, significant bug, report-only, refuted, or needs investigation. |
| Evidence | File/line or code path, reproduction/test where available, established requirement or mandatory rule. |
| Intent grounding | In-intent: the governing requirement/criterion, explicit PR scope, mandatory rule for changed code, or PR-caused regression; deferred: the missing grounding and suggested follow-up. |
| Impact | Concrete trigger, consequence, supported scenario, and significance rationale. |
| Correction | Proposed scope, dependencies, risk, and whether human input is needed. |
| Disposition | open, repaired-and-verified, recurring, refuted, deferred, or awaiting human input. |
| Resolution evidence | Current code/test evidence; reviewed SHA; earlier occurrence/comment links. |

Deferred is a terminal disposition, not a severity: preserve the intrinsic category and record why the finding is outside the PR's intent. A recurrence keeps the same ID as still deferred; a concern that becomes in-scope later is a new open finding. Deferred findings never authorize edits, repair-start IDs, or amendments.

For standards-only findings, mark runtime trigger/consequence not applicable and cite the mandatory rule or material maintenance risk. Explain report-only and deferred classifications. For uncertainty, record missing evidence and the next investigation.

## Review coverage record

Retain these fields for every review/judgment cycle in its collapsed audit and internal handoff:

- Mode/purpose: full (initial, fallback, or final) or delta; accepted, incomplete, or insufficient scope.
- Pinned base/merge-base, exact comparison SHAs and diff/log commands, and reviewed head.
- Last accepted full-review SHA and last accepted reviewed SHA, with durable links to complete reports/judgments establishing the coverage chain (or explicitly absent coverage).
- Requirements, standards, intent contract, instructions, and check-definition fingerprints; source discovery/revalidation results and any invalidation/fallback reason.
- Delta impact inspected beyond the changed lines, scope expansions, skipped coverage, and uncertainty.
- Whether final full review/judgment is pending or complete at the current head; check evidence and any reuse rationale under [review scope](./review-scope.md).

Distinguish the candidate reviewed head from the last accepted reviewed SHA. Include earlier complete reports by durable link rather than replacing them with the delta report. Follow [control flow](./pseudocode.md) for publication timing and [review scope](./review-scope.md) for coverage recovery.

## Record identity

Start each PR record with:

```text
<!-- pr-review-repair run=<initial-head-sha> round=<n> kind=<repair-start|scope-amendment|summary|escalation> -->
```

`round` identifies a review/judgment cycle; `repairs used` counts reserved attempts, not comments or retries. On resume, retain the original run ID/count, including existing `orc-pr-review-repair` markers for runs begun under that former name. Validate identity against the PR, git state, and record contents. Reconcile copied/conflicting markers; a marker alone is not evidence.

## Repair-start comment

Post and verify this before dispatching a repair:

```markdown
## PR review/repair — repair start
- PR / run / round:
- Pinned base / merge-base:
- Pinned intent:
- Expected local and remote head:
- Repairs used: <incremented count>/10
- Authorized actionable IDs:
- Intended scope:
- State: repair reserved; no delivery confirmed
```

An unfinished start reserves the attempt across interruptions. Link amendments, summaries, and escalations to it. Keep every field visible and read-back verified before edits; reservation sequencing is unchanged.

## Scope-amendment comment

Apply [repair policy](./policy.md) to findings discovered by the active attempt's required validation. For an eligible amendment, post and verify this before editing:

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

An amendment never increments `repairs used`, changes the run ID, or replaces the active repair-start. Keep every field visible and verified before editing. Escalate ineligible or unresolved amendments under repair policy's human-input rules.

## PR record layers

Round summaries and final PR decisions are one comment with two layers:

- **Visible summary** — factual, outcome-first, understandable without the agent's filesystem.
- **Collapsed audit details** — complete records in a same-comment HTML `<details>` block. Nothing is replaced by a digest, external storage, or local-file links; durable links to previously posted complete records are permitted.

Place the identity marker before both layers. Keep PR history append-only.

### Visible summary contract

- State the outcome first: `verified`, `limited coverage`, or `escalated` for final decisions; `in progress — final full review pending` for intermediate delivery/clean delta summaries.
- Put unresolved blockers and specific human decisions/recovery actions immediately below the outcome.
- Give finding counts, including unresolved investigations and deferred findings. Repair bullets carry stable IDs, fixing commits, and validation attribution.
- List deferred findings with stable IDs, one-line descriptions, why each is outside PR intent, and a suggested follow-up; keep the full ledger in the audit.
- Report checks, including failures, pending/unknown/unavailable results, skips, and material caveats. Attribute fresh versus cached evidence to its source; never label unknown or unavailable checks as green.
- Keep material coverage/scope limitations visible; never move them into collapsed details.
- Show reviewed commit, full/delta scope/range, final-full-review status, and attempts used (`n/10`). Show delivered head separately when different.
- Omit empty headings and routine not-applicable fields here; retain their values in the audit.
- Aim for **150 words for a clean round**: a readability target, not a hard cap. Preserve blockers, actionable and deferred findings, required input, and material limitations.

### Collapsed audit contract

Include complete records in `<details>`:

- Complete original Standards and Spec reports verbatim, explicit authorized skips, or durable links to previously posted complete reports.
- The full finding ledger: every disposition, resolution evidence, unresolved investigation, deferred finding, and prior actionable/deferred ID reconciliation.
- Check commands/results at reviewed/delivered SHAs, fresh/cached provenance, skips with reasons, and evidence receipts. Local log paths/hashes appear only as non-public audit references, alongside actual results and limitations—not as accessible evidence links.
- Run identity, pinned refs, reviewed/local/delivered SHAs, the repair-start and any scope-amendment record links, cumulative repairs used, delivery state and receipts, and the exact incomplete-operation/recovery state when applicable.
- The complete Review coverage record, including baseline/chain links, scope, input fingerprints, invalidation, and final-full-review status.

Keep all record links and mandatory bookkeeping recoverable from the comment.

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

### Example: clean round with deferred findings

```markdown
<!-- pr-review-repair run=<initial-head-sha> round=1 kind=summary -->
## Review complete — no in-scope repair-worthy findings

Standards and Spec reviews covered the full PR diff `a1b2c3d..f0df981`. **No in-scope findings or unresolved investigations.** This clean initial full review also completes the final review at the unchanged head `f0df981`.

**Deferred (out of PR scope):**
- `F-004` — pre-existing null dereference in a touched helper; not caused by this PR. Follow-up: separate issue.
- `F-005` — repo-wide logging refactor suggested by Standards; outside this PR's stated scope.

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
[Complete ledger and classifications, including F-004 and F-005 deferred with intent-grounding rationale; prior actionable/deferred ID reconciliation]

### Audit record
[Run identity, pinned refs, reviewed/delivered SHAs, intent contract fingerprint,
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

**Findings:** 0 blockers · 0 unresolved investigations · 1 report-only · 1 deferred (recorded in the audit).

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

Standards and Spec reviewed repair delta `abc1234..def5678`, including affected callers and contracts. No new repair-worthy findings or unresolved investigations. The judge verified every prior actionable and deferred ID against current code/checks.

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
[Complete ledger with current resolution evidence for every prior actionable and deferred ID]

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

Return the comment URL/ID as a posting receipt; the comment need not link itself. For no-repair rounds, record repair/commit/push as not applicable in the audit and show or omit those fields in the summary. For partial delivery, show completed operations and the next recovery action. When commenting fails, report the unrecorded state directly to the user.

## Final response to the user

Return only the outcome, deferred findings, material limitations, required input, and verified record link:

```markdown
PR review/repair on <PR URL>: <verified | limited coverage | escalated>.
<Deferred findings, if any, with follow-up pointers.>
<Material limitations, if any.>
<Required human decision/recovery action, if any.>
Record: <verified PR comment link>
```

Keep the full reports/ledger in PR history and the internal handoff. If required publication failed, disclose the missing record, exact operation state, and recovery action; never invent a receipt or link.

- **Verified:** all finish gates in [SKILL.md](../SKILL.md) pass.
- **Limited coverage:** explicitly authorized narrower coverage completed successfully; state the limit.
- **Escalated:** unresolved actionable findings/uncertainty, failed required operations, or exhausted repair budget with work remaining, even if useful repairs were delivered.

A `verified` outcome may carry deferred findings; they remain recorded in PR history.

A clean delta alone is in progress, not a final decision.
