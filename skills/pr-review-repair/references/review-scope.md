# Review scope and evidence reuse

Use this contract when selecting a review scope, briefing reviewers, accepting coverage, or resuming. [The pseudocode](./pseudocode.md) owns transitions; this file owns coverage eligibility and invalidation.

## Full and delta reviews

- **Full:** review the entire PR diff from the pinned merge-base to the current head, including all repairs. Start with a full review. A clean full review/judgment at the unchanged current head is the final review too; an initially clean PR needs only one review.
- **Delta:** after delivery, review changes from the last accepted reviewed SHA to the current head, plus affected surrounding code, callers, dependencies, tests, and contracts. Expand scope until the impact is bounded; changed lines alone are insufficient. Keep the last full-review SHA separately from the last reviewed SHA.
- **Final:** after a clean delta review/judgment, run a fresh full review/judgment at that same head before finishing. A final full review that finds repair-worthy issues returns to repair, then delta review, then another final full review. After attempt ten, go directly to the final full review/judgment; it can establish success or escalation, never authorize attempt eleven.

Both scopes use parallel Standards and Spec axes and fresh, read-only, history-free reviewers. Supply identity, instructions, clean source material, pinned refs, explicit scope/range, and current head. The final reviewers receive no earlier reports or repair rationale. The history-aware judge separately reconciles every prior actionable ID against current code/checks, including IDs outside the delta. A clean delta establishes only incremental coverage, never whole-PR verification.

For a delta, tell the `code-review` delegate explicitly to replace its usual fixed-point/three-dot diff with `git diff <last-reviewed-sha> <current-head> --` and `git log <last-reviewed-sha>..<current-head> --oneline`. Verify ancestry first; pin both SHAs rather than using a moving `HEAD`. Retain its two-axis method and required sources, but assess existing requirements within the delta's impact rather than treating unchanged PR work as missing. For a full review, retain the full PR comparison against the pinned base/merge-base. Report complete axis outputs and any expanded scope or uncertainty.

## Eligibility and invalidation

Accept a delta only when all of these are evidenced:

- A complete full review/judgment and the intervening accepted review/judgment chain are recoverable with their exact SHAs, ranges, sources, and reports.
- The last reviewed SHA is an ancestor of the current head, and all intervening changes belong to verified, authorized repair deliveries in this run.
- PR identity, pinned base/merge-base, requirements, standards, project instructions, and required-check definitions are unchanged.
- Repair impact can be confidently bounded by inspecting affected code and contracts.

Missing coverage evidence, an unexpected commit, changed review inputs, rewritten history, or unbounded/cross-cutting impact invalidates incremental coverage. Reconcile unexpected state under the shared guards first; then select a full review under the accepted current contract, without resetting the ledger or repair budget. If a delta reviewer cannot bound impact, mark the delta insufficient and widen to a full review before accepting judgment or authorizing another repair. An actual unresolved requirement or risk still requires investigation or escalation; widening is not a substitute for resolving uncertainty.

On resume, recover and verify coverage from PR audit records after reconciling unfinished operations. Older records lacking scope/chain evidence require a full review, not an inferred delta baseline. A review becomes an accepted baseline only after complete reports and judgment are accepted; a delivered repair alone never advances the reviewed SHA.

## Reuse without skipping guards

Reuse resolved preparation results (source locations/content fingerprints, pinned refs, check definitions) while their inputs remain unchanged. Recheck git/PR state and refresh relevant history at stage boundaries; revalidate source discovery and fingerprints, including added or removed requirements/standards files. Refresh preparation when inputs change. Reuse is not permission for a reviewer to skip a required source.

Check evidence may be reused only when it is demonstrably valid for the exact current source, configuration, dependencies, and relevant environment required by that check. Record its original SHA, command, result, inputs, and acceptance rationale. A changed head is not automatically eligible: rerun affected checks and every required check without demonstrably matching evidence. In particular, delta review never replaces required quality gates. At an unchanged head, a final full review may reuse valid check evidence from the delta pass, while performing a new independent code review.
