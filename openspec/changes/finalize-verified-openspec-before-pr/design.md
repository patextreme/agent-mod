# Design

## Context

The `orc-issue-to-pr` OpenSpec route today ends implementation stages at verify and explicitly excludes sync/archive from the finish contract (SKILL.md stage 6, "Single-issue lifecycle limit" requirement). The installed environment already provides the generated `openspec-archive-change` and `openspec-sync-specs` skills (listed as external skills in `scripts/factory-skills.test.mjs`), including the archive procedure's post-sync comparison and no-delta path. PR review/repair currently receives issue/spec context but has no notion of an archived change. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Insert finalize between verify and deliver with explicit authorization, pause, gating, receipts, resume, and archived-repair semantics fixed in the specs.
- Keep the change lean: pure skill/reference/test/documentation edits; no new runtime, no new orchestrator skill.

**Non-Goals:**
- No separate finalizer skill, fresh sync assessor, or acpx flow integration.
- No changes to base-branch semantics (the skill's `develop` base vs this repo's `main` mismatch predates this change), verification-stage behavior, direct-edits route, signing/delivery/final-head-gate policies, or retire-acpx-flows.
- No automatic merge or worktree removal.

## Decisions

- **Reuse the installed built-in archive procedure** (with its `openspec-sync-specs` dependency, post-sync comparison, and no-delta path) instead of a standalone finalizer or flow-owned sync: it already encodes the needed semantics, and issue #49 explicitly supersedes the #47 standalone-finalizer approach (rejected PR #54 was overengineered).
- **Preauthorization is passed to the procedure, not used to bypass its prompts**: the delegate receives explicit authorization for sync/archive after accepted verification, while the built-in procedures' own warning/conflict branches still pause. This keeps "invocation authorizes" and "blockers pause" in one mechanism.
- **Archival confirmation is a delivery gate**: source absence + archived destination presence for the selected target, plus the built-in no-delta path, must hold before delivery dispatch; receipts from the delegated run are the evidence.
- **Archived-intent handling lives in `orc-pr-review-repair`'s preparation and repair contracts**: archived location + relevant main specs are preparation inputs; repair rules distinguish in-scope (stay archived), behavior-changing (check code + archived artifacts + main specs together, update documents, rerun affected validation), and new-intent (user authorization).
- **Resume is receipt-and-state reconciliation** in a bundled reference document, mirroring the existing delivery-stage reconciliation pattern rather than new state machinery.
- **Validation stays within the packaging-validation boundary**: `scripts/factory-skills.test.mjs` gains the new reference files in its fixture maps plus model-free contract fixtures (static checks of skill/reference text and scenario coverage) for successful finalization, no-delta, rejected sync, archive failure, resume, and post-archive repairs.

## Risks / Trade-offs

- [Skill-text prompts constrain agents, not runtime] → Model-free fixtures pin the required contract text/scenarios; documentation states the static-assurance limit already established for the toolkit.
- [Archived artifacts could drift from code after repairs] → Behavior-changing repairs are required to re-check all three sources and rerun affected validation before final-head acceptance.
- [Duplicate archives on resume] → Resume reconciliation requires detecting archived state before any move and treating existing destinations as blockers, consistent with the built-in procedure's collision behavior.

## Open Questions

None material; scope decisions were fixed by the repository owner.
