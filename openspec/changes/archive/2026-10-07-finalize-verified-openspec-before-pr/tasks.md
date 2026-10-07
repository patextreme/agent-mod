# Tasks

## 1. orc-issue-to-pr skill: finalize stage

- [x] 1.1 In `skills/orc-issue-to-pr/SKILL.md`, extend the dependency-resolution paragraph to include the external `openspec-archive-change` and `openspec-sync-specs` procedures (resolved from the invoking environment like the other external skills, absolute paths passed to delegates, missing prerequisite pauses).
- [x] 1.2 In `skills/orc-issue-to-pr/SKILL.md` stage contracts, insert a **Finalize** stage between **Verify** and **Deliver**: delegate the built-in archive procedure for the same worktree/change/store identity with the invocation's explicit sync/archive preauthorization after accepted verification; accept its post-sync comparison without a separate assessor; preserve the built-in no-delta path; confirm actual archival (source absence + archived presence) before delivery; keep the pause conditions (incomplete artifacts/tasks, sync conflicts, failures) and preserve safe work, receipts, and blockers.
- [x] 1.3 Update the OpenSpec flow in `skills/orc-issue-to-pr/SKILL.md`: add the finalize step after Verify (verify stays verification-only) and continue to Deliver only after confirmed finalization.
- [x] 1.4 Update the Finish contract in `skills/orc-issue-to-pr/SKILL.md`: on the OpenSpec route, remove "OpenSpec archiving, and spec syncing" from the separate-requests list, require confirmed finalization for completion, report finalization/archive receipts, and keep merging and worktree removal as separate requests.

## 2. orc-issue-to-pr references: pseudocode, finalization, receipts

- [x] 2.1 Update `skills/orc-issue-to-pr/references/pseudocode.md`: insert the finalize delegation between verify and delivery in the control flow, including its pause branches and the delivery gate on confirmed archival; extend the resume block to cover already-finalized changes, partial sync/archive, and partial delivery without replay.
- [x] 2.2 Add `skills/orc-issue-to-pr/references/finalization.md`: the delegated finalization contract — dependency resolution, invocation-scoped preauthorization passed to the archive procedure, pause conditions (incomplete artifacts/tasks, conflicts, failures), no separate finalizer/assessor, no-delta path, archival confirmation, and delivered-content requirements.
- [x] 2.3 Add `skills/orc-issue-to-pr/references/finalization-receipts.md`: receipt fields for synchronization results, archived change location, delivered contents, and the resume/reconciliation procedure for already-finalized changes, partial sync, partial archival, and partially completed delivery without duplicate moves or replayed operations.
- [x] 2.4 Link the two new reference documents from `skills/orc-issue-to-pr/SKILL.md` and keep all links relative and resolvable from the installed skill directory.

## 3. orc-pr-review-repair archived-intent handling

- [x] 3.1 In `skills/orc-pr-review-repair/SKILL.md` preparation contract, accept the archived change location and relevant main specs as preparation inputs (supplied by `orc-issue-to-pr` after finalization) and load archived planning artifacts as requirements evidence alongside the originating issue.
- [x] 3.2 In the repair contract, add archived-intent rules: in-scope repairs keep the change archived; behavior-changing repairs check code, archived artifacts, and main specs together, update affected documents, and rerun affected validation before final-head acceptance; code-only corrections must not reopen/rearchive the change or rerun the lifecycle; new requirements or consequential design changes require user authorization; archival does not exempt repairs from validation.
- [x] 3.3 Update `skills/orc-pr-review-repair/references/pseudocode.md` (and `report-contracts.md` only if receipts reference sources) so the repair loop's sources include archived artifacts/main specs and the escalation/authorization branch covers new-intent findings.

## 4. Validation: factory-skills.test.mjs

- [x] 4.1 Add the new `orc-issue-to-pr` reference files (`references/finalization.md`, `references/finalization-receipts.md`) to the `factorySkills` fixture map in `scripts/factory-skills.test.mjs`.
- [x] 4.2 Add model-free contract fixtures covering the required finalization scenarios within the packaging-validation boundary: successful finalization, no-delta changes, rejected sync, archive failure, resume, and post-archive PR repairs — static checks that the skill/reference text contains the required contract elements (no live workflows, GitHub, signing, or external-skill execution).

## 5. Documentation

- [x] 5.1 Update `README.md` toolkit sections: add the finalize stage to the issue-to-PR example command list only if invocation usage changes, describe pre-PR finalization in the "Stage and lifecycle boundaries" Issue-to-PR bullet (completion includes confirmed finalization; merging/worktree removal remain separate; cleanup unchanged), update the PR review/repair bullet for archived-evidence handling, and refresh the `#47`/`#48` note that skill-based finalization now lands in `orc-issue-to-pr` per issue #49.
- [x] 5.2 Update the README "Skill dependencies" prerequisite row to include `openspec-archive-change` and `openspec-sync-specs` as externally supplied skills required by the OpenSpec issue route.

## 6. Spec delta upkeep and validation

- [x] 6.1 Keep the delta specs in this change authoritative while implementing: if an implementation detail contradicts `specs/issue-to-pr-orchestration/spec.md` or `specs/openspec-pr-finalization/spec.md`, update the skill/reference text to match the deltas (not the reverse).
- [x] 6.2 Run `openspec validate finalize-verified-openspec-before-pr` (structural validation of the change and deltas) and confirm `openspec status --change finalize-verified-openspec-before-pr` reports all artifacts complete.
- [x] 6.3 Run the repository quality gates (`npm run check`, `npm run typecheck`, `npm test`) and confirm `scripts/factory-skills.test.mjs` passes with the new fixtures.

## Workflow follow-up

- Archive applies the deltas to `openspec/specs/issue-to-pr-orchestration/` and creates `openspec/specs/openspec-pr-finalization/` only after this change itself is implemented and verified; do not edit main specs directly.
