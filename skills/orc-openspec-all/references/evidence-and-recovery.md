# Lifecycle evidence and recovery

Read this before archive dispatch or explicit restart/resume in [SKILL.md](../SKILL.md). The actual installed archive/sync procedures own operations; this reference records lifecycle choices and acceptance evidence, not a replacement finalizer or checkpoint schema.

## Archive brief and controlling choices

Pass the sticky repository/worktree/change/schema/planning-root/store identity, selected-root flags, actual installed archive/sync paths, accepted current verification and check evidence, allowed scope and the invocation choice. Announce the selected change and retain the built-in combined sync analysis. Record **Sync now when needed, then archive only after acceptance**, or **Archive now when already synced**. The no-delta path needs no sync choice.

Invocation authorizes those finalization choices only after accepted verification. It supplies no answer to incomplete-artifact/task warnings, consequential ambiguity, conflicting controlling inputs or failed operations. Return those branches with full evidence/options and pause. An unavailable required permission pauses rather than bypassing host policy. Standalone implementation and verification remain separate requests that do not finalize.

## Preserve the installed procedure

| Boundary | Required behavior / evidence |
| --- | --- |
| Archive advisory lookup | Keep `instructions archive` optional: nonzero exit or invalid JSON continues with no advisory inputs. On success consider required prompt-level context and compatible guidance separately from controlling checks/choices/paths; surface conflicts. Do not copy their text into outputs. |
| Completion preflight | Use current status artifact graph: done or skipped satisfies artifact completion. Read the resolved task file when present; absence alone is not an incomplete-task warning. Unfinished artifacts or unchecked tasks pause this lifecycle for reconciliation, not an inferred confirmation. |
| Delta assessment | Only status `artifactPaths.specs.existingOutputPaths` selects deltas. Read every selected delta and corresponding main spec under `planningHome.root`; display combined additions/modifications/removals/renames before applying the recorded choice. Missing or empty specs inventory means no deltas, not a search of unrelated artifacts. |
| Sync instructions | Before any selected main-spec write, fetch `instructions specs` once with selected-root flags. Require zero exit and valid artifact-instruction JSON; failure is not an absent rule set. Omitted rules on a valid response means no configured rules. Pass the snapshot to inline sync without refetching. |
| Inline sync | Reuse the snapshot and full selected delta analysis; keep store-aware roots and semantic merge behavior, including unaffected scenarios, existing Purpose and main-spec structure. Rules constrain written content/form only; they do not widen paths or change workflow. Wait for completion inline or synchronously delegated; background sync cannot race the archive. |
| Built-in comparison | The archive agent re-compares **every** selected capability, not only worker-reported touched files. Evidence covers intended ADDED, MODIFIED, REMOVED and RENAMED effects and preservation of other scenarios. Sync success alone proves only an attempt, not acceptance. A failed or inconclusive comparison blocks the move with differences reported. No independent sync assessor is dispatched. |
| Already synced | Retain the built-in all-capability assessment and Archive now choice; avoid unnecessary sync replay or specs-instruction lookup when no sync was selected. |
| No deltas | Record No delta specs / sync not applicable. Perform no specs-instruction lookup, sync dispatch or main-spec write; other preflight and move requirements still apply. |

## Whole archival, not a summary claim

Keep the operation exclusive: a concurrent edit to the change, selected main specs or destination invalidates affected evidence. Capture the complete pre-move change-directory inventory and content identity, including `.openspec.yaml` and any other metadata/resources. Retain current identity and sync assessment immediately before moving.

Use the installed archive procedure's `planningHome.changesDir/archive/` destination and date rule: preserve an existing YYYY-MM-DD prefix; otherwise prepend the current date. An existing destination pauses; preserve it and report options rather than overwriting, merging or choosing another name automatically. Move the entire `changeRoot` only after the built-in sync acceptance/no-delta path.

After the procedure returns, delegate filesystem inspection of source absence and complete destination inventory/content matching the selected change, including metadata. Retain source/destination paths and actual inspection evidence. This is move confirmation, not a second implementation verifier or sync assessor. A move command's exit status or archive success summary alone cannot establish lifecycle success.

## Evidence to return

- Full selected-target predecessor reports and current check commands/results, readiness dispositions, counts and skipped optional scope.
- Archive completion preflight, authoritative delta paths, displayed analysis and recorded choice.
- Specs-instruction command/result and snapshot identity when used; sync attempted/completed status, actual edited files and awaited result.
- Built-in all-capability assessment/comparison, each difference if rejected, or already-synced/no-delta evidence.
- Pre-move inventory/content identity, actual move outcome and confirmed source/destination observations.

Keep **verified**, **sync attempted**, **sync accepted** and **archive confirmed** separate. Only all accepted predecessors plus sync acceptance (or already-synced/no-delta assessment) and confirmed whole archival establish lifecycle completion. “Archive without syncing” when sync is needed cannot establish it. Invocation authorizes no commits, pushes, PR delivery, merge or cleanup.

## Partial reports

Return the sticky identity, full child reports/history and the evidence above even when the lifecycle stops. For every stage use a truthful disposition with its reason: **accepted** meets its current criterion; **blocked** awaits evidence/input/access; **failed** retains the actual unsuccessful operation; **interrupted** has no conclusive completed result; **partial** has observed effects without full acceptance; **unstarted** was never dispatched. These are descriptive labels, not acpx CLI enums. Include readiness decisions, round counts, actual checks/results, skipped scope, edited files and pending questions/options/recommendation. Preserve constituent failures rather than translating them into success.

| Observed outcome | Report and preserve |
| --- | --- |
| Implementation fails or is interrupted after groom/readiness | Retain their accepted evidence, implementation's actual result/edits and history; verify/finalize unstarted. |
| Sync writes some specs then fails, or comparison rejects | Verification evidence retained as current only if still applicable; sync attempted/partial or rejected, archive unstarted; list applied/missing effects and differences. |
| Sync accepted; archive move fails | Sync acceptance and actual move failure separately; preserve specs and active-directory observations. |
| Move result cannot be confirmed | Finalization partial/blocked, archive moved-unconfirmed; report both locations and missing inventory/content evidence. |

Keep safe work and receipts. Interruption may prevent reporting altogether; absence of output proves neither an intact active directory nor an untouched main spec. No automatic commit, stash, reset, rollback, duplicate move or reopen follows a failure.

## Explicit restart/resume

Reconciliation requires an explicit user request for the **same target**, with retained paths and any available previous reports (including known gaps). It is inspection followed by remaining authorized operations, not replay of a saved graph. Delegate the inspection read-only and retain its concrete findings before choosing a continuation. Reconciliation validates receipts and current state; it supplies no substitute sync acceptance. Active sync assessment/comparison remains with the installed archive agent, and archived completion requires a matching retained built-in receipt.

1. **Recover identity and prerequisites.** Compare canonical repository/worktree, branch/refs where applicable, change/schema, planning root/store/flags, owned scope and authorization with the retained contract. Resolve/read current installed procedures and recheck host opt-in, worker tools, permissions and permitted depth. A scoped human answer applies only to its original question. Drift, lost scope or missing prerequisites pauses before writes; report the discrepancy and options rather than auto-selecting another target.
2. **Observe both locations first.** Inspect the retained active path and intended/reported archive destination before active-change commands. Use the actual attempted destination, not today's newly guessed date; if it is unknown, investigate candidate identity read-only and pause until unambiguous. Record existence/type and complete inventories/content identity including metadata. For a move attempt, compare source/destination against the pre-move snapshot; before any move attempt, establish the current active artifact inventory. A missing pre-move receipt blocks archived completion, not read-only inspection of an intact active target. Retain exclusive access to the selected change/main specs/destination. Both paths present, neither present, incomplete/mismatched archive or unsafe locations pause with the observations. Destination presence alone is not a receipt.
3. **Reconcile evidence and effects.** For an intact active change, refresh status/apply/context and the authoritative selected delta inventory with the pinned flags; compare current workspace, artifacts, gates and full reports. Inventory/intent or unrelated code drift invalidates affected acceptance. Expected selected-main-spec edits and a confirmed relocation are recorded finalization transitions; they do not alone invalidate implementation verification. Refresh genuinely stale affected acceptance before progression. Inspect every selected delta's effects against current main specs under the installed archive contract, distinguishing already applied, missing and conflicting effects while preserving unaffected content. Missing active-stage receipts require fresh acceptance from current active files, not trust in checkboxes. Preserve available constituent history and stalled-progress decisions; no new lifecycle retry cap, deadline or reset budget is introduced.
4. **Choose the safe branch below.** Confirm current authorization and prerequisite evidence for the proposed remaining work. Return any ambiguity with exact evidence gaps, safe options and a recommendation; preserve files while waiting. Reconciliation does not silently answer warnings or broaden authority.
5. **Guard and report.** Recheck current same-target evidence immediately before the remaining operation; afterward retain its actual outcome and filesystem confirmation. Report observed completion only with all accepted predecessors, current sync acceptance/no-delta evidence and the matching whole archive. If receipts cannot be established, report the limitation, not inferred lifecycle success.

| Reconciled state | Remaining authorized work |
| --- | --- |
| Active intact; a stage failed/paused/interrupted | Re-establish missing/stale affected acceptance and return scoped input to that stage with its history. Continue the earliest unaccepted work; later stages stay unstarted until their guards pass. |
| Active intact; partial sync | Re-enter the installed archive procedure with current verification and its all-capability analysis. Preserve applied effects idempotently; finish only missing authorized effects using inline sync, then require its built-in all-capability comparison. A conflict pauses. Obtain one valid current specs snapshot before this sync's writes and reuse it inline; an old attempt's snapshot is not automatically current. |
| Active intact; accepted sync but move failed | Refresh current verification and the archive procedure's assessment of every selected capability. If still already synced, use Archive now and retry only the remaining whole move to the built-in safe unused destination, then confirm. If effects changed, restore affected acceptance first; do not blindly repeat sync or automatically choose an alternate destination. |
| Source absent; complete matching archive | Reconcile retained full groom/readiness/implementation/verification/check reports and sync comparison or already-synced/no-delta assessment against current workspace/main specs and archived contents. Require the pre-move inventory/content receipt and recorded relocation. With all evidence current, report finalization already observed; perform no move or active-change lifecycle invocation. |
| Archived target with missing/stale predecessor or sync receipts | Pause: archived contents prove location, not lifecycle acceptance. Ask for matching reports/checks or a separately scoped reconciliation plan; do not automatically reopen or run active-change commands on an archived target. |
| Both/neither paths, partial destination, unknown destination, conflicting identity | Pause with both observations and specific options to establish the correct target/contents. Preserve safe work; no overwrite, merge, alternate naming or automatic move back. |

## Restart and assurance limits

A fresh active invocation without usable prior evidence establishes acceptance from current files; it does not skip stages, recreate lost histories or waive an existing stalled-progress pause. An already-archived target is not a new active lifecycle: only evidence-backed observed completion or a reported limitation is supported. Reconciliation supplies no persisted checkpoint store, transactional recovery, deterministic CLI output or native acpx checkpoint/CLI parity.

The [declarative traces](./pseudocode.md#model-free-recovery-traces) check documentation/fixture consistency, not real recovery, operational readiness or model obedience. Optional live exercises need **separate authorization** and disposable repositories/changes/main specs/archive paths, confirmed tooling/depth and permissions. Bound the exercise to approved scenarios, capture full reports and actual before/after contents, and disclose failures. They authorize no target-project finalization or publication and are not required for static development.
