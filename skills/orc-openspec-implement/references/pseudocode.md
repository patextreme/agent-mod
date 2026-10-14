# Implementation control flow

Adapt this pseudocode into a `SubagentWorkflow` script. Codemode may coordinate surrounding stages. `SKILL.md` defines the stage contracts and review-plan fields; the main orchestrator owns scheduling and evidence acceptance. Planning groups, worker assignments, and independent review boundaries are distinct.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result

preparation = DELEGATE(Prepare, repository and requested change/store)
# Before any SAVE/persistence, including early pause paths:
SELECT configurable repository-local per-change record directory in allowed roots
       (default .openspec-orchestration/<change>/ once selection is resolved)
RESOLVE physical path; verify git check-ignore AND no tracked records via git ls-files
IF selection/storage is unresolved or unsafe:
  ASK for an already ignored location/selection and PAUSE before writes
READ records.md templates; revalidate storage on resume; keep evidence out of
     planning artifacts/commits, preserve ignore policy; do not force-add records

IF selection is ambiguous:
  ASK for selection; SAVE and PAUSE; repeat preparation after reply
IF CLI state is blocked:
  REPORT missing prerequisites; ASK; SAVE and PAUSE
IF preparation failed or is incomplete:
  DELEGATE missing investigation; revise the brief; repeat preparation
KEEP the resolved change/store fixed unless the user changes it
plan = preparation.review_plan
REQUIRE selected repository/worktree/change/store, schema, CLI state/progress,
        context paths, exact task IDs and requirement/contract mapping,
        dependency edges, risk classifications with rationale,
        ordered groups/task-ID chunks, review boundary membership,
        prerequisite release conditions, discovered focused/final check commands,
        context policy, finite checkpoints, host capability evidence, validated storage
DEFAULT to a fresh worker per group independently of review batching
SPLIT large groups into explicit task-ID chunks with finite checkpoints;
      oversized single tasks keep the same ID with bounded partial checkpoints
IF no safe finite assignment fits established host limits:
  ASK; SAVE and PAUSE before dispatch
IF host establishes reliable context-occupancy telemetry:
  RECORD signal capability evidence, units, interpretation, observation cadence,
         configured safe-boundary handoff threshold (no universal token threshold)
  CHECK reliable signal at recorded checkpoints; approach triggers cooperative handoff
OTHERWISE use finite assignments/planned checkpoints, not automatic token detection
CUMULATIVE billed input tokens are not context occupancy
DISCOVER commands from repository instructions and executable configuration
RECORD command, working directory, covered scope, environment assumptions
DEFAULT each group to its own boundary
BATCH compatible lower-risk groups only with affirmative rationale that none
      consumes an unverified prerequisite contract
ISOLATE unknown risk in a separate boundary
REQUIRE high-risk or uncertain prerequisite acceptance AND bookkeeping
        before dependent work (authorization, durable state, admission,
        idempotency, recovery, consequential cross-component invariants)

REQUIRE_QUIESCENCE():
  REQUIRE host-confirmed previous writer termination (or evidence no writer ran)
          AND reconciliation that no surviving subprocess can mutate source
  RECORD writer identity/exit proof and subprocess inventory/state/proof
  IF interrupted writer or subprocess state is uncertain:
    PRESERVE progress; ASK; SAVE and PAUSE; do not dispatch any successor writer
  USE only established host capabilities; invent no stop API
  A returned summary alone is not subprocess quiescence

RECONCILE_EVIDENCE():
  COMPARE actual task/source/process state against records.md scoped content hashes:
          base revision plus dirty/staged/index state, untracked source, deletions,
          requirements, shared contracts, dependencies, check configuration,
          environment/prerequisite assumptions; not just HEAD or edited-file lists
  IF recorded scope/assumptions are unchanged:
    RETAIN unaffected scoped evidence with reconciliation reason
  IF source/contracts/dependencies/configuration/assumptions changed:
    INVALIDATE affected check/semantic acceptance and dependent evidence;
               uncertain impact invalidates the affected boundary
    FREEZE affected dependents immediately; checked boxes cannot authorize release
    REDISCOVER/rerun affected commands; record reason/affected IDs/required refresh
    IF affected tasks were previously bookkept:
      REQUIRE_QUIESCENCE()
      DELEGATE(Correction, only affected checkboxes/statuses, invalidation evidence)
      SERIALIZE correction; preserve unrelated completed tasks
      REQUIRE_QUIESCENCE(); CONFIRM fresh apply progress
    REQUIRE fresh independent review/reacceptance and bookkeeping before release
  IGNORE local ledger churn and known checkbox-only bookkeeping for source acceptance;
         task meaning/requirement edits invalidate relevant mappings
  LOST/unbound records require fresh reconstruction, not inferred acceptance

REPAIR_VERIFY(findings, affected_scope, accepted_unaffected_evidence):
  PERSIST records.md findings: stable ID, violated requirement/task,
          source-bound file/line, reproduction/failing regression or explicit limitation,
          expected behavior, affected contracts/dependents and regression scope
  IF no usable reproduction: require independent source-bound investigation,
                             not an invented test pass
  LOOP until findings are independently resolved against current source:
    IF genuine design/product/architecture decision or missing authorization:
      REPORT decision; ASK; SAVE and PAUSE (expansion is not architecture permission)
    IF same findings recur with no edits and no new evidence:
      REPORT impediment and ASK; SAVE and PAUSE; do not redispatch unchanged brief
    brief = findings, exact affected task IDs/requirements, current source/plan,
            skill path, accepted unaffected evidence with reconciliation reasons,
            focused check commands and required before/after check bindings
    REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
    repair = DELEGATE(Implement and repair, brief, finite checkpoints)
    PERSIST source-bound handoff; REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
    REQUIRE worker's source binding before/after repair checks; reconcile changes
    CAPTURE source binding before review
    verification = DELEGATE(Verify repair, actual repair, reproduction/regression,
                            affected contracts, current bindings, unaffected evidence)
    REQUIRE a fresh independent read-only repair reviewer, not the repair worker
    REVIEWER controls scope and explicitly justifies why targeted coverage is sufficient
    IF architecture changes, widened scope, changed shared assumptions,
       invalidated evidence or uncertain impact:
      EXPAND review to affected boundary and dependent contracts or wider scope
      RECONCILE plan/release conditions and affected evidence before acceptance
    OTHERWISE bounded regression-backed repair retains demonstrably unaffected
              evidence; do not automatically repeat the whole group's review
    CAPTURE source binding after review; RECONCILE_EVIDENCE()
    IF binding/assumptions changed: invalidate affected verification and repeat
    KEEP unresolved findings blocking acceptance; record limitations and new findings
  RETURN source-bound independent acceptance + reviewer scope justification

ACCEPT_BOUNDARY(boundary):
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  CAPTURE source binding before review
  verification = DELEGATE(Verify boundary, exact boundary task IDs/requirements,
                         actual source/changes, worker check evidence,
                         cross-component contracts, prerequisite regressions)
  REQUIRE a fresh independent read-only reviewer, not an implementation worker
  INSPECT relevant failure/cancellation/restart/concurrency behavior and whether
          checks reach production paths; request additional checks as needed
  DO NOT equate passing checks or a worker summary with semantic acceptance
  CAPTURE source binding after review; RECONCILE_EVIDENCE()
  IF review binding/assumptions changed: mark affected verification invalidated
  WHILE verification is not independently verified:
    KEEP boundary unaccepted and task-checkbox updates pending
    IF same unresolved findings/coverage recur with no edits and no new evidence:
      REPORT impediment and ASK; SAVE and PAUSE
    IF verification is invalidated/incomplete or has no actionable technical findings:
      CAPTURE source binding before review
      verification = DELEGATE(Verify boundary, current actual source,
                              affected boundary/dependent contracts, missing coverage)
      CAPTURE source binding after review; RECONCILE_EVIDENCE()
      IF binding/assumptions changed: invalidate affected verification
      CONTINUE  # missing acceptance is not an empty, already-resolved repair
    verification = REPAIR_VERIFY(verification.findings, affected boundary contracts,
                                 reconciled accepted unaffected evidence)
    REQUIRE all boundary requirements covered by current initial + repair evidence
    IF coverage/binding is incomplete:
      MARK verification incomplete; expand independent investigation on next iteration
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  IF acceptance is now stale: return to independent review before bookkeeping
  DELEGATE(Bookkeeping, only fully implemented and independently verified task IDs)
  REQUIRE_QUIESCENCE()
  SERIALIZE bookkeeping after acceptance; unaccepted tasks stay pending
  CONFIRM fresh apply progress before prerequisite release
  RETAIN accepted evidence and confirmed task state

REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()  # invocation/resume, even all-done
READ current apply status after reconciliation; preserve blocked state and PAUSE
IF current CLI state is all-done after reconciliation:
  PROCEED to Finish; do not dispatch implementation workers
  # Resumed all-done still requires fresh final checks AND integrated semantic review

FOR EACH assignment in dependency order, one at a time:
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  RECONCILE plan with actual task/dependency/risk state before affected work
  IF new consequential dependency or uncertain risk appears:
    FREEZE affected dependents; split/revise boundaries and release conditions
  FOR EACH prerequisite required by assignment:
    IF its boundary has implemented work but lacks acceptance/bookkeeping:
      ACCEPT_BOUNDARY(prerequisite boundary) before releasing dependent work
    IF prerequisite release conditions still do not hold:
      INVESTIGATE missing work or ASK; SAVE and PAUSE; do not dispatch dependent

  brief = selection, exact assigned task IDs, requirement coverage,
          prerequisite evidence, implementation skill path,
          discovered focused check commands and task-scoped repository access
          (edit whatever the tasks require; preserve unrelated work;
           repair technical failures yourself; stop after this assignment)
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  implementation = DELEGATE(Implement and repair, brief + concise reconciled records,
                            context policy/finite checkpoints and remaining criteria)
  AT assignment end or reliable threshold checkpoint:
    PERSIST records.md source-bound handoff with assigned/implemented/remaining IDs,
            coverage, changed files, commands/results, findings/blockers/assumptions,
            source/task state and writer/subprocess state; then finish cooperatively
    LEAVE partial/unfinished/unverified tasks pending
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  KEEP task-checkbox updates pending for bookkeeping
  REQUIRE focused repository-provided checks: exact commands, results/exit status,
          covered scope and inspected source binding; blocked required checks
          are not passes
  CAPTURE source binding before/after checks; reconcile intervening changes
  UPDATE separate implementation/checks/semantic acceptance/bookkeeping statuses
  RECONCILE newly discovered dependencies/risk before continuing
  IF implementation ended at a cooperative checkpoint with remaining work:
    RECONCILE handoff; enqueue a fresh finite assignment for remaining exact IDs/
              partial checkpoints; keep boundary unaccepted; continue sequentially
  IF implementation is otherwise incomplete or required checks are blocked:
    REPAIR technical failures within recorded intent or ASK for genuine decisions
    RETRY remaining exact task IDs/partial checkpoints with a fresh worker only
          after quiescence/reconciliation; do not skip acceptance or dependent release
  IF applicable boundary is reached:
    ACCEPT_BOUNDARY(applicable boundary)
  OTHERWISE continue sequential assignments in the justified lower-risk batch

REQUIRE every implemented boundary independently accepted and bookkept

Finish:
  REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
  refresh_scope = whole change  # always fresh on entry, including resumed all-done
  LOOP:
    REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
    CAPTURE source binding before final checks/review
    final_checks = DELEGATE(Final checks, execute required repository-wide commands
                            from plan for refresh_scope; exact results/scope/limitations;
                            record per-command bindings and mutating subprocess state)
    REQUIRE_QUIESCENCE()  # final format/check commands may be source writers
    integrated = DELEGATE(Integrated semantic review, fresh independent read-only
                          inspection of whole change/current source and cross-component
                          requirements, refresh_scope, current scoped evidence)
    REQUIRE fresh final checks AND integrated semantic review;
            intermediate acceptance/earlier green checks cannot substitute
    CAPTURE source binding after final checks/review; RECONCILE_EVIDENCE()
    IF binding/assumptions changed:
      INVALIDATE affected final evidence; RECONCILE plan and evidence
      SET refresh_scope to affected scope (whole change when uncertain); CONTINUE
    current_apply = READ fresh apply instructions/status in selected action context
    IF all specified tasks implemented, independently accepted AND bookkept
       AND current apply status confirms completion
       AND required final repository-wide checks pass AND integrated review is fresh
       AND no blocking findings, blocked required checks or stale prerequisite acceptance:
      REPORT verified completion with report fields below; STOP
    IF technical findings/failures:
      repaired = REPAIR_VERIFY(final findings, affected contracts,
                               reconciled accepted unaffected evidence)
      INVALIDATE affected final check/integrated evidence;
                 pre-repair integrated result cannot authorize a changed contract
      REFRESH affected boundary acceptance using current initial + independent repair
              coverage; use ACCEPT_BOUNDARY if full coverage is not established
      IF corrected affected task IDs still need bookkeeping:
        REQUIRE_QUIESCENCE(); RECONCILE_EVIDENCE()
        DELEGATE(Bookkeeping, only fully implemented and independently verified task IDs)
        REQUIRE_QUIESCENCE(); CONFIRM fresh apply progress
        SERIALIZE bookkeeping after acceptance; unaccepted tasks stay pending
      refresh_scope = affected required final checks AND affected integrated review
      REQUIRE fresh independent reviewer scope justification for retained unaffected
              final evidence from this Finish run; expand boundary/dependents or
              whole change for wider/uncertain impact or invalidated evidence
      RERUN affected final checks/review; READ fresh apply status after repair/refresh
      CONTINUE Finish loop; do not substitute targeted repair acceptance for final review
    IF incomplete tasks or stale/unaccepted boundaries:
      RETURN to sequential scheduling/independent acceptance and bookkeeping,
             then reenter Finish with fresh whole-change evidence
    OTHERWISE REPORT required-check blockers or genuine decisions/missing authorization;
              ASK; SAVE and PAUSE

REPORT (on completion, pause or handoff):
  FILL the current-task-status report under SKILL.md's Reporting and authorization;
  satisfy its completion criterion before returning the report

DELIVERY: implementation acceptance grants no delivery authorization.
Committing, pushing, spec syncing and archiving remain separate authorized requests
under existing policies. Preserve explicit prior authorization and its conditions;
execute only in the separately authorized procedure after required verification.
This skill performs none; green checks, accepted evidence, all-done or fixtures
cannot grant permission.
```

Every REPORT uses the authoritative [current-task-status report contract](../SKILL.md#reporting-and-authorization), including pause and handoff paths.

A finding is progress only when edits or new investigation/check evidence justify a different next step. An empty result, a repeated summary, or a redispatch of an unchanged brief is not progress.

Human-input branches save state only to validated storage and resume only after the user's answer, reconciled against actual edits, task state, prerequisite evidence and writer/subprocess state. On resume (including all-done), revalidate storage and run REQUIRE_QUIESCENCE and RECONCILE_EVIDENCE before dispatch or relying on bookkeeping. Workers return evidence to the orchestrator; use the report and DELIVERY rules above, preserving explicit prior authorization without inferring new permission.

## Scheduling traces (illustrative, not runtime tests)

- Lower-risk documentation `1.1` then presentation `2.1`, no prerequisite contract: plan records one boundary `{1.1, 2.1}` and affirmative batching rationale. Worker A implements `1.1`, runs focused checks, leaves its checkbox pending. Worker B implements `2.1` sequentially and leaves its checkbox pending. One fresh reviewer inspects both tasks; only after acceptance does serialized bookkeeping mark both complete. A heading or worker return alone causes no review.
- Admission/idempotency `1.1` then dependent submission `2.1`: distinct prerequisite boundary for `1.1`. Implement/check `1.1`, independently inspect its contract, accept and bookkeep, confirm fresh apply progress, then release `2.1`. Green checks plus a reproduced admission defect route to repair; `2.1` stays blocked. Unknown prerequisite risk follows the same separate-boundary release rule.
- A planned low-risk batch reveals that `2.1` consumes an unverified consequential contract from `1.1`: freeze `2.1`, reconcile the dependency/risk plan, review and bookkeep `1.1` before continuing. File independence does not excuse this prerequisite gate.
