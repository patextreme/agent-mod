# Repair policy

Apply during judgment, repair authorization, deferral decisions, and human-input decisions.

## Repair threshold

- **Blocker:** evidenced material correctness, security, reliability, compatibility, or delivery risk; or breach of an explicit mandatory requirement. Cite the requirement or concrete risk. A documented architecture-boundary violation can qualify without runtime impact.
- **Significant bug:** evidenced requirement/contract deviation in a supported scenario with meaningful consequence. Require reproduction, a failing test, or code-path evidence with trigger and consequence. Rare security, data-loss, and credential-verification failures qualify, as do PR-caused build/test/delivery failures and missing mandatory acceptance criteria.
- **Repair-worthy:** a confirmed blocker or significant bug whose benefit justifies scope and risk. High-risk corrections require human input rather than downgrading the finding.
- **Report-only:** minor bugs, cosmetic/naming preferences, speculative hardening, and smells without material consequence. Cheapness alone does not justify repair; allow refactoring only as needed for a qualifying correction. After the window closes, report-only findings are deferred rather than fixed.

Investigate uncertainty before editing. Preserve established requirements, tests, recorded decisions, unrelated work, and report-only items.

## Closed discovery

Discovery closes after round three. From then on, repair only IDs already open and defer everything else. A correction may deepen or narrow its own ID; it may not add a new one, and it never reopens review.

In scope during verification:

- The open ID is still unresolved, or its fix is incomplete.
- The repair broke a caller, dependency, test, or required check it touched.
- A previously resolved ID regressed.
- A required check fails because of the repair.

Deferred, never repaired after the window:

- Any newly noticed bug, smell, requirement gap, or hardening idea.
- A failing check the repair did not cause.
- Work needing new requirements, product behavior, a public contract, or an architecture change.

Deferred findings are posted, never silently dropped and never converted into another review round. Deferral is a recording decision, not a human-input branch.

## Human input

Pause for the user's decision when a correction needs new product intent, new requirements, consequential design, architecture or public-contract changes, security or custody policy changes, or high-risk work; when identity/history/accounting is ambiguous; when prerequisites are missing; or when verification shows an open ID cannot be resolved within the authorized scope. Established requirements and decisions settle in-scope corrections without new authorization. Investigate uncertain eligibility; if it remains uncertain, escalate rather than edit.
