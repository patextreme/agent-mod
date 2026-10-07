---
name: orc-openspec-implement
description: Implement an OpenSpec change by delegating whole task groups sequentially, verifying each before the next. Use when asked to orchestrate implementation or apply a change with subagents.
compatibility: Requires Agent and SubagentWorkflow tooling, codemode for optional incremental coordination, openspec CLI, and the openspec-apply-change skill.
---

# OpenSpec Implementation Orchestration

Act only as the orchestrator: delegate investigation, implementation, and verification. Use `openspec-apply-change` as the implementation procedure, scoped to each agent's assigned task group.

## Installed dependencies

Resolve `openspec-apply-change` from the invoking environment's available-skill information. Read the resolved SKILL.md and pass its absolute path, together with explicit repository/worktree and applicable change/store context, to delegates. If a required skill is unavailable, pause with the missing prerequisite; do not invent a checkout or home-directory path or substitute another procedure.

## Execution

Read [the orchestration pseudocode](./references/pseudocode.md) before launching agents. Use `SubagentWorkflow` for sequential whole-group dispatch and the repair loop; codemode may coordinate preparation, evidence assessment, and escalation. The pseudocode defines control flow; the stage contracts below define delegated work and completion criteria. Retain orchestrator judgment for assessing evidence, preparing briefs, and escalating decisions.

Run one task group at a time. Workers have task-scoped repository access within the selected action context, not file-ownership whitelists: they edit whatever the assigned tasks require while preserving unrelated work and recorded intent. Read-only investigations may run concurrently when independent; implementation workers do not. Human-input branches pause execution and resume explicitly with the user's answer.

## Stage contracts

1. **Prepare.** Spawn a read-only `general-purpose` Agent to read and follow `openspec-apply-change` through change selection, status, apply instructions, and context loading. Pass the repository path and requested change/store. Require the resolved change/store, schema, progress, CLI state, context paths, and remaining task groups with exact task ids and dependencies. Likely touched files are advisory, not edit restrictions. Preserve blocked/all-done states and ask the user if selection is ambiguous.
2. **Schedule.** Order whole task groups by dependency. Release a group only after the preceding group's completion is independently verified and bookkept. Retain accepted evidence for subsequent workers and reconcile it against actual state on resume. Do not build file-ownership plans.
3. **Implement and repair.** Give a `general-purpose` Agent the repository path, exact change/store, assigned task ids, prerequisite evidence, implementation skill path, and any prior findings with reproduction evidence. Require it to read the implementation skill and project instructions, implement only its group, run relevant checks, and return completed task ids, actual changed files, check results, and blockers. Override the skill's whole-change loop and pause-on-technical-error rule: stop after the assigned group, and repair technical failures autonomously within recorded intent. Editing another file the tasks require is not added scope. Keep task-checkbox updates pending for bookkeeping. Genuine design, product, architecture or authorization decisions still require input; preserve user interruptions and action-context constraints.
4. **Verify.** Spawn a separate read-only Agent to inspect the group's actual changes, assigned requirements, prerequisite regressions, and relevant checks; a worker summary alone is insufficient. Send technical findings back to an implementation worker with the exact reproduction, then repeat independent verification. If the same findings recur with no edits and no new evidence, report the impediment and ask rather than redispatching unchanged work. Once verified, a bookkeeping subagent marks only those tasks complete and confirms fresh apply progress before the next group starts.
5. **Finish.** Once all groups finish, delegate integrated checks and a fresh apply-status read. Report the change/store, tasks completed/remaining, changed files, checks, and blockers. Claim completion only when all specified tasks and required checks pass. Route technical failures through the same repair/verify loop; pause for genuine decisions. Leave archiving and spec syncing to separate user requests.
