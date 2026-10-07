---
name: orc-openspec-all
description: Coordinate one OpenSpec change through groom, readiness, implement, verify and built-in sync/archive with subagents. Use when asked to run the full OpenSpec lifecycle rather than a single stage.
compatibility: Requires an enhanced host with Agent, codemode, authorized nested SubagentWorkflow, openspec CLI, and installed apply/verify/archive/sync skills. Loading instructions supplies neither tools nor permissions.
---

# OpenSpec Lifecycle Orchestration

Act as the outer coordinator; delegate investigation, checks and edits. Read [the control-flow reference](./references/pseudocode.md) before dispatch. Use Agent/codemode for sequential stage coordination, not an outer SubagentWorkflow: the implementation stage owns its nested task-group workflow. These are prompt contracts, not a deterministic runtime or OS sandbox.

## 1. Resolve prerequisites and one target

Read the installed bundled [groom](../orc-openspec-groom/SKILL.md), [implement](../orc-openspec-implement/SKILL.md) and [verify](../orc-openspec-verify/SKILL.md) procedures and their referenced pseudocode. Resolve `openspec-review`, `openspec-apply-change`, `openspec-verify-change`, `openspec-archive-change` and `openspec-sync-specs` from actual available-skill information; read those resolved files. Resolve bundled siblings relative to this installed skill, never a presumed source checkout. Pass absolute installed procedure paths to agents separately from target paths.

Confirm host opt-in, Agent/codemode access and permitted nesting/depth, including each stage agent's required tools. The implement agent needs Agent and SubagentWorkflow; groom/verify need their own delegated review/repair tools. Parent visibility proves neither worker visibility nor a numerical depth allowance. Missing or incompatible procedures, nested tools or authorization pause before dispatch; report the exact prerequisite instead of flattening stages or substituting another workflow.

For an explicit restart/resume, take the path-first [recovery branch](./references/evidence-and-recovery.md#explicit-restartresume) before active-change commands or fresh stage preparation; an archived target must not enter the active lifecycle. Otherwise delegate read-only preparation in the explicit implementation workspace. Require project instructions, current `openspec status --change <id> --json`, apply instructions and every returned context file. If selection is ambiguous, return the choices and ask the user. If a store is named or implied, discover its id with `openspec store list --json`; retain its `--store <id>` on every applicable command. With no store, keep the CLI-resolved repo-local root.

Retain a sticky identity and initial evidence snapshot:

- Repository and canonical worktree; expected branch/refs when applicable; existing dirty/owned changes and permitted edit scope.
- Change id, schema, CLI-resolved planning root, `changeRoot`, concrete `artifactPaths`, apply context, action constraints and selected-root flags/store.
- Absolute installed skill paths, stage tool/depth prerequisites, project gates and user authorization.

Honor required CLI context and compatible advisory guidance without using either as completion proof or replacement paths. Preserve blocked/ready/all-done state. A blocked apply state is not authority to create missing artifacts. Keep selection fixed; target drift or unsafe scope pauses for reconciliation, not a new auto-selected change.

## 2. Groom, then decide readiness

Run a separate `general-purpose` Agent following the resolved groom procedure with the sticky identity, installed dependencies and allowed scope. Preserve its sequential fresh reviews and Critical-only planning repairs; leave implementation and unrelated Major/Minor findings untouched. Retain the full report, Critical/Major/Minor counts, completeness, round counts, edited files and outstanding decisions.

Accept grooming only after a fresh complete semantic review establishes zero Critical findings. Preserve its uncapped progress loop and stalled-progress/failure pauses. A repair summary, NEEDS REVISION label or zero count on an incomplete report is not acceptance.

Then delegate a **separate read-only readiness assessment**: run targeted structural validation with the selected-root flags, inspect the current artifacts and assess every remaining material blocker/decision against the approved intent and project prerequisites. Return concrete validation commands/results and a disposition for each remaining finding: nonblocking with rationale, already-decided with evidence, or consequential unresolved with question/options/consequences/recommendation. Zero Critical does not establish structural validity or readiness. Keep Major/Minor findings visible without promoting severity or reopening grooming for automatic repair. Failed validation, missing readiness evidence or a consequential unresolved choice leaves implementation unstarted.

## 3. Implement, then independently verify

Before each transition, delegate read-only inspection of actual target state and predecessor evidence. Require the same identity, full accepted reports, relevant file/ref snapshots and current command/results. Relevant intervening edits or changed required check state invalidate affected acceptance; re-establish it before dispatch. Agent termination, checkboxes or a claimed success alone are insufficient.

Run the resolved implement stage in a `general-purpose` Agent. Preserve its dependency-aware SubagentWorkflow dispatch, disjoint concurrent ownership, independent actual-diff/check validation and serialized bookkeeping. Dependent groups wait for accepted prerequisites; shared files and uncertain ownership serialize. Pass the installed apply path and full context, keeping the underlying apply loop scoped to each assigned group. Preserve blocked/all-done behavior: already-complete tasks still require integrated applicable checks and fresh apply status, not unnecessary implementation workers.

Accept implementation only with independently validated task work, all specified tasks complete, integrated required checks after the last relevant edit and refreshed apply status. **Task-and-gate completion is not verification acceptance.** Scope expansion, failed checks or missing evidence pause rather than widening authority.

Run the resolved verify stage in a separate `general-purpose` Agent with current implementation evidence and the installed verify path. Preserve fresh complete read-only verification, scoped Critical/Warning repairs and re-verification of actual edits. Require zero Critical **and** zero Warning, current applicable required check evidence, counts, round history, full reports, edited files and disclosed Suggestions/skipped optional scope. Preserve its uncapped progress loop and stalled-progress pauses; Suggestions remain report-only. The generated procedure's warning-tolerant archive wording does not satisfy this stricter stage acceptance.

## Human-input boundary

Relay every required question with the complete finding, investigation/attempted fixes, evidence, options, consequences, recommendation and requested scope. Pause the affected stage and all dependents; keep safe work and stage history. Invocation does not answer consequential choices, waive required checks, broaden edits or approve tool use. On explicit scoped input, delegate current-state reconciliation before returning the answer to the affected stage; retain the same target and constituent history.

## 4. Finalize through the installed archive procedure

Full lifecycle invocation explicitly chooses **Sync now when needed, then archive only after acceptance**, or **Archive now when already synced**, after accepted verification. Record that choice for the archive delegate; still show its combined delta analysis. This is finalization authorization, not confirmation of incomplete-artifact/task warnings or a tool-permission bypass. Standalone implement/verify invocations retain their separate-finalization boundary.

Read [finalization evidence and pause boundaries](./references/evidence-and-recovery.md) before dispatch. Delegate a read-only guard of current verification acceptance and the sticky identity, then run the resolved `openspec-archive-change` in one sequential general-purpose Agent with its installed sync path and recorded choice. Follow the installed procedure, including optional archive inputs, status-authoritative delta inventory and store-aware roots. Pause on completion warnings, conflicting context, ambiguity or failures; return the full question/evidence rather than answering it from invocation.

When sync is needed, the archive agent obtains one valid specs-instruction snapshot before writes and reuses it for inline `openspec-sync-specs`. Wait synchronously for sync, including a delegated sync if the host requires one. Accept only the archive procedure's built-in comparison across every selected capability, not the sync worker's success summary. Preserve semantic merges and unaffected content; rules constrain spec content only. No new finalizer or independent sync assessor is involved. With no status-resolved deltas, use the built-in no-sync/no-rules-lookup path; already-synced deltas retain their assessment and Archive now choice. Skipping needed sync cannot complete the lifecycle.

Require exclusive operation on the selected change/main specs. Capture the complete change-directory inventory/content identity, including metadata, before the built-in whole-directory move. After it returns, delegate filesystem confirmation of the same target, source absence and complete matching destination. This confirms the move, not synchronization. A destination collision, failed move or moved-but-unconfirmed state is not completion; preserve safe work and both paths for reconciliation, without overwrite, merge or an automatic alternate name.

## Completion and explicit recovery

Report lifecycle complete only with accepted groom/readiness, implementation and verification evidence, accepted built-in sync comparison (or already-synced/no-delta assessment), and confirmed whole archival. Distinguish verification accepted, sync attempted, sync accepted and archive confirmed. Retain full child reports, target identity, readiness dispositions, counts, actual checks/results, skipped scope, edited files, sync analysis/comparison and archive source/destination/inventory evidence. Report each stage as accepted, blocked, failed, interrupted, partial or unstarted, with actual child outcomes and reasons; leave dependent work unstarted and preserve safe edits. Interruption can prevent a report: missing output is not evidence that no writes or move occurred.

On an **explicit restart/resume request**, read [the recovery procedure](./references/evidence-and-recovery.md#explicit-restartresume) and delegate read-only reconciliation before any dispatch. Recheck identity, prerequisites, authorization, current predecessor evidence, selected delta effects and both active/archive locations, including inventories/content and metadata. Continue only remaining authorized work with constituent history intact; refresh stale affected acceptance. Expected sync edits and archive relocation are recorded transitions, not automatic reasons to replay implementation. A complete matching archive with current full predecessor/sync evidence permits observed completion without another move or active-change invocation. Ambiguous paths, missing archived receipts or identity drift pause with concrete options; preserve state rather than automatically reopening or rolling back.

A fresh active invocation without usable receipts establishes acceptance from current files; it is not a native checkpoint or a budget reset. No commits, pushes, PR delivery, rollback or automatic Git management are authorized by this skill. Distribution tests and model-free traces establish static contract coverage, not model obedience or operational readiness; live exercises require separate authorization and disposable targets.
