---
name: orc-openspec-groom
description: Groom an OpenSpec change by delegating repeated review and Critical-issue repairs to subagents. Use when asked to groom a change or review and fix its planning artifacts until no Critical findings remain.
compatibility: Requires Agent tooling, codemode or SubagentWorkflow, openspec CLI, and the openspec-review skill.
---

# OpenSpec Groom Orchestration

Act only as the orchestrator: delegate artifact investigation, review, and edits to subagents. Keep all rounds in the same repository and change; run review and repair sequentially so each review sees completed edits.

## Installed dependencies

Resolve `openspec-review` from the invoking environment's available-skill information. Read the resolved SKILL.md and pass its absolute path, together with explicit repository/worktree and applicable change/store context, to delegates. If a required skill is unavailable, pause with the missing prerequisite; do not invent a checkout or home-directory path or substitute another procedure.

## Execution

Read [the orchestration pseudocode](./references/pseudocode.md) before launching agents. Adapt it into codemode calls or a `SubagentWorkflow` script: use codemode for incremental, judgment-heavy coordination and SubagentWorkflow for deterministic loops and pipelines. The pseudocode defines control flow; the stage contracts below define delegated work and completion criteria. Retain orchestrator judgment for assessing evidence, preparing briefs, and escalating decisions. With either tool, human-input branches must pause execution and resume explicitly with the user's answer.

## Stage contracts

1. **Review.** Spawn a fresh `general-purpose` Agent. Pass the repository path and requested change id (or ask it to resolve the change using `openspec-review`). Instruct it to locate, read, and follow the `openspec-review` skill, perform a read-only review, and return the resolved change id and full report, including severity counts and review completeness. If selection is ambiguous, ask the user to choose.
2. **Decide.** Read the returned report and have a subagent classify the decisions needed for each Critical repair:
   - **Mechanical/trivial:** The artifacts or established conventions determine the correction without a consequential choice; proceed automatically.
   - **Human input:** The correction requires choosing product direction, accepting high-stakes risk, making a non-reversible commitment, or deciding architecture. Flag the finding, decision, options, and consequences; pause the affected repair and ask the user before proceeding. An already-recorded decision may be applied mechanically; uncertainty about authority requires human input.
   A complete review with zero **Critical** findings ends the loop, even if Major/Minor findings, blockers, or a NEEDS REVISION verdict remain. Flag any outstanding human decisions in the final report without reopening the repair loop. An incomplete review or indeterminate severity is not success: delegate the missing investigation, or report the limitation and request the needed input.
3. **Repair.** If Critical findings exist, spawn a separate `general-purpose` Agent with the exact change id, repository path, and full report. Instruct it to fix the Critical findings in that change's planning artifacts, reconcile affected artifacts, and preserve explicit intent. Leave unrelated findings and implementation code untouched; do not archive or sync specs. Require a summary of edited files, each Critical finding addressed, and anything unresolved. If a repair needs a consequential user decision, have it return the question rather than invent intent.
4. **Repeat.** After repairs finish, return to step 1 with the resolved change id. A repair summary is not proof of success; only a fresh complete review with zero Critical findings ends grooming. Continue without an arbitrary round limit. If a subagent fails, makes no progress, or needs user input, pause and report the impediment rather than claim success or repeat unchanged work indefinitely.

Finish with the change id, review/repair round counts, edited files, and final Critical/Major/Minor counts. Surface remaining findings without repairing them automatically. Remind the user to run `openspec validate <change-id>` separately; zero Critical findings does not establish structural validity or implementation readiness.
