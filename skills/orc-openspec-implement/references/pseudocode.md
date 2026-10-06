# Implementation control flow

Adapt this pseudocode into a `SubagentWorkflow` script for task-group dispatch and dependency-aware progression. Codemode may coordinate surrounding stages, following the Execution guidance in `SKILL.md`. `SKILL.md` defines the stage contracts and reporting requirements.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result

preparation = DELEGATE(Prepare, repository and requested change/store)
IF selection is ambiguous:
  ASK for selection; SAVE and PAUSE; repeat preparation after reply
IF preparation failed, is incomplete, or is blocked:
  REPORT impediment and ASK for input
KEEP resolved change/store fixed unless the user changes it
IF CLI state is all-done:
  PROCEED to Finish; do not dispatch implementation workers

BUILD dependency graph and file-ownership plan under Schedule
IF dependencies or ownership cannot be resolved safely:
  DELEGATE missing investigation or ASK for input

DISPATCH through SubagentWorkflow:
  RELEASE a group only after prerequisites are verified complete
  RUN independent groups concurrently only with disjoint safe ownership
  SERIALIZE shared files, uncertain boundaries, and shared build/generated outputs
  LET ready groups progress without a barrier on unrelated groups

  FOR EACH released group:
    implementation = DELEGATE(Implement, exact selection, assigned tasks,
                              owned files, prerequisite evidence, and skill path)
    KEEP shared task-checkbox updates pending
    IF ownership expands:
      PAUSE affected group before overlapping edits
      RESCHEDULE ownership before continuing
    IF ambiguity, new design/scope, failed checks, or agent failure occurs:
      PAUSE affected group and its dependents
      REPORT partial work and ASK for input

    verification = DELEGATE(Verify and continue, actual group diff and checks)
    IF verification fails, is incomplete, or reveals a blocker:
      PAUSE affected group and its dependents
      REPORT evidence and ASK for input
    SERIALIZE bookkeeping through a separate agent:
      MARK only fully implemented, verified tasks complete
    ACCEPT verified prerequisite completion; release eligible dependents

IF groups remain blocked or scheduling makes no progress:
  REPORT completed/remaining tasks and ASK for input
ELSE:
  final = DELEGATE(Finish, integrated checks and fresh apply-status read)
  VALIDATE all specified tasks complete and required checks pass
  REPORT complete only if that evidence establishes completion
  OTHERWISE REPORT partial/blocked outcome and required input
```

Each `ASK` pauses the affected execution path. Preserve safe completed work and the exact selection; after input, reconcile actual edits, task state, dependencies, and ownership before resuming. Leave archiving and spec syncing to separate requests.
