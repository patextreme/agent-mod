# Lifecycle stage and built-in finalization control flow

Adapt this reference into Agent/codemode coordination under SKILL.md. It is not executable workflow code, a retry budget or a persisted checkpoint protocol. The installed constituents remain the source of truth for their internal scheduling, review and repair loops.

## Delegation and evidence

`STAGE(name, brief)` runs a general-purpose Agent with the absolute installed procedure/dependency paths, sticky target, authorization, project instructions, predecessor evidence and its required nested tools. Wait for completion and retain the full child result/history, not just its summary. Use no outer SubagentWorkflow; the implement stage owns task-group dispatch.

`GUARD(boundary)` delegates read-only inspection of current identity, owned edits, artifact/file/ref snapshots, current required check results and the full predecessor report. Accept only conclusive, current evidence for the same target. Report discrepancies or missing evidence; re-establish affected acceptance after relevant edits before the dependent stage starts. Scope or identity changes need explicit reconciliation.

`PAUSE(reason)` preserves safe work, questions and history, reports the exact limitation, and leaves dependent stages unstarted. Human input includes complete evidence, options, consequences, recommendation and scope. On a scoped reply, inspect actual state before continuing the affected stage; an answer neither waives evidence nor authorizes unrelated edits/tool permissions.

## Pseudocode

```text
RESOLVE and READ installed bundled stage procedures and their references
RESOLVE and READ actual review/apply/verify/archive/sync dependencies
CONFIRM host opt-in, parent and stage-worker tools, authorized nesting/depth
IF missing or incompatible: PAUSE with exact prerequisite before stage dispatch

IF explicit restart/resume: TAKE path-first reconciliation branch below
  BEFORE active-change commands or first-run stage preparation
  RETURN observed completion/pause, or CONTINUE only remaining guarded work

preparation = DELEGATE read-only project/status/apply/context investigation
IF ambiguous selection: PAUSE with available choices
IF unsafe target or blocked CLI state: PAUSE without creating missing artifacts
PIN canonical repository/worktree, expected branch/refs, change/schema,
    CLI planning root/changeRoot/artifact paths, store/selected-root flags,
    installed paths, initial dirty/owned inventory, authority and required gates

GUARD preparation identity and scope before any stage writes
groom = STAGE(groom, pinned identity and planning-only authority)
RETAIN full review/repair history and Critical/Major/Minor counts
IF failed, incomplete, human input or stalled progress: PAUSE
ACCEPT groom only on fresh complete Critical = 0 review

readiness = DELEGATE read-only targeted structural validation and assessment
            of every remaining material blocker/decision
RETAIN actual commands/results and each finding's readiness disposition
IF invalid structure, missing evidence or consequential unresolved choice:
  PAUSE with groom accepted; implement/verify/finalize unstarted
ACCEPT readiness only with validation and explicit nonblocking/decided evidence

GUARD current groom/readiness acceptance for the pinned target
implement = STAGE(implement, accepted readiness and exact installed apply path)
  KEEP constituent dependency-aware SubagentWorkflow scheduling
  REQUIRE independent group diff/check validation before serialized bookkeeping
  IF apply all-done: require integrated checks/fresh status, no task workers
IF failed, incomplete, expanded ownership, human input or blocked: PAUSE
ACCEPT only all specified tasks and integrated current required checks,
       independent evidence and refreshed apply status

GUARD current task-and-gate acceptance for the pinned target
verify = STAGE(verify, accepted implementation and exact installed verify path)
  KEEP fresh verification -> scoped Critical/Warning repairs -> fresh verification
  KEEP report-only Suggestions and justified optional skips
IF failed, incomplete, human input or stalled progress: PAUSE
ACCEPT only fresh complete Critical = 0 AND Warning = 0,
       with current applicable required evidence and disclosed limited scope

GUARD current complete verification/check acceptance for the pinned target
READ evidence-and-recovery.md; RECORD invocation finalization choices
finalize = STAGE(installed archive, pinned identity, accepted verification,
                 resolved sync path, and Sync now when needed / Archive now
                 when already synced choices)
  KEEP installed optional archive inputs and completion preflight
  IF incomplete-artifact/task warning, conflict or human input: PAUSE
  KEEP status-authoritative delta inventory, selected-root flags and roots
  PRESENT combined all-capability sync analysis
  IF no delta paths: RECORD sync not applicable; no rules lookup or spec writes
  ELSE IF all deltas already synced: RECORD assessment and Archive now choice
  ELSE:
    REQUIRE one valid specs-instruction snapshot before writes
    RUN installed sync inline with that snapshot; WAIT synchronously
    IF sync fails: PAUSE with attempt/partial edits; archive unstarted
    REQUIRE built-in re-comparison of every selected capability
    IF rejected/inconclusive: PAUSE; archive unstarted
  RETAIN accepted comparison or already-synced/no-delta assessment
  CAPTURE complete pre-move directory inventory/content identity and metadata
  KEEP exclusive operation, same-target evidence and safe unused destination
  FOLLOW installed whole-directory move and date-prefix rule
IF collision/failure: PAUSE preserving accepted sync and safe work
confirmation = DELEGATE filesystem inspection of same selected target,
               source absence and complete matching destination contents
IF confirmation missing/inconclusive: REPORT moved-unconfirmed; PAUSE
ACCEPT finalize only with sync assessment/acceptance AND confirmed whole archive
REPORT lifecycle complete only with all current accepted stages and receipts

On failure/block/interruption/partial outcomes: retain actual reports/effects;
REPORT each stage as accepted/blocked/failed/interrupted/partial/unstarted.
PAUSE with dependent stages unstarted; missing output proves no filesystem state.
```

Groom/verify retain no arbitrary round cap. Do not import acpx attempt limits, terminal deadlines, classifier/result enums or checkpoint guarantees. Pauses preserve constituent counts, history and actual outcomes rather than resetting loops. Implementation scheduling/checkbox ownership stays within its installed stage.

## Explicit reconciliation control flow

Read [the recovery procedure](./evidence-and-recovery.md#explicit-restartresume) on an explicit restart/resume request. Reconcile before the first stage dispatch, not after repeating the lifecycle. The blocks below describe judgment/delegation, not checkpoint execution.

```text
REQUIRE explicit same-target request, retained paths and available reports/gaps
reconciliation = DELEGATE read-only inspection:
  RECHECK identity, ownership, authority, installed dependencies, tools/depth
  OBSERVE retained source AND actual intended/reported destination first
  CHECK complete inventories/content including metadata; for an attempted move,
        compare pre-move receipt; otherwise establish current active inventory
  IF both/neither paths, incomplete archive, uncertain destination or drift:
    RETURN discrepancies and safe options; PAUSE before any writes

  IF source absent AND matching complete archive:
    RECONCILE full predecessor/check and sync receipts with current workspace,
              archived artifacts and all selected main-spec effects
    IF missing/stale/uncertain evidence: PAUSE; no automatic reopen
    ELSE REPORT already-observed completion; no move or active-change invocation

  ELSE IF intact active source AND destination absent:
    REFRESH status/apply/context and selected inventory using pinned flags
    RECONCILE current predecessor/check evidence, owned edits and delta effects
    RECORD expected sync effects/relocation separately from unrelated drift
    IF missing/stale acceptance: re-establish affected acceptance from active files
    PRESERVE constituent counts/history and stalled-progress decisions
    IF conflict or consequential input missing: PAUSE with safe work preserved
    IF earliest unaccepted work is groom/readiness/implement/verify:
      GUARD and CONTINUE that work under its installed contract
    ELSE IF sync is partial:
      GUARD current verification; RE-ENTER installed archive's all-delta analysis
      FETCH one current valid specs snapshot before this attempt's writes
      COMPLETE only missing authorized sync effects idempotently, WAIT inline
      REQUIRE built-in comparison before remaining archive and confirmation
    ELSE IF sync accepted and move failed:
      GUARD verification and built-in current all-delta/already-synced assessment
      RETRY only remaining authorized whole move to safe built-in destination
      CONFIRM source absence and complete matching archive

RETAIN actual outcomes and report all stages, receipts/gaps and remaining work
No automatic replay, rollback, reopen, alternate archive name or reset budget.
```

## Model-free stage traces

The named fixtures below are review examples checked by `scripts/factory-skills.test.mjs`, not instructions to execute a model, workflow or external command. `guard:<stage>` means a read-only acceptance/current-state check; `refresh:<stage>` re-establishes stale affected evidence. `prepare` includes installed dependency/tool checks. These stage-only traces intentionally stop at the verification boundary even when accepted; the finalization examples below cover its separate acceptance.

| Fixture | Illustrative trace | Dependent stages left unstarted |
| --- | --- | --- |
| ordered-stages | prepare → groom → readiness → guard:implement → implement → guard:verify → verify | finalize |
| stale-readiness | prepare → groom → readiness → guard:implement → refresh:readiness → guard:implement → implement → guard:verify → verify | finalize |
| stale-implementation | prepare → groom → readiness → guard:implement → implement → guard:verify → refresh:implement → guard:verify → verify | finalize |
| missing-predecessor | prepare → groom → readiness → guard:implement → pause | implement, verify, finalize |
| major-readiness-decision | prepare → groom → readiness → pause | implement, verify, finalize |
| structural-validation-failed | prepare → groom → readiness → pause | implement, verify, finalize |
| human-input | prepare → groom → readiness → guard:implement → implement → pause | verify, finalize |
| missing-nested-tools | prepare → pause | groom, implement, verify, finalize |
| missing-installed-procedure | prepare → pause | groom, implement, verify, finalize |
| identity-drift | prepare → groom → readiness → guard:implement → pause | implement, verify, finalize |
| incomplete-groom-report | prepare → groom → pause | implement, verify, finalize |
| verification-warning | prepare → groom → readiness → guard:implement → implement → guard:verify → verify → pause | finalize |

## Model-free finalization traces

Read [the finalization evidence reference](./evidence-and-recovery.md) before dispatch. These declarative examples assume current accepted verification and a same-target guard. `assessment`/`comparison` belong to the installed archive agent; `confirmation` is filesystem move confirmation only. No trace dispatches a finalizer, assessor, delivery or publication. A failed operation pauses without automatic replay; explicit reconciliation examples follow separately.

| Fixture | Illustrative trace | Sync acceptance | Archive state | Lifecycle complete |
| --- | --- | --- | --- | --- |
| sync-success | preflight → assessment → rules → sync → comparison → archive → confirmation → report | accepted | confirmed | yes |
| optional-archive-inputs-unavailable | preflight → assessment → rules → sync → comparison → archive → confirmation → report | accepted | confirmed | yes |
| valid-specs-without-rules | preflight → assessment → rules → sync → comparison → archive → confirmation → report | accepted | confirmed | yes |
| already-synced | preflight → assessment → archive → confirmation → report | already-synced | confirmed | yes |
| no-delta-specs | preflight → assessment → archive → confirmation → report | not-applicable | confirmed | yes |
| incomplete-artifacts | preflight → pause | unstarted | unstarted | no |
| incomplete-tasks | preflight → pause | unstarted | unstarted | no |
| failed-specs-instructions | preflight → assessment → rules → pause | unstarted | unstarted | no |
| invalid-specs-instructions | preflight → assessment → rules → pause | unstarted | unstarted | no |
| sync-failed | preflight → assessment → rules → sync → pause | rejected | unstarted | no |
| rejected-comparison | preflight → assessment → rules → sync → comparison → pause | rejected | unstarted | no |
| archive-collision | preflight → assessment → rules → sync → comparison → archive → pause | accepted | blocked | no |
| archive-failed | preflight → assessment → rules → sync → comparison → archive → pause | accepted | failed | no |
| moved-unconfirmed | preflight → assessment → rules → sync → comparison → archive → confirmation → pause | accepted | moved-unconfirmed | no |
| needed-sync-skipped | preflight → assessment → pause | rejected | unstarted | no |

## Model-free recovery traces

These examples assume an explicit same-target request. `reconcile` is read-only identity/prerequisite, both-path inventory/content and current-receipt inspection; `effects` inspects every selected delta against main specs. `continue:sync` means the installed archive/inline sync completes only missing effects with its current snapshot and built-in comparison, not a new sync assessor. `refresh:verify` restores stale acceptance under the constituent before any finalization. `observe` reports evidence-backed archived completion without active-change invocation. Pauses preserve safe work and all known histories.

| Fixture | Illustrative trace | Permitted remaining operations | Result |
| --- | --- | --- | --- |
| partial-sync-resume | reconcile → effects → guard:finalize → continue:sync → comparison → archive → confirmation → report | sync-missing, archive | complete |
| accepted-sync-failed-move-resume | reconcile → effects → guard:finalize → assessment → archive → confirmation → report | archive | complete |
| archived-complete-evidence | reconcile → effects → observe → report | none | complete |
| archived-missing-predecessor | reconcile → pause | none | blocked |
| archived-missing-sync | reconcile → effects → pause | none | blocked |
| active-missing-receipts | reconcile → refresh:stages → report | re-establish-stages | partial |
| both-paths-present | reconcile → pause | none | blocked |
| neither-path-present | reconcile → pause | none | blocked |
| incomplete-archive | reconcile → pause | none | blocked |
| resume-identity-drift | reconcile → pause | none | blocked |
| stale-verification-resume | reconcile → effects → refresh:verify → guard:finalize → assessment → archive → confirmation → report | reverify, archive | complete |
| missing-resume-prerequisite | reconcile → pause | none | blocked |
| interrupted-implementation | reconcile → continue:implement → report | implement | partial |
| partial-sync-conflict | reconcile → effects → pause | none | blocked |

A Major readiness decision leaves successful grooming intact. Stale acceptance is refreshed, not silently skipped. Human-input and missing prerequisites halt progression without fabricated answers or a stock-host fallback. The fixture assertions check these illustrative contracts; fresh human review against the actual installed procedures is still necessary, and only a separately authorized disposable live exercise could test operational/model behavior.
