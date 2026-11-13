# Report contracts

Read before posting records and before composing the final response. [Control flow](./pseudocode.md) owns timing; this contract owns content.

Keep PR history append-only: post a new comment, never rewrite an earlier one. Every record carries its identity marker on its first line:

```html
<!-- pr-review-repair run=<initial-head-sha> round=<n> kind=<summary|escalation> -->
```

`kind=summary` covers round summaries and the final decision; `kind=escalation` covers pauses. Post and read-back verify every record. If posting fails, report the unrecorded state directly to the user; never invent a receipt or link.

## Publication and recovery gate

Maintain **one logical audit**: the latest verified state record inventories all accepted material, inline or through verified links to its immutable originals in this PR's history. Later summaries publish only new material and explicit changes, not repeated accepted reports. The default remains a same-comment collapsed audit when no reusable record exists.

Read [the evaluator handoff and schema](./audit-publication.md) before publication, reuse, or recovery. Set `publicationEvaluator` to the installed sibling [audit-publication.mjs](./audit-publication.mjs); set `publicationInput`, `publicationPlan`, and `publicationReceipt` to private working files. These files are internal handoffs, never public replacement evidence.

1. **Before every post** (round, final, escalation, or delivery recovery), delegate a complete accepted-material inventory and current state under that schema. Fetch raw bodies for every referenced record and its dependencies through authenticated PR reads; verify PR/comment identity, original delivery actor and marker against receipts, not marker text alone. Run:

   ```bash
   node "$publicationEvaluator" plan "$publicationInput" > "$publicationPlan"
   ```

   Require exit zero and `ok=true`. Post the outcome-first visible summary plus the returned `audit` block inside `<details>`. First publication includes complete new material; unchanged material may be linked only after verification. Never post placeholders or truncate to fit a comment limit: if complete publication is impossible, report a publication/recovery gap.
2. **After posting**, fetch the exact comment's URL/ID and raw body into `publication`, refresh all `sources`, and run:

   ```bash
   node "$publicationEvaluator" recover "$publicationInput" > "$publicationReceipt"
   ```

   Accept a durable record only with exit zero, `ok=true`, `published=true`, and its returned receipt. Check actual signed commit contents, push/remote SHA, checks and current-head acceptance separately: published means audit available, not repair or delivery complete. Include the receipt in the complete internal handoff and the next state-changing record's operation item; never edit an old comment to add it.
3. **On resume or a delivery retry**, use authenticated paginated history to reconstruct the latest candidate's full inventory and prior snapshot, refetch its linked records, then run the same `recover` command **before** accepting counts, ledger, or delivery state. Reconcile against actual local/remote heads. Search by marker plus exact state and receipts; a marker can occur more than once in a round. Ambiguous history pauses for input, not an arbitrary selection.
4. **On any gap**, preserve the exact signed/local/remote/comment state and same counts. A failed or unknown post is not a receipt: reread history before retrying to avoid duplicates. Re-publish complete material only when recovered and authorized, otherwise tell the user what is missing and how to recover. Legacy comments without an evaluator block require independent full reconciliation and a new append-only baseline, not a claim of evaluator-verified recovery. Missing source bodies stay gaps.

This evaluator grants no edits, signing bypass, push or merge authority, new rounds, repair cycles, or outcome changes. Keep full internal caller handoffs. Signed delivery policy and the user's no-merge boundary remain unchanged.

## Visible summary contract

- State the outcome first: `verified`, `limited coverage`, or `escalated` for a final decision; `In progress` for a round summary.
- Put blockers, required human decisions, and deferred findings immediately below the outcome.
- Give finding counts, including unresolved investigations. Repair bullets carry stable IDs, fixing commits, and validation attribution. Enumerate actionable new or changed findings, blockers and deferrals; link unchanged repair details instead of repeating them. Keep report-only details audit-only, apart from an optional count.
- Report checks, including failures, pending/unknown/unavailable results, skips, and material caveats. Attribute fresh versus cached evidence to its source; never label unknown or unavailable checks as green. An unrelated or environmental failure is a material limitation, never a deferral.
- Keep material coverage/scope limitations visible; never move them into collapsed details.
- Show reviewed commit, `Rounds: n/3`, `Repair cycles: n`, and the delivered head when it differs from the reviewed head.
- Omit empty headings; retain their values in the audit.
- Aim for **150 words for a clean round**: a readability target, not a hard cap.

## Deferred findings

Deferred findings are repair-worthy *and* outside this PR's intended scope: follow-up work, not minor findings. A finding defers only when it meets the repair threshold and is outside that scope: either the diff neither introduced nor materially changed it and the originating issue/spec and triage decisions do not require it, or an external dependency or ticket blocks the repair.

Give each a stable ID, a one-line description, the file or area, why it was not repaired, and the ticket, decision, or measurement that unblocks it. Deferred findings stay in the visible summary because they are real follow-up work.

Report-only findings are recorded evidence, not work: keep them in the collapsed audit ledger with their evidence and disposition, and let them contribute at most one visible count. Never enumerate report-only findings in the visible summary or describe them as deferred.

Deferral is not ambiguity and not an escalation: it adds no round and never blocks a `limited coverage` finish.

## Collapsed audit contract

Include complete records in `<details>`:

- Collapsed audit details: Complete original Standards and Spec reports for every accepted round, including clean reports and explicit skips; later records may use verified stable links to those complete originals.
- The full finding ledger: every disposition — repaired, unresolved, regression, report-only, deferred — with resolution evidence and prior-ID reconciliation. Inventory every finding, retain unchanged entries by verified reference, and publish new findings or changed dispositions inline with explicit change notes. No prior finding silently disappears.
- Check commands/results at reviewed and delivered SHAs, fresh/cached provenance, skips with reasons, and evidence receipts. Local log paths and hashes appear only as non-public audit references, alongside actual results and limitations.
- Run identity, pinned refs and merge-base, reviewed/local/delivered SHAs, rounds used, repair cycles, per-ID failed-verification counts, delivery state and receipts.

Nothing is replaced by a digest, external storage, or local-file links. Every required item remains recoverable from this PR's durable comments: inline on first publication, then inline or by verified stable link with identity, head or accepted applicability, and availability checked at each publication/recovery boundary. Current accounting and exact operation/delivery state are always inline, including failed pushes, unknown posts, unavailable checks and the next recovery action. A missing or inaccessible record is a publication/recovery gap, never successful durable publication.

The examples below are presentation sketches. At publication, replace bracketed placeholders with the evaluator-generated audit block, containing the complete accepted inventory. Keep validation attribution and material limitations visible; the block and its verified references carry the original reports without repeating axis conclusions above it.

### Example: clean round

```markdown
<!-- pr-review-repair run=f0df981 round=1 kind=summary -->
## Review complete — verified, no repair-worthy findings

Standards and Spec reviewed the full PR diff `a1b2c3d..f0df981`. **No findings or unresolved investigations.** Discovery converged in round one; no further rounds run.

**Validation:** 525 tests passed, 1 skipped; format, lint, and typecheck passed. Nix acceptance used cached results matched to the reviewed source—not a fresh run.

**Scope:** migration distribution validation only; live workflows and cleanup/deletion were not exercised.

**Rounds:** 1/3 · **Repair cycles:** 0 · **Deferred:** none · **Human input:** none

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [axis report verbatim]

Complete original Spec report: [axis report verbatim]

Complete ledger: no findings.

[A] run=f0df981; pinned merge-base a1b2c3d; reviewed and delivered head f0df981;
rounds 1/3; repair cycles 0; checks: node tests, biome, tsc, nix flake check (cached
results matched to the reviewed source); no deferred findings; no incomplete-operation state
</details>
```

### Example: repaired round

```markdown
<!-- pr-review-repair run=a1b2c3d round=2 kind=summary -->
## In progress — round 1 repairs delivered

Round 1 found F-001 (blocker) and F-002 (significant). Both are repaired and delivered in `def5678`; round 2 review is pending at that head.

**Repairs:** F-001 rejects empty credentials before use (`abc1234`); F-002 enforces the retry cap with a regression test (`def5678`).

**Validation:** full suite passed at `def5678`; lint and typecheck from `abc1234` were accepted as cached evidence for unchanged sources. One optional check remained unavailable and is not counted as passing.

**Reviewed:** `abc1234` · **Delivered:** `def5678` · **Rounds:** 2/3 · **Repair cycles:** 1 · **Deferred:** none

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [round 1 report verbatim, or verified PR record URL and item identity]

Complete original Spec report: [round 1 report verbatim, or verified PR record URL and item identity]

Changed findings: F-001 and F-002 unresolved → repaired; new per-ID resolution evidence inline. Unchanged original reports are referenced only after successful evaluator checks.

Complete ledger: F-001 repaired `abc1234`, F-002 repaired `def5678`, no report-only findings.

[A] run=a1b2c3d; pinned merge-base a1b2c3d; rounds 2/3; repair cycles 1; delivery
receipts: commit `def5678`, push to PR head, comment posted; deferred: none
</details>
```

### Example: capped round

```markdown
<!-- pr-review-repair run=a1b2c3d round=3 kind=summary -->
## Review complete — limited coverage, repairs verified, 1 finding deferred

Discovery closed after round three. All four recorded findings are resolved and verified at `def5678`; required checks pass. One issue noticed during verification is a significant bug outside this PR's scope, recorded as a deferred follow-up.

**Deferred (repair-worthy, outside this PR's scope):**
- F-005 `extensions/permission/rules.ts`: an `allow` rule shadows a later `deny` rule when both match. Pre-existing and outside this diff; follow-up tracked in `PERM-12`.

**Repairs:** F-001 commit-subject injection (`abc1234`); F-002 retry cap (`abc1234`); F-003 missing directory-rename test (`def5678`); F-004 stale help text (`def5678`).

**Validation:** full suite passed at `def5678`; lint, typecheck, and format passed fresh. Nix acceptance was unavailable and is reported as a material limitation, not counted as passing.

**Rounds:** 3/3 · **Repair cycles:** 2 · **Deferred:** 1 · **Report-only:** 1 · **Scope:** full PR diff `a1b2c3d..def5678`; no fourth review round ran, so anything outside the recorded IDs is unreviewed.

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [round 3 report verbatim]

Complete original Spec report: [round 3 report verbatim]

Complete ledger: F-001..F-004 repaired and verified; F-005 deferred (verification-sourced, never repaired, repair-worthy and outside this PR's scope); F-006 report-only (hardening, no demonstrated consequence).

[A] run=a1b2c3d; pinned merge-base a1b2c3d; reviewed `abc1234`; delivered `def5678`;
rounds 3/3; repair cycles 2; checks: fresh lint/typecheck/format/tests, nix unavailable
(material limitation); deferred dispositions recorded; no incomplete-operation state
</details>
```

### Example: escalated round

```markdown
<!-- pr-review-repair run=a1b2c3d round=3 kind=escalation -->
## Escalated — F-002 fix needs a product decision

**Needs decision:** F-002 (retry cap) cannot be resolved without choosing between dropping the last retry and extending the backoff window; both change documented behavior in `extensions/notify-me/README.md`.

**Recovery action:** confirm which behavior is intended; the orchestrator then resumes the fix at `def5678` with no new review round.

**Validation:** suite green at `def5678` except the F-002 regression test added in `abc1234`, which fails by design until the decision lands.

**Rounds:** 3/3 · **Repair cycles:** 2 · **Deferred:** none · **Human input:** required

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [verified link and item identity if already published, otherwise round 3 report verbatim]

Complete original Spec report: [verified link and item identity if already published, otherwise round 3 report verbatim]

Complete ledger: F-001 repaired `abc1234`; F-002 awaiting human input; F-003 report-only.

Changed findings: F-002 now awaiting input; complete updated disposition and evidence inline. Unchanged reports and F-001/F-003 may reuse verified prior items; no new discovery.

[A] run=a1b2c3d; pinned merge-base a1b2c3d; rounds 3/3; repair cycles 2; incomplete-operation state: F-002 fix not delivered, worktree at `def5678`; recovery input: F-002
behavior decision
</details>
```

## Final response to the user

Return only the outcome, material limitations, deferred findings, required input, and verified record link:

```markdown
PR review/repair on <PR URL>: <verified | limited coverage | escalated>.
<Material limitations and deferred findings, if any.>
<Required human decision or recovery action, if any.>
Record: <verified PR comment link>
```

Keep the full reports/ledger in PR history and the internal handoff. If required publication failed, disclose the missing record, exact operation state, and recovery action; never invent a receipt or link.

- **Verified:** a review round converged with no repair-worthy findings, checks pass, and that round repaired and deferred nothing.
- **Limited coverage:** the discovery window closed with repairs; every open ID is resolved and verified, and any deferred findings are repair-worthy and outside the PR's scope.
- **Escalated:** a fix stalled or is blocked, human input is needed, or evidence/receipts are incomplete.
