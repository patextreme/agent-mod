# Implementation control flow

Adapt this pseudocode into a `SubagentWorkflow` script. Codemode may coordinate surrounding stages. `SKILL.md` defines the stage contracts and reporting requirements; the main orchestrator owns scheduling and evidence acceptance.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result

preparation = DELEGATE(Prepare, repository and requested change/store)
IF selection is ambiguous:
  ASK for selection; SAVE and PAUSE; repeat preparation after reply
IF CLI state is blocked:
  REPORT missing prerequisites; ASK; SAVE and PAUSE
IF preparation failed or is incomplete:
  DELEGATE missing investigation; revise the brief; repeat preparation
KEEP the resolved change/store fixed unless the user changes it
IF CLI state is all-done:
  PROCEED to Finish; do not dispatch implementation workers

ORDER whole task groups by dependency

FOR EACH group, one at a time:
  RELEASE the group only after the preceding group is verified and bookkept
  brief = selection, assigned task ids, prerequisite evidence, skill path,
          and task-scoped repository access
          (edit whatever the tasks require; preserve unrelated work;
           repair technical failures yourself)

  LOOP:
    implementation = DELEGATE(Implement and repair, brief)
    KEEP task-checkbox updates pending for bookkeeping

    verification = DELEGATE(Verify, actual changes, assigned requirements,
                            checks, prerequisite regressions)
    IF verification is verified:
      BREAK
    IF the same findings recur with no edits and no new evidence:
      REPORT the impediment and ASK   # do not redispatch unchanged work
    brief = brief with the exact findings and reproduction added  # technical repair

  DELEGATE(Bookkeeping, only the verified task ids and their evidence)
  MARK only fully implemented, verified tasks complete
  CONFIRM fresh apply progress before releasing the next group
  RETAIN the confirmed state and evidence for subsequent groups

Finish:
  final = DELEGATE(Finish, integrated checks and fresh apply-status read)
  IF all specified tasks are complete AND required checks pass:
    REPORT verified completion; STOP
  OTHERWISE route technical failures through the repair/verify loop, then rerun Finish
  PAUSE for genuine design/product/architecture decisions or external authorization
```

A finding is progress only when edits or new investigation/check evidence justify a different next step. An empty result, a repeated summary, or a redispatch of an unchanged brief is not progress.

Human-input branches save state and resume only after the user's answer, reconciled against actual edits, task state and prerequisite evidence. Workers return evidence to the orchestrator; committing, pushing, archiving and spec syncing remain separate authorized requests.
