# Repair policy

Apply during judgment, repair authorization, deferral decisions, and human-input decisions.

## Repair threshold

- **Blocker:** evidenced material correctness, security, reliability, compatibility, or delivery risk; or breach of an explicit mandatory requirement. Cite the requirement or concrete risk. A documented architecture-boundary violation can qualify without runtime impact.
- **Significant bug:** evidenced requirement/contract deviation in a supported scenario with meaningful consequence. Require reproduction, a failing test, or code-path evidence with trigger and consequence. Rare security, data-loss, and credential-verification failures qualify, as do PR-caused build/test/delivery failures and missing mandatory acceptance criteria.
- **Repair-worthy:** a confirmed blocker or significant bug whose benefit justifies scope and risk. High-risk corrections require human input rather than downgrading the finding.
- **Report-only:** minor bugs, cosmetic/naming preferences, speculative hardening, and smells without material consequence. Cheapness alone does not justify repair; allow refactoring only as needed for a qualifying correction. Report-only findings are recorded evidence: never repaired and never deferred.

Investigate uncertainty before editing. Preserve established requirements, tests, recorded decisions, unrelated work, and report-only items.

## Deferred findings

**Deferred** means repair-worthy *and* outside this PR's intended scope — follow-up work, not a severity. A finding qualifies only when both hold:

- It meets the repair threshold.
- It is outside the PR's intended scope: either the diff neither introduced nor materially changed it and the originating issue/spec and triage decisions do not require it, or an external dependency or ticket explicitly blocks the repair.

Each deferred entry names the ticket, decision, or measurement that unblocks it. A required decision is required input, not deferral. A repair-worthy finding the PR owns is never deferred: inside the window it is repaired; after the window it stays open and escalates.

## Closed discovery

Discovery closes after round three. From then on, repair only IDs already open and classify everything else under Report contracts. A correction may deepen or narrow its own ID; it may not add a new one, and it never reopens review.

In scope during verification:

- The open ID is still unresolved, or its fix is incomplete.
- The repair broke a caller, dependency, test, or required check it touched.
- A previously resolved ID regressed.
- A required check fails because of the repair.

Deferred, never repaired after the window — only repair-worthy work outside this PR's intended scope:

- A confirmed blocker or significant bug the diff neither introduced nor materially changed and the PR does not require.
- Repair-worthy work blocked on an external dependency or ticket.

A newly noticed finding below the repair threshold is report-only, never deferred. An unrelated or environmental check failure is a material limitation on the evidence, never deferred work.

Deferred findings are posted, never silently dropped and never converted into another review round. Deferral is a recording decision, not a human-input branch.

## Human input

Pause for the user's decision when a correction needs new product intent, new requirements, consequential design, architecture or public-contract changes, security or custody policy changes, or high-risk work; when identity/history/accounting is ambiguous; when prerequisites are missing; or when verification shows an open ID cannot be resolved within the authorized scope. Established requirements and decisions settle in-scope corrections without new authorization. Investigate uncertain eligibility; if it remains uncertain, escalate rather than edit.
