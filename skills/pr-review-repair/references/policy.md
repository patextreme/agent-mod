# Repair policy

Use this reference during judgment, repair authorization, and in-attempt scope amendments.

## Repair threshold

- **Blocker:** evidenced material correctness, security, reliability, compatibility, or delivery risk; or breach of an explicit mandatory requirement. Cite the requirement or concrete risk; an architecture-boundary violation can qualify without runtime impact.
- **Significant bug:** evidenced requirement/contract deviation in a supported scenario with meaningful consequence. Require reproduction, a failing test, or convincing code-path evidence with trigger and consequence. Rare security/data-loss/credential failures and PR-caused build/test/delivery failures also qualify.
- **Repair-worthy:** a confirmed blocker or significant bug whose benefit justifies scope and risk. High-risk corrections require human input.
- **Report-only:** minor bugs, cosmetic/naming preferences, speculative hardening, and smells without material consequence. Cheapness alone does not justify repair.

Investigate uncertainty before editing. Established requirements and recorded decisions settle corrections; new product intent or consequential design requires human input. Preserve requirements, tests, unrelated work, and report-only items.

## In-attempt scope amendments

A repair-worthy finding discovered by the active attempt's own required validation may join that attempt without a new attempt when the correction stays within authorized intent (no new requirements, product behavior, public contract, security/custody policy, or consequential design choice), is not high-risk (gate-blocking alone does not make it high-risk), and accounting is unambiguous (one active verified repair-start, same run/round, no conflicting or duplicate reservation). Post and read-back verify an append-only scope amendment linked to the active repair-start before editing. The attempt count stays unchanged. Uncertain: escalate. A finding from fresh review or judgment belongs to the next repair cycle.
