# Implementation control flow

Adapt this pseudocode into a sequential `SubagentWorkflow` script. Codemode may coordinate surrounding stages. `SKILL.md` defines stage contracts and reporting requirements; the main orchestrator owns scheduling and evidence acceptance.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result

RECOVER(result, scope, previous evidence):
  IF a genuine design/product/architecture decision or external authorization is needed:
    REPORT evidence and specific question/options; SAVE and PAUSE
    AFTER user reply, DELEGATE state reconciliation and revise the brief
  ELSE IF findings recur without edits or new evidence:
    RETURN control and saved evidence to the main orchestrator
    DELEGATE investigation of the stalled approach before any redispatch
    REQUIRE a revised brief supported by new evidence
    IF investigation establishes a needed decision or authorization:
      FOLLOW the human-input branch above
    IF no safe next step is established:
      REPORT blocked outcome; STOP instead of redispatching unchanged work
  ELSE:
    DELEGATE missing investigation when needed
    PREPARE a technical repair brief from exact findings, reproduction,
            current edits, assigned tasks, and accepted prerequisite evidence
  RETAIN recorded intent, required checks, and safe partial work
  RETURN revised brief and reconciled state

preparation = DELEGATE(Prepare, repository and requested change/store)
IF selection is ambiguous:
  ASK for selection; SAVE and PAUSE; repeat preparation after reply
IF CLI state is blocked:
  REPORT missing prerequisites; ASK for input; SAVE and PAUSE
IF preparation failed or is incomplete:
  RECOVER(preparation, preparation scope, available evidence)
  REPEAT preparation with the revised brief
KEEP resolved change/store fixed unless the user changes it
IF CLI state is all-done:
  PROCEED to Finish; do not dispatch implementation workers

BUILD dependency order under Schedule
IF dependencies are unclear:
  DELEGATE investigation; ASK only if a genuine decision is needed

DISPATCH through SubagentWorkflow, one whole group at a time:
  RELEASE a group only after its prerequisites are verified and bookkept
  PASS accepted prerequisite evidence and task-scoped repository access
  PERMIT files required by the tasks within the selected action context

  FOR EACH released group:
    brief = exact selection, assigned tasks, prerequisite evidence, skill path
    REPEAT:
      implementation = DELEGATE(Implement and repair, brief)
      KEEP task-checkbox updates pending
      IF implementation failed, is incomplete, or required checks failed:
        brief = RECOVER(implementation, group scope, previous evidence)
        CONTINUE this group; hold all subsequent groups

      verification = DELEGATE(Verify and continue, assigned requirements,
                              actual changes, checks, and prerequisite evidence)
      IF verification failed, is incomplete, or has unresolved findings:
        brief = RECOVER(verification, group scope, previous evidence)
        CONTINUE with repair, then fresh independent verification
      BREAK only after all assigned tasks are independently verified

    bookkeeping = DELEGATE(Bookkeeping, exact verified ids and evidence)
    MARK only fully implemented, verified tasks complete
    CONFIRM fresh task state before accepting prerequisite completion
    IF bookkeeping failed or completion is not confirmed:
      RECOVER(bookkeeping, bookkeeping scope, verification evidence)
      RECONCILE actual task state before retrying bookkeeping
      HOLD subsequent groups until confirmed
    RETAIN verification evidence and confirmed task state for the next group

Finish:
  REPEAT:
    final = DELEGATE(Finish, integrated checks and fresh apply-status read)
    IF all specified tasks complete AND required checks pass:
      REPORT verified completion; STOP
    brief = RECOVER(final, affected task scope, accepted evidence)
    INVALIDATE affected prior evidence; hold completion and dependent acceptance
    REPEAT:
      repair = DELEGATE(Implement and repair, brief)
      IF repair failed, is incomplete, or required checks failed:
        brief = RECOVER(repair, affected task scope, previous evidence)
        CONTINUE repair
      verification = DELEGATE(Verify and continue, actual affected changes,
                              assigned requirements, and check evidence)
      IF verification failed, is incomplete, or has unresolved findings:
        brief = RECOVER(verification, affected task scope, previous evidence)
        CONTINUE with repair, then fresh independent verification
      ACCEPT replacement evidence only after complete independent verification
      RECONCILE task state and dependent work through delegated bookkeeping
      CONFIRM bookkeeping before leaving this repair loop
      BREAK; rerun Finish
```

Treat findings as progress only when implementation changes or new investigation/check evidence justify a different next step. An empty result, repeated summary, or unchanged redispatch is not progress. Technical failures return through recovery; they do not automatically ask the user. Preserve CLI-controlled states and user-interruption pauses. Each human-input branch saves state and resumes only after the user's answer; resume against actual edits, task state, and prerequisite evidence. Leave archiving, spec syncing, and delivery to separate authorized stages.
