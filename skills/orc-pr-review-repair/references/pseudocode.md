# PR review and repair control flow

Use this loop as the control-flow source of truth. `SKILL.md` defines preparation, shared guards, thresholds, and stage contracts; `report-contracts.md` defines findings and durable PR records. Delegate each stage and boundary check to subagents; the orchestrator accepts evidence and decides transitions.

```text
contract = PREPARE requested PR; load paginated history and report contracts
IF optional archived-source context is supplied:
  READ archived-intent.md; CONFIRM target/path/inventory/main specs against branch/outgoing diff
  BUILD clean archived requirements sources for review and both nested axes
  KEEP prior reports/repair summaries/history only in judge/accounting inputs
  IF required evidence is missing: PAUSE or obtain explicit limited-coverage authorization
IF preparation is blocked:
  PAUSE with exact required input
IF prior records or caller indicate interrupted operations:
  READ continuation.md; DELEGATE actual-state/full-history reconciliation
  RECOVER same run/ledger and verified reserved count, not a fresh budget
IF an authorized attempt is incomplete:
  RECONCILE code/archive/main-spec edits and FINISH only that attempt before reviewing
  REUSE verified commits/pushes/comments; complete only missing validation/delivery/history
  At attempt ten: finish that reservation, then final review/judgment only; no repair eleven
  IF recovery is blocked: ESCALATE

LOOP:
  GUARD expected phase-specific git/PR state
  review = REVIEW full PR diff with fresh, history-free context
    IF archived sources: READ resolved artifacts/main specs directly, no active-change commands
  INCREMENT review round count
  IF review is incomplete: ESCALATE

  GUARD expected state
  judgment = JUDGE current reports and complete prior ledger/history
  INVESTIGATE uncertain classifications
  ACCEPT evidence and confirm every prior actionable ID is accounted for
  IF archived sources and material correction proposed:
    CLASSIFY code-only OR behavior-affecting within approved intent OR new consequential intent
    REQUIRE approved-intent citations and code/archive/main-spec mapping
    IF new intent or uncertain authority: ESCALATE for scoped user decision before edits
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
    IF archived sources:
      KEEP archive in place; no reopen/rearchive/full-lifecycle replay
      Code-only: ESTABLISH alignment; document evidence-backed bookkeeping only if needed
      Behavior-affecting: RECONCILE affected archived documents/main specs or justify unchanged
      PRESERVE unaffected requirements/scenarios and mandatory test expectations
  VALIDATE actual changes independently and complete required checks
    IF archived sources: REQUIRE code/archive/main-spec evidence and affected form/coherence validation
      USE resolved files or disposable copies for validation, never move the real archive
  IF repair or validation is blocked/incomplete: ESCALATE

  GUARD expected state
  delivery = DELIVER authorized signed commits, push, and summary comment
  VERIFY all delivery receipts and update ledger/history
  IF delivery is incomplete: ESCALATE
  INVALIDATE previous head-bound review/validation/final gates after fixing commits
  CONTINUE at delivered head with fresh full-diff review and current affected validation

ESCALATE:
  PRESERVE safe work, ledger, reserved count, and exact operation state
  POST and VERIFY escalation record when possible
  REPORT missing receipts/history directly if recording fails
  REPORT evidence and specific human input/recovery action; PAUSE
```

Resume explicitly with the user's answer and reconciled state. Retries complete the same reserved attempt; a new review/repair cycle consumes a new reservation. The final review after attempt ten can establish success or escalation, never authorize repair eleven.
