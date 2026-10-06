# Tasks

## 1. Distribute the OpenSpec stage skills

- [x] 1.1 Import the pinned `orc-openspec-groom`, `orc-openspec-implement` and `orc-openspec-verify` directories into `skills/` with their pseudocode references; verify file inventory and source diffs preserve the stage contracts, no arbitrary groom/verify cap and separate structural validation.
- [x] 1.2 Replace the source-relative external verification link with available-skill resolution and absolute delegate paths; verify no migrated stage references Lace's `.agents/skills`, this checkout's `.pi/skills`, or developer home paths.
- [x] 1.3 Add stage-resource/frontmatter/link checks and stage usage/prerequisite documentation together; verify tests cover the three names/references and docs distinguish grooming, implementation, verification and separate sync/archive.
- [x] 1.4 Record pinned source URL/commit and author-confirmed MIT permission in toolkit provenance/license notices; verify the license/provenance applies to imported references as well as SKILL.md files.

## 2. Distribute PR and single-issue orchestration

- [x] 2.1 Import `orc-pr-review-repair` with both references; verify pinned-source comparison retains fresh history-free axes, separate history-aware judgment, material repair thresholds, verified reservations and cumulative ten-attempt accounting.
- [x] 2.2 Import `orc-issue-to-pr` and pseudocode, resolve sibling and external skill paths for nested worktree delegates, and preserve hardcoded conventions; verify source comparison retains exact-label routing, existing-change selection, signed/DCO delivery, normal pushes, mandatory final-head gates and no merge/sync/archive.
- [x] 2.3 Extend frontmatter/reference/package checks for both skills and document their external code-review/signing/GitHub prerequisites and publication authority; verify docs describe single-issue operation, nested tooling/depth constraints and compatible-repository limits without universal Claude or external-skill availability guarantees.

## 3. Distribute explicitly confirmed cleanup

- [x] 3.1 Import `cleanup-merged-issues` unchanged except provenance/documentation adaptations; verify source comparison retains human-only invocation, issue-ref matching, exact merged/head evidence, clean worktree checks, approval/recheck, guarded local deletion and restricted pruning.
- [x] 3.2 Add cleanup metadata/distribution checks and usage documentation together; verify `disable-model-invocation: true`, explicit post-preview confirmation, no remote deletion and no automatic cleanup from issue-to-PR remain visible, without executing deletion commands.

## 4. Verify installed package resources

- [x] 4.1 Add model-free isolated Pi resource-discovery coverage using a temporary project and explicit package resources without global defaults; verify all six skills and bundled references are discovered while absent external skills do not require model or workflow execution.
- [x] 4.2 Verify npm dry-run/package contents and recursive Nix `pi-skills` inclusion, and wire packaging tests into npm/Nix gates as needed; verify packaged resources contain all imported files without relying on source-checkout paths or adding orchestration runtime dependencies.
- [x] 4.3 Finish the README prerequisite/convention matrix and lifecycle/assurance limitations, linking #47/#48 and separate acpx retirement; verify it distinguishes package-supplied openspec-review from external procedures/tools and makes no claim of stock-Pi support or live validation.

## 5. Integration acceptance

- [x] 5.1 Run format → lint → typecheck → test and strict validation for `migrate-factory-skills`; verify passing gates and review every imported directory's intentional differences against pinned source rather than relying on keyword tests as behavioral proof.
- [x] 5.2 Run `nix flake check` if package manifests or Nix wiring changed; verify refreshed dependency/hash state if applicable and confirm existing flow code and unrelated resources are unchanged by this migration.

Acceptance note (W2): the user explicitly confirmed that the five prompt
removals are intentional work **outside** `migrate-factory-skills` and authorized
a separate commit. Commit `e3c8e4261af9a7f5903e5a83e90d4bc14ff760d0`
contains only deletion of `prompts/commit-create-commit-signoff.md`,
`prompts/commit-create-commit.md`,
`prompts/commit-generate-message-conventional.md`,
`prompts/commit-generate-message.md`, and `prompts/review.md`, plus exactly their
five README prompt-table rows. This user-authorized independent commit is the
baseline exclusion for migration verification; it does not broaden migration
scope or authorize other resource changes. This acceptance note is not part of
that commit.

After inspecting the actual commit and the remaining tracked/untracked
migration diff against that baseline, 5.2 is complete: remaining work is limited
to the six imported skill directories, `skills/LICENSE`,
`skills/FACTORY-PROVENANCE.md`, `scripts/factory-skills.test.mjs`, factory-skill
README additions, npm/Nix test wiring, and this task bookkeeping. Existing
`flows/`, `extensions/`, surviving prompts, `skills/acpx-flow/`, and
`skills/openspec-review/` are unchanged. Dependency declarations,
`package-lock.json`, and `npmDepsHash` are unchanged; no hash refresh is needed.
W1's notice, provenance, test, and Nix repairs were preserved byte-for-byte.

Validation: format → lint → typecheck passed (format/lint reported only the
pre-existing broken `result` symlink); the final standalone `npm test` run
passed 525 tests with one Nix-output-only test skipped. Strict OpenSpec validation
passed. `nix flake check` passed on a temporary Git source snapshot containing
all tracked and untracked migration files, without staging them in this
checkout. The ordinary checkout invocation omitted untracked imports and
failed to find the new test; a concurrent npm/Nix run then hit the unchanged
groom CLI test's 45-second timeout. Standalone reruns passed both full suites.
No push, spec edits, sync, or archive was performed.

## Workflow follow-up

- Deliver this migration before implementing `retire-acpx-flows`.
- Preserve superseded acpx plans under `openspec/superseded/` without syncing their deltas or marking their tasks implemented; #34 is closed as superseded, not completed.
- Track skill-based finalization in [#47](https://github.com/patextreme/agent-mod/issues/47) and full lifecycle composition in [#48](https://github.com/patextreme/agent-mod/issues/48); neither is an implementation task in this change.
- Sync/archive only after separately requested review/finalization; no implementation task invokes cleanup, publication, target-project workflows or archival as a packaging test.
