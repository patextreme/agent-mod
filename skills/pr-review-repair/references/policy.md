# Repair policy

Apply during judgment, repair authorization, scope amendments, and human-input decisions.

## Intent grounding

Ground every finding against the pinned intent contract from [Preparation](./prepare.md): required outcomes from the originating issue/spec plus the PR's declared scope and non-goals.

- **In-intent:** cites a required outcome or acceptance criterion, an explicit PR scope item, a mandatory standard applied to changed code, or a regression this PR caused or worsened. Only in-intent findings can enter the actionable queue.
- **Deferred:** a material improvement, hardening, refactor, pre-existing defect, or explicit non-goal with no PR-intent grounding. Record its intrinsic severity, the missing grounding, and a suggested follow-up. Deferred findings never authorize edits, repair-start IDs, or scope amendments, and never block completion.

Deferred is terminal: reconcile a recurrence against the same ID as still deferred, never refile it. If the concern becomes in-scope later, file a new open finding. A pre-existing concern this PR makes reachable or worse is PR-caused and in-intent.

An **overarching** correction changes behavior, contracts, architecture, dependencies, or files beyond what the PR's stated intent requires, or cannot be bounded to the PR's changed behavior. An in-intent finding whose only viable correction is overarching does not expand the PR: defer it when its consequence permits; when it blocks the PR's stated intent, escalate a scope decision.

## Repair threshold

- **Blocker:** evidenced material correctness, security, reliability, compatibility, or delivery risk; or breach of an explicit mandatory requirement. Cite the requirement or concrete risk. A documented architecture-boundary violation can qualify without runtime impact.
- **Significant bug:** evidenced requirement/contract deviation in a supported scenario with meaningful consequence. Require reproduction, a failing test, or code-path evidence with trigger and consequence. Rare security, data-loss, and credential-verification failures qualify, as do PR-caused build/test/delivery failures and missing mandatory acceptance criteria.
- **Repair-worthy:** a confirmed in-intent blocker or significant bug whose benefit justifies scope and risk. High-risk corrections require human input rather than downgrading the finding.
- **Report-only:** in-intent minor bugs, cosmetic/naming preferences, speculative hardening, and smells without material consequence. Cheapness alone does not justify repair; allow refactoring only as needed for a qualifying correction.

Investigate uncertainty before editing. Preserve established requirements, tests, recorded decisions, unrelated work, and report-only/deferred items.

## In-attempt scope amendments

Add a finding to the active attempt only when all conditions hold:

- It is in-intent, repair-worthy, and discovered by that attempt's own required validation.
- Correction stays within authorized intent: no new requirements, product behavior, public contract, security/custody policy, or consequential design or architecture change.
- Correction is not high-risk; gate-blocking alone does not make it high-risk.
- Accounting is unambiguous: one active verified repair-start, same run/round, no conflicting or duplicate reservation.

Post and read-back verify an append-only scope amendment linked to the active repair-start before editing. The attempt count stays unchanged. Record eligible amendments and continue as an orchestrator-owned action. Findings from fresh full/delta review or judgment start the next repair cycle; post-delivery delta review cannot retroactively amend a reservation.

## Human input

Pause for the user's decision when an in-scope correction needs new product intent, new requirements, other consequential design, architecture or public-contract changes, security/custody policy changes, or high-risk work; when identity/history/accounting is ambiguous; when prerequisites are missing; or when a correction fails the in-attempt amendment conditions. A non-blocking overarching correction of an in-intent finding is not a pause: defer and record it while the attempt or review continues, and escalate a scope decision when it blocks the PR's stated intent. Out-of-scope product/design needs are not human-input branches either: defer non-blocking ones, and escalate a scope decision when one blocks the PR's stated intent. A missing or ambiguous PR intention still pauses for reconciliation or limited coverage. Established requirements and decisions settle in-scope corrections without new authorization. Investigate uncertain eligibility; if it remains uncertain, escalate rather than edit.
