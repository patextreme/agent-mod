# PR review and repair control flow

Use this loop as the control-flow source of truth. `SKILL.md` defines preparation, shared guards, thresholds, and stage contracts; `report-contracts.md` defines findings, the durable PR records' visible summary plus collapsed audit layers, and the concise final user response. [Review scope](./review-scope.md) defines full/delta eligibility, invalidation, reviewer inputs, and evidence reuse. Delegate each stage and boundary check to subagents; the orchestrator accepts evidence and decides transitions. Concise reporting never removes the underlying evidence: complete reports, ledger, receipts, and exact operation state stay in the PR records and accepted evidence.

```text
contract = PREPARE requested PR; load paginated history and report contracts;
          load the originating issue/spec when the invocation supplies it
          (requirements evidence)
IF preparation is blocked:
  PAUSE with exact required input
IF an authorized attempt is incomplete:
  RECONCILE and FINISH only that attempt before reviewing
  A repair-worthy blocker discovered by that attempt's own required validation is part of
    finishing it; add it with SCOPE-AMENDMENT
  IF recovery needs product/design/security/high-risk input or accounting is ambiguous:
    ESCALATE
  IF recovery is blocked or unavailable for any other reason:
    ESCALATE

RECOVER accepted coverage chain from verified history, or mark coverage absent
mode = FULL initially, after invalidation, or when repairs used >= 10;
       otherwise DELTA only for an eligible unreviewed repair delivery on resume
       (use the eligibility rules in review-scope.md)

LOOP:
  GUARD expected phase-specific git/PR state and revalidate review inputs
  IF incremental coverage is invalid: mode = FULL under reconciled contract
  review = REVIEW selected mode with fresh, history-free context
  INCREMENT review round count
  IF DELTA impact cannot be bounded:
    RECORD insufficient delta scope; mode = FULL; CONTINUE without accepting coverage
  IF review is incomplete: ESCALATE

  GUARD expected state
  judgment = JUDGE current reports and complete prior ledger/history
  INVESTIGATE uncertain classifications
  ACCEPT evidence and confirm every prior actionable ID is accounted for
  IF judgment is incomplete or uncertainty remains: ESCALATE
  IF a finding implies new requirements or a consequential design change:
    ESCALATE for user authorization instead of editing the change's intent

  ACCEPT coverage at reviewed head; update last reviewed SHA and, for FULL, last full-review SHA

  IF no repair-worthy findings:
    IF mode == DELTA:
      POST and VERIFY intermediate summary with complete reports, judgment, and coverage chain
      IF recording fails: ESCALATE
      mode = FULL (final); CONTINUE at the same unchanged head
    VERIFY completion gates from SKILL.md, including FULL review/judgment at current head
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
  repair = REPAIR authorized findings and run checks
  VALIDATE actual changes independently and complete required checks
  IF an in-scope repair-worthy finding discovered by this attempt's own required validation
     can be added:
    SCOPE-AMENDMENT
    REPEAT repair/validation for the amended scope
  IF repair or validation is blocked/incomplete: ESCALATE

  GUARD expected state
  delivery = DELIVER authorized signed commits, push, and summary comment
  VERIFY all delivery receipts and update ledger/history
  IF delivery is incomplete: ESCALATE
  mode = DELTA if coverage remains eligible and repairs used < 10, otherwise FULL
  CONTINUE at delivered head

SCOPE-AMENDMENT:
  REQUIRES one active verified repair-start and unambiguous run/round accounting
  ADDS a repair-worthy finding discovered by the active attempt's own required validation
  REQUIRES correction stays within authorized intent; no new requirements, product behavior,
    public contract, security/custody policy, or consequential design or architecture change; not high-risk
  POST and VERIFY append-only scope-amendment record before editing
  KEEPS repairs used unchanged (not a new reservation)
  IF any condition is uncertain: ESCALATE instead

ESCALATE:
  PRESERVE safe work, ledger, reserved count, and exact operation state
  POST and VERIFY escalation record when possible
  REPORT missing receipts/history directly if recording fails
  REPORT a concise escalation summary, the posted record link, and the
    specific human decision/recovery action; PAUSE
  DO NOT escalate a mechanical scope amendment or another orchestrator-owned action;
    record it and continue
```

Resume explicitly with the user's answer and reconciled state. Retries complete the same reserved attempt; an in-attempt scope amendment does not consume a reservation; a new review/repair cycle consumes a new reservation. The final full review after attempt ten can establish success or escalation, never authorize repair eleven. A final full review with repair-worthy findings before the limit returns through the normal repair branch, then delta review and another final full review; a clean initial full review can finish without a redundant second review.
