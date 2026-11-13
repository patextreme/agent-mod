# PR review and repair control flow

This is the transition authority. Delegate stages and boundary checks; the orchestrator accepts evidence and selects transitions. Every dispatch/result must pass the bundled guard, not just resemble this pseudocode.

- [SKILL.md](../SKILL.md): stage contracts, shared guards, finish outcomes.
- [Preparation](./prepare.md): sticky run contract and reconciled state.
- [Lifecycle guard](./lifecycle.md) and [validator](./lifecycle.mjs): exact CLI/API, persisted boundary events, finite budgets, continuation and recovery rules.
- [Review scope](./review-scope.md): reviewer brief, full-diff coverage, verifier brief.
- [Repair policy](./policy.md): threshold, deferral, human decisions.
- [Report contracts](./report-contracts.md): visible summary plus collapsed audit layers, receipts, and final response.

```text
# RUN is a boundary protocol, not a new orchestration runtime.
RUN(stage, inputs):
  GUARD actual phase-specific git/PR state, sources and required check definitions
  APPLY start(stage) to saved journal BEFORE dispatch; reject -> ESCALATE
  DELEGATE exactly the recorded stage with the accepted finite max_turns
  INSPECT actual stage artifacts; accept no summary-only substitute
  APPLY result to journal with current observed heads and evidence locator
  IF incomplete:
    preserve artifacts and charged attempt
    IF no new verified progress units OR stage/per-round budget exhausted: ESCALATE
    ELSE retry the SAME stage/round/operation through another charged start
  IF result rejected, uncertainty unresolved, policy requires input or state paused:
    ESCALATE
  RETURN replayed state and accepted artifacts

SELECT exact requested PR; ambiguous selection -> ask, not open-ended investigation
IF new run:
  INIT original identity, pinned base/head, limit (default 3, accepted integer 1..3),
       finite stage budgets and turn bound BEFORE preparation dispatch
ELSE:
  RECOVER original journal from local state and verified paginated PR records
  RECONCILE unpublished suffix; ambiguous identity/accounting -> ESCALATE
  SHOW/replay journal; never initialize a replacement or reset counts
  RECOVER any completed but unacknowledged delivery effect by actual read-back
  APPLY resume with original identity, effective limit, exact counts/current stage
  IF user requested a shorter total: APPLY limit; keep all consumed effort

contract = RUN prepare with requirements/standards and paginated history, if pending
IF preparation is blocked: PAUSE with exact required input
IF an authorized repair is incomplete: RECONCILE and FINISH only that repair
IF delivery is incomplete: recover only missing receipts/effects before anything else
# Continue state.stage after any interruption. Never jump from a saved start/result
# to the top of a new round. Recovery uses the same RUN protocol and budgets.

RECOVER rounds used, repair cycles, open IDs, deferred IDs, and last delivered SHA
rounds = state.rounds
window = 3 # default ceiling only
window = state.limit # effective accepted total; may be below rounds already used
open = recorded unresolved repair-worthy IDs
deferred = recorded deferred IDs
stalled = recovered non-advancing verification count
verification_failures = per-ID failed verification counts, recovered from journal
repair_cycles = recorded repair cycles
# One repair cycle is one authorized REPAIR -> DELIVER operation, counted at its
# first repair start. Relaunches spend attempts but retain cycle and operation ID.

CONTINUE saved stage through the following accepted boundaries:

  IF rounds < window OR state.roundPending: # same-round continuations spend attempts
    review = RUN review of full PR diff, merge-base..current head,
             fresh history-free context, parallel Standards/Spec axes
    # First start consumes a round; interruptions cannot refund it. At most two
    # attempts per round, further constrained by the original total stage budget.
    IF review is incomplete: ESCALATE unless RUN can continue within those bounds
    judgment = RUN judge current reports against the complete ledger
    WHILE judgment needs investigation:
      RUN investigate uncertain classifications within original finite budget
      judgment = RUN judge again, spending another judgment attempt
    open = prior open IDs plus new repair-worthy IDs, minus IDs confirmed resolved
    IF judgment is incomplete OR uncertainty remains OR policy requires human input:
      ESCALATE
    IF open is empty:
      accept current-head checks; preserve report-only/deferred dispositions
      DELIVER summary only, with appropriate verified/limited outcome
      POST and VERIFY round summary; APPLY finish only if all finish gates pass
      STOP # remaining rounds are not a quota
    RUN repair open IDs and required checks
    RUN validate actual changes independently and complete required checks
    IF repair or validation is blocked/incomplete: ESCALATE
    DELIVER authorized signed commits, push, and summary comment
    VERIFY delivery receipts, persist journal and refresh state
    CONTINUE only from state.stage (review if remaining, otherwise verify)

  # Discovery is closed. Fix and verify only what is already recorded.
  # Even an empty open set after delivery needs current-head verification.
  verify = RUN verify every recorded ID at the current head, plus required checks
  # VERIFY every recorded ID at the current head includes already resolved IDs.
  RESOLVED   -> remove from open; reset that ID's verification_failures to 0
  UNRESOLVED -> keep the ID open; increment that ID's verification_failures
  REGRESSION -> keep the ID open; increment that ID's verification_failures; a
                fix broke what it touched, a required check, or a previously
                resolved ID
  NEW ISSUE  -> never repair; classify under Review scope and Repair policy:
                repair-worthy AND out of this PR's scope -> add to deferred
                repair-worthy AND in this PR's scope     -> add to open; ESCALATE
                below the repair threshold               -> report-only
  IF any ID moved to deferred: record it in the ledger and the pending summary
  IF open is empty:
    DELIVER final summary only with the deferred list and closed-window limitation
    POST and VERIFY final summary; APPLY finish limited coverage
    STOP

  progress = the open set lost at least one ID this cycle and gained none
  IF progress: stalled = 0 ELSE stalled = stalled + 1
  IF stalled >= 2 OR any open ID has failed verification 3 times: ESCALATE
  IF any next stage budget is exhausted: ESCALATE

  RUN repair remaining authorized IDs and required checks
  RUN validate actual changes independently and complete required checks
  IF repair or validation is blocked/incomplete: ESCALATE
  DELIVER authorized signed commits, push, and summary comment
  VERIFY delivery receipts; CONTINUE from verify

DELIVER:
  # Each missing effect is its own guarded, bounded dispatch/result.
  # A summary has only the comment effect; a repair has commit -> push -> comment.
  IF authorized repair:
    RUN deliver(commit): stage authorized hunks only, sign, inspect entire outgoing
                         range and record signed SHA(s); preserve operation ID
    RUN deliver(push): push without force to exact PR head branch; read-back remote SHA
  RUN deliver(comment): publish summary/audit with journal prefix and read-back URL/ID
  # Completed effects cannot repeat. An uncertain effect is inspected before retry.
  # No merge transition exists. A repair delivery is not final validation at its
  # new commit head: the next accepted review/verification supplies that evidence.

ESCALATE:
  APPLY pause with exact reason; preserve active attempt and authorized operation
  PRESERVE safe work, ledger, counts, and exact operation state
  APPLY notice-start within the same finite delivery/turn budgets
  POST and VERIFY escalation record when possible
  APPLY notice-result with actual receipt (or known failed publication)
  REPORT missing receipts directly if recording fails
  REPORT concise escalation summary, verified record link, and the specific
    human decision or recovery action; PAUSE until answer and state reconciliation
  # Any retry still spends the frozen budget; exhausted stages cannot start again.
```

Rules the flow depends on:

- A complete clean round finishes `verified`; no fourth review ever runs, nor any review beyond a smaller accepted window. Only a complete full-diff round supplies accepted discovery evidence. Starting an interrupted round still consumes its slot; incomplete coverage never establishes success.
- Verification **confirms, denies, or regresses; it never discovers.** Deferral is the release valve for repair-worthy work outside the PR's scope: it is recorded and reported, not repaired. Below-threshold findings are report-only; an in-scope repair-worthy new one stays open and escalates.
- Verification covers every recorded ID, not just the open ones. A repair that undoes an earlier fix is a regression on that ID, not new work.
- An unrelated or environmental check failure is a material limitation on the evidence, never deferred work. Required checks remain mandatory; unrelated failures are never labeled passing.
- Deferred findings never justify another review round or an escalation. Escalation is for stalls, blockers, incomplete evidence or exhausted budgets — including an open ID the closed window cannot repair.
- Repairs may not add scope. Recorded authorized open IDs are the entire queue after closure. A shorter window closes discovery without waiving resolution, current-head evidence, signing or delivery gates.
- Resumes and retries keep original identity, effective limit, all attempts, round and repair-cycle counts, findings and receipts; a clean verification is `limited coverage`, not `verified`.
