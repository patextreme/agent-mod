---
name: orc-openspec-implement
description: Implement an OpenSpec change by delegating task groups sequentially, independently verifying changes, and repairing technical failures. Use when asked to orchestrate implementation or apply a change with subagents.
compatibility: Requires Agent and SubagentWorkflow tooling, codemode for optional incremental coordination, openspec CLI, and the openspec-apply-change skill.
---

# OpenSpec Implementation Orchestration

Act only as the orchestrator: delegate investigation, implementation, repair, and verification. Use the installed `openspec-apply-change` skill as the implementation procedure, scoped to each agent's assigned task group.

## Installed dependencies

Resolve `openspec-apply-change` from the invoking environment's available-skill information. Read the resolved SKILL.md and pass its absolute path, together with explicit repository/worktree and applicable change/store context, to delegates. If a required skill is unavailable, pause with the missing prerequisite; do not invent a checkout or home-directory path or substitute another procedure.

## Execution

Read [the orchestration pseudocode](./references/pseudocode.md) before launching agents. Use `SubagentWorkflow` for sequential task-group dispatch and repair loops; codemode may coordinate preparation, evidence assessment, and escalation. The pseudocode defines control flow; the stage contracts below define delegated work and completion criteria. The main orchestrator owns scheduling and evidence acceptance. Human-input branches pause execution and resume explicitly with the user's answer.

Run one task group at a time through implementation, repair, independent verification, and bookkeeping. Workers have task-scoped repository access within the selected action context, not file whitelists. They may edit files required by the assigned tasks while preserving unrelated work and recorded intent. Read-only investigations may run concurrently when independent; implementation workers do not.

## Stage contracts

1. **Prepare.** Spawn a read-only `general-purpose` Agent to follow `openspec-apply-change` through selection, status, apply instructions, and context loading. Pass the repository path and requested change/store. Require the resolved selection, schema, progress, CLI state, context paths, and remaining groups with exact task ids and dependencies. Likely touched files are advisory, not edit restrictions. Preserve CLI blocked/all-done states and ask when selection is ambiguous.
2. **Schedule.** Order whole task groups by dependencies. Release a group only after prerequisite completion is independently verified and bookkept. Retain accepted evidence and pass it to subsequent workers; reconcile it against actual state on resume. Do not create file-ownership plans.
3. **Implement and repair.** Give a `general-purpose` Agent the repository path, exact change/store, assigned task ids, prerequisite evidence, implementation skill path, and any repair findings with reproduction evidence. Require project instructions, relevant checks, actual changed files, completed ids, and blockers. Explicitly override the apply skill's whole-change loop, immediate checkbox updates, and pause-on-technical-error rules: stop after the assigned group, leave checkboxes to bookkeeping, and repair technical failures autonomously within recorded intent. Editing another necessary file is not added product scope. Design/product/architecture decisions and external authorization still require input; preserve user interruptions and action-context constraints. Workers do not commit, push, create PRs, archive, or sync specs; return evidence to the parent for separately authorized delivery.
4. **Verify and continue.** Spawn a separate read-only Agent to inspect the group's actual changes, assigned requirements, prerequisite regressions, and relevant checks. Do not assess unfinished future groups as missing work. A worker summary alone is insufficient. Send technical findings to an implementation worker, then repeat independent verification. Recurring findings without edits or new evidence return to the main orchestrator for delegated investigation and a revised brief, not another unchanged retry. Once verified, a bookkeeping subagent marks only verified tasks complete and confirms fresh apply progress before dependents start.
5. **Finish.** Delegate integrated checks and a fresh apply-status read. Route technical failures through repair and fresh verification; pause for genuine decisions or external authorization. Report change/store, completed/remaining tasks, changed files, checks, and blockers. Claim completion only when all specified tasks and required checks pass. Leave archiving and spec syncing to separate requests.
