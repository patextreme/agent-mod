# Proposal

## Why

[#49](https://github.com/patextreme/agent-mod/issues/49) requires verified OpenSpec implementation, synchronized main specs and archived planning evidence in the same delivered PR. The merged migration baseline instead delivers immediately after verification and explicitly leaves sync/archive to separate requests, while PR repairs have no archived-evidence alignment contract.

## What Changes

- Extend only the OpenSpec route to resolve → groom → implement → verify → finalize → deliver → review/repair; keep `orc-openspec-verify` verification-only and the direct-edits route unchanged.
- Resolve externally installed `openspec-archive-change` and `openspec-sync-specs` before dispatch, then delegate the archive procedure with the same repository/worktree/change/store and accepted verification evidence.
- Make invocation the explicit authorization/choice to sync when needed and archive after acceptance. Preserve built-in summaries, rules lookup, synchronous sync, post-sync comparison and no-delta behavior. Incomplete artifacts/tasks, conflicts and failures still pause; no separate finalizer or assessor.
- Gate delivery on actual complete archival, then include implementation, applicable main specs and the whole archived change in authorized delivery contents and receipts.
- Pass archived planning paths and main specs to PR review/repair; keep in-scope corrections archived and validate code/doc/spec alignment after behavior changes. New requirements or consequential design changes need user authorization.
- Reconcile partial sync, archival and delivery on resume, preserving PR repair history/accounting and final-head gates.

## Capabilities

### New Capabilities

- `openspec-pr-finalization`: OpenSpec-specific pre-delivery finalization, packaging of archived evidence, post-archive repair alignment and recovery.

### Modified Capabilities

- `issue-to-pr-orchestration`: Full MODIFIED **Selected implementation path** and **Single-issue lifecycle limit** blocks against actual merged main insert verify → finalize → deliver and remove the separate-sync/archive exclusion only for the OpenSpec route. Direct execution, missing-change/readiness scenarios, merge/cleanup/queue limits and other routing/delivery/reporting policies remain intact.

`pr-review-repair-orchestration` already permits clean requirements sources and scoped repairs; no actual conflict requires replacement. The new capability adds archived-source alignment without changing its thresholds, signing/publication or cumulative history.

## Impact

- Updates `skills/orc-issue-to-pr/SKILL.md` and pseudocode; adds its local finalization/evidence reference. Updates archived-context handling in `skills/orc-pr-review-repair/` and its report/pseudocode references, relevant README policy-extension disclosure, and existing factory test coverage. Retain the merged MIT notice and archived migration history; do not resurrect the deliberately removed standalone provenance file.
- Existing Pi/Nix recursive skill packaging suffices; no new finalization skill, independent assessor, external-skill copies or runtime dependency.
- PR50 is merged at integrated base `origin/main` `0fa734b`; migration sync/archive is verified. The deferred baseline-existence gate is satisfied and this plan reconciles the actual main requirements. Frozen-baseline verification remains historical evidence: integrated tasks 5.1–5.3 require fresh inspection, full gates and diff attribution before implementation acceptance and subsequent verification. Scoped transplant checks are recorded in `/tmp/agent-mod-48-49-integration-evidence/report.md`, not whole-change acceptance.
- Executing the resulting issue-to-PR skill retains external built-ins, nested-tool/depth, exact-label, GitHub, signing, issue-tracker and delivery prerequisites. These are reported execution gaps, not prerequisites for static local implementation/verification. Tracker setup now exists and targets `main`, while the preexisting source skills/main spec retain `develop`/`origin/develop`; operational delivery remains blocked pending separately authorized policy reconciliation. This is disclosed, not added scope or a static-development blocker. Archived means implementation complete and packaged for review, not merged.
- Coordinate shared contract/test/docs edits with [#48](https://github.com/patextreme/agent-mod/issues/48), without requiring its lifecycle skill or #47. Preserve signing/DCO, normal pushes, exact-label routing, develop/issue-branch conventions, material repair threshold, cumulative ten-attempt history and final-head checks.
- Validate distribution and model-free contract/trace scenarios plus human comparison with installed built-ins; live delivery/repair is not a planning or required static-validation operation. Migration sync/archive/commit/delivery and commits/publication/finalization of these changes are not authorized by local-development approval. Preserve the snapshot baseline and original checkout. Merge and worktree removal remain user actions.
