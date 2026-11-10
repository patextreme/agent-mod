# PR review and repair control flow

This is the transition authority. Delegate stages and boundary checks; the orchestrator accepts evidence and selects transitions.

- [SKILL.md](../SKILL.md): stage contracts, shared guards, finish outcomes.
- [Preparation](./prepare.md): sticky run contract and reconciled state.
- [Review scope](./review-scope.md): reviewer brief, the three-round window, verifier brief.
- [Repair policy](./policy.md): threshold, deferral, human decisions.
- [Report contracts](./report-contracts.md): visible summary plus collapsed audit layers, receipts, and final response.

```text
contract = PREPARE requested PR with requirements/standards and paginated history
IF preparation is blocked: PAUSE with exact required input
IF an authorized repair is incomplete: RECONCILE and FINISH only that repair

RECOVER rounds used, repair cycles, open IDs, deferred IDs, and last delivered SHA from PR records
rounds = rounds used
window = 3
open = recorded unresolved repair-worthy IDs
deferred = recorded deferred IDs
stalled = 0
verification_failures = per-ID failed verification counts, recovered from PR records
repair_cycles = recorded repair cycles
# One repair cycle is one REPAIR -> DELIVER iteration, counted when repair starts.

LOOP:
  GUARD expected phase-specific git/PR state; recheck sources and required checks

  IF rounds < window:
    rounds = rounds + 1
    review = REVIEW the full PR diff, merge-base..current head, fresh history-free context
    IF review is incomplete: ESCALATE
    judgment = JUDGE current reports against the complete ledger
    INVESTIGATE uncertain classifications
    open = prior open IDs plus new repair-worthy IDs, minus IDs confirmed resolved
    IF judgment is incomplete OR uncertainty remains OR policy requires human input:
      ESCALATE
    IF open is empty:
      POST and VERIFY round summary
      FINISH verified
    repair_cycles = repair_cycles + 1
    REPAIR open IDs and run required checks
    VALIDATE actual changes independently and complete required checks
    IF repair or validation is blocked/incomplete: ESCALATE
    DELIVER authorized signed commits, push, and summary comment
    VERIFY delivery receipts
    IF delivery is incomplete: ESCALATE
    CONTINUE

  # Discovery is closed. Fix and verify only what is already recorded.
  IF open is empty:
    POST and VERIFY final summary with the deferred list
    FINISH limited coverage

  verify = VERIFY every recorded ID at the current head, plus required checks
  RESOLVED   -> remove from open; reset that ID's verification_failures to 0
  UNRESOLVED -> keep the ID open; increment that ID's verification_failures
  REGRESSION -> keep the ID open; increment that ID's verification_failures; a
                fix broke what it touched, a required check, or a previously
                resolved ID
  NEW ISSUE  -> add to deferred; never repair
  IF any ID moved to deferred: record it in the ledger and the pending summary
  IF open is empty:
    POST and VERIFY final summary with the deferred list
    FINISH limited coverage

  progress = the open set lost at least one ID this cycle and gained none
  IF progress: stalled = 0 ELSE stalled = stalled + 1
  IF stalled >= 2 OR any open ID has failed verification 3 times: ESCALATE

  repair_cycles = repair_cycles + 1
  REPAIR remaining open IDs and run required checks
  VALIDATE actual changes independently and complete required checks
  IF repair or validation is blocked/incomplete: ESCALATE
  DELIVER authorized signed commits, push, and summary comment
  VERIFY delivery receipts
  IF delivery is incomplete: ESCALATE
  CONTINUE

ESCALATE:
  PRESERVE safe work, ledger, counts, and exact operation state
  POST and VERIFY escalation record when possible
  REPORT missing receipts directly if recording fails
  REPORT concise escalation summary, verified record link, and the specific
    human decision or recovery action; PAUSE until answer and state reconciliation
```

Rules the flow depends on:

- A round that finds nothing finishes `verified`; no fourth review ever runs. A round that inspects the full diff is the only thing that counts as discovery.
- Verification **confirms, denies, or regresses; it never discovers.** Deferral is the release valve: new work is recorded and reported, not repaired.
- Verification covers every recorded ID, not just the open ones. A repair that undoes an earlier fix is a regression on that ID, not new work.
- Deferred findings never justify another review round or an escalation. Escalation is for stalls and blockers only.
- Repairs may not add scope. Open IDs are the entire authorized queue after the window closes.
- Resumes and retries keep the same round count and repair-cycle counts; a clean verification is `limited coverage`, not `verified`.
