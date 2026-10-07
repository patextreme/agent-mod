# Issue-to-PR resume and receipts

Read for the OpenSpec route on an explicit resume/restart request, interrupted finalization or partial delivery, and before reporting Finish. Direct edits retain existing resume/delivery policy and acquire no OpenSpec archive dependency. Delegate read-only reconciliation first. This is prompt-level recovery using observed files, full reports and git/PR receipts, not native checkpoints, a transaction or automatic rollback. Missing output does not prove an operation never happened. Archived means complete and packaged for review, not merged.

## Reconcile before choosing remaining work

Keep issue/route, repository/worktree/branch, change/schema/planning-root/store, authorization and initial ownership/baseline sticky. Recheck current issue intent/labels, project policy, installed dependencies, actual nested tools/opt-in/depth and access. Drift or incompatible authority pauses with concrete evidence; a resume request is not a new scope or repair budget.

Inspect exact active and recorded/expected archive paths, including any destination reported by an interrupted move. Record existence, complete inventories, metadata, content identity, modes/link targets and unexplained entries. A date rollover or matching-looking basename does not authorize a second destination: reconcile the previous path before letting the installed archive choose its date-prefixed target. Compare against the pre-move inventory and any authorized later repair receipts. Preserve both copies on ambiguity; choose neither silently.

Load complete predecessor reports and actual check/diff evidence, sync analysis/comparison and whole-move receipts. Inspect all selected delta effects and current main specs, not just worker-touched files. For an active source obtain the current status-authoritative inventory with selected-root flags; for an archived source use the retained authoritative mapping and direct archived files, not active-change status/apply/verify commands. Separate expected authorized sync/relocation/repair transitions from external code, artifact, issue, base/head or spec drift. Re-establish only affected stale acceptance; a summary, name or old success label is insufficient.

| Observed state | Remaining authorized work / pause |
| --- | --- |
| Active source, destination absent, partial sync | Establish current complete verification/check evidence and inspect every selected delta/main effect. Under installed archive assessment, finish only missing authorized effects idempotently, preserving applied/unaffected content. Require a current valid specs-rule snapshot before writes, synchronous inline sync and built-in full comparison before moving. |
| Active source, destination absent, previously accepted sync but failed move | Re-establish current verification and built-in assessment across all effects. If already synced, retain assessment/Archive now and retry only the whole move with collision checks and complete confirmation; no needless sync replay. If effects changed, resolve affected acceptance first. |
| Source absent, complete matching archive | Require complete matching pre/post inventory including metadata, current full predecessor/verification/check evidence and accepted sync comparison (or already-synced/no-delta assessment) matching all current effects. Retain the exact archive path and proceed only to remaining delivery. No second move, reopen or active-stage replay. |
| Both copies, neither copy, incomplete/mismatched archive, uncertain target or ownership | Preserve paths/work. Pause before writes/delivery with exact inventories, discrepancies and scoped reconciliation options. No overwrite, merging copies, alternate naming or inferred success. |
| Missing/stale predecessor evidence | Active source: delegate only the missing/affected stage evidence under existing gates before finalization. Archived source: report exactly which report/check/identity evidence is unavailable; pause for recovery of receipts or a scoped direct-file verification decision. Do not infer acceptance or reopen just to run active commands. |

If the remaining sync/comparison/move fails, retain partial edits and report sync acceptance separately from archive state. Deliver stays unstarted until complete archival is confirmed. Use the installed archive and its comparison; no additional finalizer or independent sync assessor.

## Reconcile partial delivery

Read actual index/working tree, local commits, signatures/DCO, entire outgoing range, freshly fetched base and exact remote branch/PR state. Compare content with the authorized delivery brief and initial baseline, including implementation, applicable main specs, whole archive and active removals. Independently inspect staged content before any remaining commit and entire outgoing content before any remaining publication. Earlier missing inspection receipts must be disclosed and current content acceptance re-established, not fabricated retroactively. Preserve unowned work.

- **No owned commit yet:** stage only remaining authorized files/hunks after reconciliation, obtain staged inspection, and create the required signed/DCO commit. Partially staged work is not a commit receipt.
- **Owned signed commit exists locally:** verify its signature/sign-off, contents and whole outgoing range; reuse it. Additional commits are justified only by remaining authorized content or repairs, never a duplicate of already committed work. Failed signature/DCO or unexplained contents pauses for scoped recovery, not amend/reset/rewrite by default.
- **Remote behind on the same verified ancestry:** after required current-base/check and outgoing-content gates, perform only the missing normal push. A lost push response requires querying remote state first. An already matching remote SHA needs no push; ahead/diverged/unexpected remote state requires reconciliation, never force push.
- **Branch pushed, PR receipt missing:** search matching PRs and verify head repository/branch/SHA, base `develop`, issue-closing body and open state. Reuse the one matching PR. Create only when absence is established. Multiple, closed/merged or mismatched PRs pause; never create a duplicate to escape ambiguity.
- **PR already delivered:** verify exact content/remote/PR receipts and continue review/repair, not publication replay. Relevant base drift requires safe reconciliation and affected checks under existing delivery policy; a new commit invalidates prior head-bound gates.

Keep completed operation receipts separate from permitted next dispatch. A PR URL alone proves neither signed contents nor complete finalization. Unavailable GitHub/signing/check evidence pauses with the missing operation and a recovery question.

## PR repair continuation handoff

Pass the same PR/worktree/refs, approved archived sources and complete original review reports, judge ledger, paginated history, run ID, cumulative reserved count, verified repair-start/summary/escalation links and exact incomplete operation state to `orc-pr-review-repair`. Follow its [continuation contract](../../orc-pr-review-repair/references/continuation.md). It finishes the same reserved attempt, reconciling code/archive/main-spec changes and remaining validation/delivery/history before another fresh review. The outer coordinator never restarts it to reset accounting. Supply history only to preparation/judge/accounting, not fresh reviewers or their axes.

## Receipt and user-report fields

Retain these fields alongside the existing stage reports, not instead of them. Unknown is an evidence gap, never success. On pauses include exact blocker, attempted investigation, safe work, remaining operations, question/options/consequences and recommendation.

| Receipt | Required content |
| --- | --- |
| Target / authorization | Issue/route/repository/worktree/branch/base/head; change/schema/planning roots/store; owned baseline and explicit invocation choices. |
| Verification | Full accepted report, completeness/severity/scope, actual checks/diff evidence and current content/ref identity. |
| Sync | Authoritative delta-to-main mapping; combined assessment and choice; attempted/completed sync versus accepted built-in comparison, already-synced or not-applicable; all-effect coverage, preservation and current content evidence. |
| Archive | Exact source/destination; pre/post complete inventories/content identity including metadata; source absence; confirmed, failed, partial or moved-unconfirmed state; authorized metadata/repair reconciliation. |
| Delivery | Authorized code/main-spec/archive/active-deletion inclusion with empty-category reasons; independent staged/entire-outgoing inspections; commit/signature/DCO, normal-push/remote-SHA and exact PR identity/base/head/body receipts; completed and missing operations separately. |
| Review / finish | Same PR run/reserved count/ledger/history links; archive alignment and affected validation; final reviewed, delivered and required-gate SHAs; outcome, findings, skipped scope and remaining human input. |

Claim Finish only when delivery, complete review/repair and all required gates agree at the same final SHA. Confirmed archival alone is not Finish, merge approval or cleanup authorization. These reports supply no durable native checkpoint or transactional filesystem guarantee.

## Model-free recovery examples

These declarative fixtures check observed-state/receipt contracts and permitted remaining work only. No fixture performs sync, moves, commits, pushes, PR operations or model calls. `remaining` is authorization to dispatch, not a completed operation receipt; `ready` means ready for the listed next work, not final PR verification. Active traces model successful remaining transitions with hypothetical move confirmation; the remaining column records work outstanding at resume entry. Fixture hashes/receipt fields are illustrative evidence claims, not observed target results.

| Case | Trace | Remaining | Outcome |
| --- | --- | --- | --- |
| active-partial-sync | reconcile → assess → sync-missing → compare → move → confirm → package | sync-missing, archive, deliver | ready |
| accepted-sync-failed-archive | reconcile → assess → move → confirm → package | archive, deliver | ready |
| matching-complete-archive | reconcile → observe-archive → package | deliver | ready |
| both-active-and-archive | reconcile → pause | none | blocked |
| neither-active-nor-archive | reconcile → pause | none | blocked |
| partial-archive | reconcile → pause | none | blocked |
| mismatched-archive-content | reconcile → pause | none | blocked |
| archived-missing-predecessor | reconcile → pause | none | blocked |
| archived-stale-comparison | reconcile → pause | none | blocked |
| active-stale-verification | reconcile → refresh-verify → assess → move → confirm → package | reverify, archive, deliver | ready |
| active-sync-conflict | reconcile → assess → pause | none | blocked |
| local-signed-commit-only | reconcile → observe-archive → package → reconcile-delivery | push, create-pr, review | ready |
| pushed-response-lost | reconcile → observe-archive → package → reconcile-delivery | create-pr, review | ready |
| matching-pr-response-lost | reconcile → observe-archive → package → reconcile-delivery | review | ready |
| remote-diverged | reconcile → observe-archive → package → reconcile-delivery → pause | none | blocked |
| ambiguous-existing-pr | reconcile → observe-archive → package → reconcile-delivery → pause | none | blocked |
| unsigned-local-commit | reconcile → observe-archive → package → reconcile-delivery → pause | none | blocked |
| outgoing-package-incomplete | reconcile → observe-archive → package → reconcile-delivery → pause | none | blocked |
| unfinished-reserved-repair | reconcile → observe-archive → package → reconcile-delivery → resume-repair | validate, repair-delivery, record-summary, fresh-review | ready |
| repair-push-summary-missing | reconcile → observe-archive → package → reconcile-delivery → resume-repair | record-summary, fresh-review | ready |
| conflicting-repair-history | reconcile → observe-archive → package → reconcile-delivery → pause | none | blocked |
| repair-ten-incomplete | reconcile → observe-archive → package → reconcile-delivery → resume-repair | validate, repair-delivery, record-summary, fresh-review | ready |
| repair-ten-delivered | reconcile → observe-archive → package → reconcile-delivery → resume-repair | fresh-review | ready |

Ambiguity fixtures retain an exact evidence-backed recovery question, not just a blocked flag. Tests establish static contract/distribution coverage, not operational safety or model obedience.
