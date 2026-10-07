# OpenSpec pre-delivery finalization

Read before dispatching Finalize or preparing its delivery brief. On interruption or an explicit resume, read [Recovery and receipts](./recovery-and-receipts.md) before further operations. This reference extends only the exact-label OpenSpec issue route; standalone verification and direct edits retain their boundaries. Use the installed archive/sync procedures, not a new finalizer, lifecycle substitute or independent sync assessor.

## Delegate brief and preflight

Pass the resolved absolute archive/sync skill paths separately from:

- Sticky issue/repository, worktree/branch, base/head and ownership/baseline evidence.
- Change/store/schema, status-resolved `planningHome`, `changeRoot`, `artifactPaths` and `actionContext`; retain selected-root flags on applicable commands.
- Every authoritative artifact/delta path and corresponding main-spec path, plus the full accepted verification report, required check results and disclosed optional scope.
- Recorded invocation choice: **Sync now if needed, then archive after acceptance**; **Archive now when already synced**. No delta specs means sync is not applicable.

Before any write-capable route dispatch, resolve/read the selected dependencies, confirm actual nested tools/opt-in/depth and verify planning/delivery feasibility. Main specs and archive contents in an external store/repository outside the authorized PR cannot be represented as files in this PR. Pause for scoped reconciliation rather than change roots, expand authority or stage across repositories.

The archive Agent rereads project instructions and current status. Current identity, verified implementation/diff and checks must still match. Required artifacts must be done or legitimately skipped; required tasks must be complete. Surface incomplete warnings and pause the route for evidence/state reconciliation. The invocation's sync/archive choice is not consent to override those warnings, accept a consequential conflict or bypass tool permissions. Missing required evidence leaves Deliver unstarted.

## Follow the installed archive

1. Announce selection. Preserve its optional advisory `instructions archive` lookup: nonzero/invalid JSON supplies no extra inputs and is not itself an archive blocker. Consider returned context and compatible guidance; preserve controlling choices, checks and paths and avoid copying advisory text into output.
2. Use only status's `artifactPaths.specs.existingOutputPaths` for delta inventory. Read every selected delta and corresponding main spec at the resolved planning root. Display the built-in combined assessment of adds/modifications/removals/renames before applying the recorded choice.
3. When sync is needed, require one successful valid `instructions specs` artifact-instruction snapshot before main-spec writes. Valid omitted rules means no configured rules; failed lookup is not the no-rules case. Rules constrain spec content/form only, not roots, operation guidance or CLI behavior. Inline sync reuses the snapshot without refetching. Run synchronously and wait if delegation is necessary, since archival removes its input directory.
4. Preserve semantic merge behavior: unaffected requirements/scenarios and existing Purpose remain; new capabilities receive delta Purpose or a disclosed TBD and main-spec structure without delta-operation headers. The archive Agent's post-sync comparison covers **every selected capability and every ADDED/MODIFIED/REMOVED/RENAMED effect**, not just worker-reported touched files. Worker success alone is not acceptance. Failure, mismatch or inconclusive coverage preserves edits and blocks the move and Deliver.
5. Already-synced deltas retain full assessment and **Archive now** without needless sync replay. An empty/missing authoritative inventory reports **No delta specs**, performs no specs-instruction lookup and writes no main specs; infer no deltas from proposal/design/tasks. Skipping needed sync cannot establish PR readiness.
6. Capture the complete current selected directory before the move. Let the installed procedure derive `planningHome.changesDir/archive/<target-name>` using its date-prefix rule (preserve an existing date prefix), check collisions and move the whole directory. A collision stops this route; preserve paths/work and ask for reconciliation rather than overwrite or invent an alternate destination.

## Whole-archive evidence

Capture a complete pre-move inventory, including hidden entries, `.openspec.yaml`, all schema artifacts, deltas and other selected-change contents. Record relative paths, entry kinds, content hashes/identity and relevant modes/link targets, plus exact source and destination roots. Establish scope for unsafe or unexplained entries before proceeding. Keep the selected change/main specs exclusively owned during finalization; concurrent drift invalidates affected acceptance.

After the move, delegate filesystem confirmation of source absence and a complete matching destination inventory/content identity for the same target, including metadata. Reconcile any procedure-generated metadata explicitly against authorized scope. Existence, a matching basename or a prose success report is insufficient. This is move confirmation, not another sync assessment. Failed/partial/unconfirmed moves block Deliver and preserve main-spec edits and both reported paths; there is no automatic rollback or reopen.

Retain a finalization receipt with target/schema/roots/store, verification report and check state, authoritative delta-to-main mapping, combined assessment/choice, attempted sync versus accepted built-in comparison (or already-synced/not-applicable), exact source/archive path and pre/post inventory/content identity. Distinguish sync rejected, archive failed and moved-unconfirmed from confirmed archival.

## Delivery brief

Only confirmed complete archival releases Deliver. Pass implementation ownership plus authorized main-spec updates, **the entire archived selected change**, generated metadata if applicable, and active-path deletions. Include initial baseline/ownership evidence so unrelated dirty files and preexisting commits stay excluded. No-delta changes have an empty main-spec update set, not fabricated spec edits.

A separate inspecting Agent checks the actual staged diff after owned staging and the **entire outgoing range** after signed commit but before publication against that brief. Require explicit receipts listing included implementation paths, applicable main-spec paths, archive paths/inventory and active-path removals, and explaining any category with no changes. Verify content as well as names, account for git rename presentation, and reject missing/unowned additions or deletions. Blanket staging or inspecting only the latest commit cannot establish authorized PR contents.

Retain existing delivery policy: current `origin/develop` reconciliation and affected checks, `issue-<n>` branch/worktree and PR head, `develop` base, closing issue reference, `git commit -S -s`, signature/DCO verification and normal (never force) push. Content inspection and commit/push/PR receipts must identify the actual delivered head/range. Fresh review and all required final-head gates must agree with the final delivered SHA after any repair. Archived means complete and packaged for review, not merged; merge and worktree removal remain user actions.

## Model-free route examples

These are declarative contract/distribution examples, not workflow execution, signing/publication proof or model-obedience evidence. `deliver` denotes permitted dispatch only; no test performs it. The fixture's detailed receipts must satisfy each boundary, not merely match these trace names.

| Case | Route trace | Delivery allowed |
| --- | --- | --- |
| sync-success | prepare → verify → finalize → inspect-package → deliver | yes |
| already-synced | prepare → verify → finalize → inspect-package → deliver | yes |
| no-delta-specs | prepare → verify → finalize → inspect-package → deliver | yes |
| optional-archive-inputs-unavailable | prepare → verify → finalize → inspect-package → deliver | yes |
| missing-archive-procedure | prepare → pause | no |
| missing-sync-procedure | prepare → pause | no |
| missing-nested-tools | prepare → pause | no |
| missing-workflow-opt-in | prepare → pause | no |
| incompatible-depth | prepare → pause | no |
| external-store-delivery-mismatch | prepare → pause | no |
| incomplete-artifacts | prepare → verify → finalize → pause | no |
| incomplete-tasks | prepare → verify → finalize → pause | no |
| failed-specs-instructions | prepare → verify → finalize → pause | no |
| invalid-specs-instructions | prepare → verify → finalize → pause | no |
| rejected-comparison | prepare → verify → finalize → pause | no |
| sync-failed | prepare → verify → finalize → pause | no |
| archive-collision | prepare → verify → finalize → pause | no |
| archive-failed | prepare → verify → finalize → pause | no |
| moved-unconfirmed | prepare → verify → finalize → pause | no |
| needed-sync-skipped | prepare → verify → finalize → pause | no |
| outgoing-archive-omitted | prepare → verify → finalize → inspect-package → pause | no |
| unrelated-outgoing-content | prepare → verify → finalize → inspect-package → pause | no |

Preserve safe work, full reports and operation receipts on a pause and return the exact blocker, evidence and scoped question/options/recommendation. An interrupted or blocked first run claims no delivery readiness. Resume follows the [observed-state recovery procedure](./recovery-and-receipts.md#reconcile-before-choosing-remaining-work), including current acceptance, exact active/archive inventories and partial delivery/history receipts, rather than replay based on this example table.
