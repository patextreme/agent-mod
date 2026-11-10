# Report contracts

Read before posting records and before composing the final response. [Control flow](./pseudocode.md) owns timing; this contract owns content.

Keep PR history append-only: post a new comment, never rewrite an earlier one. Every record carries its identity marker on its first line:

```html
<!-- pr-review-repair run=<initial-head-sha> round=<n> kind=<summary|escalation> -->
```

`kind=summary` covers round summaries and the final decision; `kind=escalation` covers pauses. Post and read-back verify every record. If posting fails, report the unrecorded state directly to the user; never invent a receipt or link.

## Visible summary contract

- State the outcome first: `verified`, `limited coverage`, or `escalated` for a final decision; `In progress` for a round summary.
- Put blockers, required human decisions, and deferred findings immediately below the outcome.
- Give finding counts, including unresolved investigations. Repair bullets carry stable IDs, fixing commits, and validation attribution.
- Report checks, including failures, pending/unknown/unavailable results, skips, and material caveats. Attribute fresh versus cached evidence to its source; never label unknown or unavailable checks as green.
- Keep material coverage/scope limitations visible; never move them into collapsed details.
- Show reviewed commit, `Rounds: n/3`, `Repair cycles: n`, and the delivered head when it differs from the reviewed head.
- Omit empty headings; retain their values in the audit.
- Aim for **150 words for a clean round**: a readability target, not a hard cap.

## Deferred findings

After the discovery window closes, new issues are deferred, not repaired. Give each a stable ID, a one-line description, the file or area, and why it was not repaired (usually "not repaired in this run"). Deferred findings stay in the visible summary because a reader deciding whether to merge needs them.

Deferral is not ambiguity and not an escalation: it changes no count, adds no round, and never blocks a `limited coverage` finish.

## Collapsed audit contract

Include complete records in `<details>`:

- Collapsed audit details: Complete original Standards and Spec reports for each round that produced findings, explicit skips, or durable links to previously posted complete reports.
- The full finding ledger: every disposition — repaired, unresolved, regression, report-only, deferred — with resolution evidence and prior-ID reconciliation.
- Check commands/results at reviewed and delivered SHAs, fresh/cached provenance, skips with reasons, and evidence receipts. Local log paths and hashes appear only as non-public audit references, alongside actual results and limitations.
- Run identity, pinned refs and merge-base, reviewed/local/delivered SHAs, rounds used, repair cycles, per-ID failed-verification counts, delivery state and receipts.

Nothing is replaced by a digest, external storage, or local-file links. Keep every record recoverable from the comment itself.

### Example: clean round

```markdown
<!-- pr-review-repair run=f0df981 round=1 kind=summary -->
## Review complete — no repair-worthy findings

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

Complete original Standards report: [round 1 report verbatim, linkable if posted]

Complete original Spec report: [round 1 report verbatim, linkable if posted]

Complete ledger: F-001 repaired `abc1234`, F-002 repaired `def5678`, no report-only findings.

[A] run=a1b2c3d; pinned merge-base a1b2c3d; rounds 2/3; repair cycles 1; delivery
receipts: commit `def5678`, push to PR head, comment posted; deferred: none
</details>
```

### Example: capped round

```markdown
<!-- pr-review-repair run=a1b2c3d round=3 kind=summary -->
## Review complete — limited coverage, repairs verified, 2 findings deferred

Discovery closed after round three. All four recorded findings are resolved and verified at `def5678`; required checks pass. Two issues noticed during verification were deferred because no review round remains.

**Deferred (not repaired in this run):**
- F-005 `extensions/permission/rules.ts`: an `allow` rule shadows a later `deny` rule when both match. Precedence needs a product decision.
- F-006 `extensions/notify-me/index.ts`: retry backoff ignores `Retry-After`. Hardening only; no demonstrated consequence.

**Repairs:** F-001 commit-subject injection (`abc1234`); F-002 retry cap (`abc1234`); F-003 missing directory-rename test (`def5678`); F-004 stale help text (`def5678`).

**Validation:** full suite passed at `def5678`; lint, typecheck, and format passed fresh. Nix acceptance was unavailable and is not counted as passing.

**Rounds:** 3/3 · **Repair cycles:** 2 · **Deferred:** 2 · **Scope:** full PR diff `a1b2c3d..def5678`; no fourth review round ran, so anything outside the recorded IDs is unreviewed.

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [round 3 report verbatim]

Complete original Spec report: [round 3 report verbatim]

Complete ledger: F-001..F-004 repaired and verified; F-005, F-006 deferred (verification-sourced, never repaired); no report-only findings.

[A] run=a1b2c3d; pinned merge-base a1b2c3d; reviewed `abc1234`; delivered `def5678`;
rounds 3/3; repair cycles 2; checks: fresh lint/typecheck/format/tests, nix unavailable;
deferred dispositions recorded; no incomplete-operation state
</details>
```

### Example: escalated round

```markdown
<!-- pr-review-repair run=a1b2c3d round=3 kind=escalation -->
## Escalated — F-002 fix needs a product decision

**Needs decision:** F-002 (retry cap) cannot be resolved without choosing between dropping the last retry and extending the backoff window; both change documented behavior in `extensions/notify-me/README.md`.

**Recovery action:** confirm which behavior is intended; the orchestrator then resumes the fix at `def5678` with no new review round.

**Validation:** suite green at `def5678` except the F-002 regression test added in `abc1234`, which fails by design until the decision lands.

**Rounds:** 3/3 · **Repair cycles:** 2 · **Deferred:** 1 · **Human input:** required

<details>
<summary>Full reports and audit details</summary>

Complete original Standards report: [round 3 report verbatim]

Complete original Spec report: [round 3 report verbatim]

Complete ledger: F-001 repaired `abc1234`; F-002 awaiting human input; F-003 deferred.

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

- **Verified:** a review round converged with no repair-worthy findings, checks pass, nothing deferred.
- **Limited coverage:** the discovery window closed with repairs; every open ID is resolved and verified, and any deferred findings are listed.
- **Escalated:** a fix stalled or is blocked, human input is needed, or evidence/receipts are incomplete.
