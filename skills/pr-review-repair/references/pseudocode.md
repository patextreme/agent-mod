# PR review and repair control flow

This is the transition authority. Delegate stages and boundary checks; the orchestrator accepts evidence and selects transitions.

- [SKILL.md](../SKILL.md): stage contracts, shared guards, completion gates.
- [Preparation](./prepare.md): sticky run contract and reconciled state.
- [Review scope](./review-scope.md): reviewer inputs, delta eligibility, evidence reuse.
- [Repair policy](./policy.md): intent grounding, deferred findings, threshold, amendment eligibility, human decisions.
- [Report contracts](./report-contracts.md): complete reports/ledger, visible summary plus collapsed audit layers, receipts, and final response.

```text
contract = PREPARE requested PR with requirements/standards, pinned intent contract, and paginated history
IF preparation is blocked: PAUSE with exact required input
IF an authorized attempt is incomplete:
  RECONCILE and FINISH only that attempt before reviewing
  USE SCOPE-AMENDMENT for eligible findings from its required validation
  IF recovery is blocked, unavailable, or needs human input: ESCALATE

RECOVER accepted coverage chain from verified history, or mark coverage absent
mode = FULL
IF resuming an eligible unreviewed repair delivery AND repairs used < 10:
  mode = DELTA

LOOP:
  GUARD expected phase-specific git/PR state and revalidate review inputs
  IF delta eligibility is invalid: mode = FULL under reconciled contract
  review = REVIEW selected mode with fresh, history-free context
  INCREMENT review round count
  IF DELTA impact cannot be bounded:
    RECORD insufficient scope; mode = FULL; CONTINUE without accepting coverage
  IF review is incomplete: ESCALATE

  GUARD expected state
  judgment = JUDGE current reports, pinned intent contract, and complete prior ledger/history
  GROUND each finding as in-intent actionable, report-only, or deferred
  IF an in-intent finding's only viable correction is overarching:
    DEFER it when its consequence permits; ESCALATE a scope decision when it blocks the PR's stated intent
  INVESTIGATE uncertain classifications and intent grounding
  ACCEPT reports/judgment only with every prior actionable and deferred ID accounted for
  IF judgment is incomplete OR uncertainty remains OR policy requires human input:
    ESCALATE
  ACCEPT coverage; update last reviewed SHA and, for FULL, last full-review SHA

  IF no repair-worthy findings:
    RECORD deferred findings in the ledger and report
    IF mode == DELTA:
      POST and VERIFY intermediate summary with complete reports, judgment, and coverage chain
      IF recording fails: ESCALATE
      mode = FULL (final); CONTINUE at the same unchanged head
    VERIFY completion gates from SKILL.md
    IF any gate fails: ESCALATE
    POST and VERIFY final PR decision and history receipt
    IF recording fails: ESCALATE
    FINISH with verified or explicitly authorized limited coverage

  IF repairs used >= 10 OR correction is unsafe/blocked OR progress stalled:
    ESCALATE
  GUARD expected state
  POST and VERIFY repair-start reserving repairs used + 1
  IF reservation is unverified: ESCALATE before edits
  INCREMENT repairs used
  repair = REPAIR authorized in-intent findings and run checks
  VALIDATE actual changes independently and complete required checks
  IF this attempt's required validation finds an in-intent finding whose only viable correction is overarching:
    DEFER it when its consequence permits; RECORD it and CONTINUE the attempt without editing; ESCALATE a scope decision when it blocks the PR's stated intent
  WHILE this attempt's required validation finds an eligible additional finding:
    SCOPE-AMENDMENT
    REPEAT repair/validation for the amended scope
  IF repair or validation is blocked/incomplete: ESCALATE

  GUARD expected state
  delivery = DELIVER authorized signed commits, push, and summary comment
  VERIFY all delivery receipts and update ledger/history
  IF delivery is incomplete: ESCALATE
  mode = DELTA if eligible and repairs used < 10, otherwise FULL
  CONTINUE at delivered head

SCOPE-AMENDMENT:
  REQUIRE the finding is in-intent, non-overarching, and meets all amendment conditions from repair policy
  IF eligibility is uncertain: ESCALATE
  POST and VERIFY append-only scope-amendment linked to active repair-start before editing
  KEEPS repairs used unchanged

ESCALATE:
  PRESERVE safe work, ledger, reserved count, and exact operation state
  POST and VERIFY escalation record when possible
  REPORT missing receipts/history directly if recording fails
  REPORT concise escalation summary, verified record link, and specific
    human decision/recovery action; PAUSE until answer and state reconciliation
```

A clean initial full review can finish directly. Findings in any full review, including final review, fall through to repair when budget permits; the delivered changes then follow the same scope-selection branch. After attempt ten that branch selects full review: success or escalation, never repair eleven. Retries/resumes complete the same reservation; eligible amendments are orchestrator-owned work, not human-input branches, and an in-intent finding from validation whose only viable correction is overarching is deferred when its consequence permits rather than pausing for input. Deferred findings never authorize repair and remain terminal across resumes; a concern that becomes in-scope again is a new open finding.
