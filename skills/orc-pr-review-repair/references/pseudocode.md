# PR review and repair control flow

Use this loop as the control-flow source of truth. `SKILL.md` defines preparation, shared guards, thresholds, and stage contracts; `report-contracts.md` defines findings, the durable PR records' visible summary plus collapsed audit layers, and the concise final user response. Delegate each stage and boundary check to subagents; the orchestrator accepts evidence and decides transitions. Concise reporting never removes the underlying evidence: complete reports, ledger, receipts, and exact operation state stay in the PR records and accepted evidence.

```text
contract = PREPARE requested PR; load paginated history and report contracts
IF preparation is blocked:
  PAUSE with exact required input
IF an authorized attempt is incomplete:
  RECONCILE and FINISH only that attempt before reviewing
  IF recovery is blocked: ESCALATE

LOOP:
  GUARD expected phase-specific git/PR state
  review = REVIEW full PR diff with fresh, history-free context
  INCREMENT review round count
  IF review is incomplete: ESCALATE

  GUARD expected state
  judgment = JUDGE current reports and complete prior ledger/history
  INVESTIGATE uncertain classifications
  ACCEPT evidence and confirm every prior actionable ID is accounted for
  IF judgment is incomplete or uncertainty remains: ESCALATE

  IF no repair-worthy findings:
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
  repair = REPAIR authorized findings and run checks
  VALIDATE actual changes independently and complete required checks
  IF repair or validation is blocked/incomplete: ESCALATE

  GUARD expected state
  delivery = DELIVER authorized signed commits, push, and summary comment
  VERIFY all delivery receipts and update ledger/history
  IF delivery is incomplete: ESCALATE
  CONTINUE at delivered head

ESCALATE:
  PRESERVE safe work, ledger, reserved count, and exact operation state
  POST and VERIFY escalation record when possible
  REPORT missing receipts/history directly if recording fails
  REPORT a concise escalation summary, the posted record link, and the
    specific human input/recovery action; PAUSE
```

Resume explicitly with the user's answer and reconciled state. Retries complete the same reserved attempt; a new review/repair cycle consumes a new reservation. The final review after attempt ten can establish success or escalation, never authorize repair eleven.
