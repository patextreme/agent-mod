# Factory toolkit provenance

## Pinned source

The six factory skills and their six bundled references originate in
[`input-output-hk/lace-id-portal`](https://github.com/input-output-hk/lace-id-portal),
wallet-sync commit
[`480e7d565e63469055caf7da75c98efb00d3b415`](https://github.com/input-output-hk/lace-id-portal/tree/480e7d565e63469055caf7da75c98efb00d3b415/.pi/skills).
The source root is `.pi/skills/`; the distribution root here is `skills/`.

The following inventory covers **all twelve imported files**, not just skill
entrypoints. Each source path is `.pi/skills/<path>` at the pinned commit; each
installed path is `skills/<path>` relative to this package.

| Skill | Imported files (paths relative to the root above) |
|-------|--------------------------------------------------|
| `orc-openspec-groom` | `orc-openspec-groom/SKILL.md`; `orc-openspec-groom/references/pseudocode.md` |
| `orc-openspec-implement` | `orc-openspec-implement/SKILL.md`; `orc-openspec-implement/references/pseudocode.md` |
| `orc-openspec-verify` | `orc-openspec-verify/SKILL.md`; `orc-openspec-verify/references/pseudocode.md` |
| `orc-pr-review-repair` | `orc-pr-review-repair/SKILL.md`; `orc-pr-review-repair/references/pseudocode.md`; `orc-pr-review-repair/references/report-contracts.md` |
| `orc-issue-to-pr` | `orc-issue-to-pr/SKILL.md`; `orc-issue-to-pr/references/pseudocode.md` |
| `cleanup-merged-issues` | `cleanup-merged-issues/SKILL.md` (no bundled reference or script) |

## MIT redistribution permission

During planning for `migrate-factory-skills`, the source author confirmed personal
authorship and permission to redistribute these skills and their bundled
references under this repository's **MIT license**. This records that
planning-confirmed grant; it does not infer an author identity or claim that the
entire upstream repository has the same license.

The grant covers every file listed above. See the bundled [LICENSE](./LICENSE)
for the complete MIT copyright and permission notice, conditions, and warranty
disclaimer. This copy matches the repository's root LICENSE and travels with
this provenance in both the npm package and standalone Nix `pi-skills` output;
retain both files when redistributing these materials. The local license notice
is not an attribution of upstream authorship.

The grant and pinned origin are recorded in the migration's
[proposal](../openspec/changes/archive/2026-10-07-migrate-factory-skills/proposal.md) and
[design](../openspec/changes/archive/2026-10-07-migrate-factory-skills/design.md).

## Intentional distribution differences

- Move the six directories from `.pi/skills/` to the package's declared `skills/`
  resource root, retaining skill names and the bundled reference hierarchy.
- Replace checkout-specific external dependency paths with lookup from the
  invoking environment's available skills. Load the resolved procedures and pass
  absolute paths and explicit repository/worktree/change/store context to
  delegates; resolve bundled sibling paths from the installed directories before
  worktree dispatch. No dependency relies on Lace's `.agents/skills`, this
  checkout's `.pi/skills`, or a developer home directory.
- Add this provenance/license record and [toolkit usage documentation](../README.md#factory-skill-toolkit).

These are distribution, dependency-path, and explanatory documentation
adaptations **only**, not policy changes. Acceptance thresholds, budgets,
escalation, authorization, publication, and cleanup contracts remain those of the
pinned source; no acpx policy or runtime fallback is substituted. Packaged
`openspec-review` remains available, while `openspec-apply-change`,
`openspec-verify-change`, and `code-review` remain operator-supplied prerequisites.

Distribution/discovery validation is not evidence of live workflow safety or
model adherence. This migration executes no target-project publication or
cleanup and leaves acpx retirement to the separate `retire-acpx-flows` change.
