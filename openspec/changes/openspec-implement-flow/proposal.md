# Proposal

## Why

Implementing an approved OpenSpec change currently requires manually restarting work after blockers and deciding whether human guidance is necessary. A bounded implementation flow can coordinate implementation, task-and-gate judging, and human steering without conflating implementation completion with independent verification.

## What Changes

- Add an acpx `openspec-implement` flow accepting a required `changeId` for an active repo-local change.
- Apply remaining tasks, delegating multiple substantive task groups and sequencing dependent work.
- Use a decision-node judge to classify task progress, implementer summaries, and gate evidence as completed, repairable pause, or escalation-required pause.
- Repair within approved scope or collect explicit human steering, with an initial apply plus at most ten repair attempts and a final judge after repair ten.
- Preserve edits on unsuccessful exits; do not commit, archive, roll back, or run an independent verification review.
- Organize each flow's implementation and tests under its own directory, with genuinely shared infrastructure under `flows/shared/`.
- **BREAKING**: move the groom entrypoint from `flows/openspec-groom.flow.ts` to `flows/openspec-groom/index.ts`; document the updated command. Preserve groom behavior.

## Capabilities

### New Capabilities

- `openspec-implement`: Bounded automated implementation of an approved local OpenSpec change, judged by task completion and applicable quality gates, with repair and human escalation.

### Modified Capabilities

None. The groom directory migration is a behavior-preserving refactor, apart from its documented invocation path; its capability is currently an in-flight change, not an existing main spec.

## Impact

- Add `flows/openspec-implement/`; reorganize existing groom helpers, tests, and entrypoint into `flows/openspec-groom/` and `flows/shared/`.
- Update README invocation paths, test discovery in `package.json` and `nix/modules/pi-package.nix`, and any fixture/import paths affected by migration.
- Reuse installed acpx APIs and existing terminal steering; no new dependency is intended.
- Respect OpenSpec apply instructions, project conventions, and permission boundaries. Independent verification is explicitly out of scope.
