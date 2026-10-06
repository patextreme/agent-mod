---
name: orc-openspec-implement
description: Implement an OpenSpec change by delegating one task group per subagent. Use when asked to orchestrate implementation or apply a change with subagents.
compatibility: Requires Agent and SubagentWorkflow tooling, codemode for optional incremental coordination, openspec CLI, and the openspec-apply-change skill.
---

# OpenSpec Implementation Orchestration

Act only as the orchestrator: delegate investigation, implementation, and verification. Use `openspec-apply-change` as the implementation skill (the installed equivalent of `openspec-implement`), scoped to each agent's assigned task group.

## Installed dependencies

Resolve `openspec-apply-change` from the invoking environment's available-skill information. Read the resolved SKILL.md and pass its absolute path, together with explicit repository/worktree and applicable change/store context, to delegates. If a required skill is unavailable, pause with the missing prerequisite; do not invent a checkout or home-directory path or substitute another procedure.

## Execution

Read [the orchestration pseudocode](./references/pseudocode.md) before launching agents. Adapt it into codemode calls or a `SubagentWorkflow` script: use codemode for incremental, judgment-heavy coordination and SubagentWorkflow for deterministic loops and pipelines. The pseudocode defines control flow; the stage contracts below define delegated work and completion criteria. Retain orchestrator judgment for assessing evidence, preparing briefs, and escalating decisions. With either tool, human-input branches must pause execution and resume explicitly with the user's answer.

Use `SubagentWorkflow` for task-group dispatch and dependency-aware progression; codemode may coordinate preparation, evidence assessment, and escalation around it.

## Stage contracts

1. **Prepare.** Spawn a read-only `general-purpose` Agent to read and follow `openspec-apply-change` through change selection, status, apply instructions, and context loading. Pass the repository path and requested change/store. Require the resolved change/store, schema, progress, CLI state, context paths, and remaining task groups with exact task ids, dependencies, and likely touched files. Ask the user if selection is ambiguous; preserve blocked/all-done states.
2. **Schedule.** Build a dependency graph from the returned groups. Use one implementation subagent per task group. Run dependent groups sequentially, releasing each only after its prerequisites are verified complete. Parallelize only independent groups with disjoint file ownership and unlikely code conflicts; serialize shared files, uncertain boundaries, and shared build/generated outputs. Use `SubagentWorkflow` for dispatch and dependency-aware progression; let ready groups start without waiting for unrelated work.
3. **Implement.** Give each `general-purpose` subagent the repository path, exact change/store, assigned task ids, owned files, prerequisite results, and implementation skill path. Require it to read and follow that skill and project instructions, implement only its group, run relevant checks, and return completed task ids, changed files, test results, and blockers. Override the skill's whole-change loop: stop after the assigned group. Keep parallel workers' task-checkbox updates pending; serialize them through a bookkeeping subagent after verification, since the task artifact is shared. If ownership expands, pause that group and reschedule before editing overlapping files.
4. **Verify and continue.** Delegate inspection of each group's actual diff and checks before accepting completion; an agent summary alone is insufficient. Have the bookkeeping subagent mark only fully implemented, verified tasks complete. On ambiguity, design changes, added scope, failed checks, or agent failure, report the impediment and pause affected groups and their dependents rather than invent intent or claim success.
5. **Finish.** Once all groups finish, delegate integrated checks and a fresh apply-status read. Report the change id, tasks completed/remaining, changed files, checks, and blockers. Claim completion only when all specified tasks and required checks pass. Leave archiving and spec syncing to separate user requests.
