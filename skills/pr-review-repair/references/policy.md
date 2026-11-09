# Repair policy

Apply during judgment, repair authorization, scope amendments, and human-input decisions.

## Repair threshold

- **Blocker:** evidenced material correctness, security, reliability, compatibility, or delivery risk; or breach of an explicit mandatory requirement. Cite the requirement or concrete risk. A documented architecture-boundary violation can qualify without runtime impact.
- **Significant bug:** evidenced requirement/contract deviation in a supported scenario with meaningful consequence. Require reproduction, a failing test, or code-path evidence with trigger and consequence. Rare security, data-loss, and credential-verification failures qualify, as do PR-caused build/test/delivery failures and missing mandatory acceptance criteria.
- **Repair-worthy:** a confirmed blocker or significant bug whose benefit justifies scope and risk. High-risk corrections require human input rather than downgrading the finding.
- **Report-only:** minor bugs, cosmetic/naming preferences, speculative hardening, and smells without material consequence. Cheapness alone does not justify repair; allow refactoring only as needed for a qualifying correction.

Investigate uncertainty before editing. Preserve established requirements, tests, recorded decisions, unrelated work, and report-only items.

## In-attempt scope amendments

Add a finding to the active attempt only when all conditions hold:

- It is repair-worthy and discovered by that attempt's own required validation.
- Correction stays within authorized intent: no new requirements, product behavior, public contract, security/custody policy, or consequential design or architecture change.
- Correction is not high-risk; gate-blocking alone does not make it high-risk.
- Accounting is unambiguous: one active verified repair-start, same run/round, no conflicting or duplicate reservation.

Post and read-back verify an append-only scope amendment linked to the active repair-start before editing. The attempt count stays unchanged. Record eligible amendments and continue as an orchestrator-owned action. Findings from fresh full/delta review or judgment start the next repair cycle; post-delivery delta review cannot retroactively amend a reservation.

## Human input

Pause for the user's decision when a correction needs new product intent, new requirements, consequential design, architecture or public-contract changes, security/custody policy changes, or high-risk work; when identity/history/accounting is ambiguous; when prerequisites are missing; or when a correction fails the in-attempt amendment conditions. Established requirements and decisions settle in-scope corrections without new authorization. Investigate uncertain eligibility; if it remains uncertain, escalate rather than edit.
