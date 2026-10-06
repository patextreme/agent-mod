# Proposal

## Why

The package needs a distributable skill-based toolkit for explicit OpenSpec stages and single-issue delivery, rather than another repository-specific workflow engine. Lace's existing skills provide that starting point; migrating them now establishes the skill-first direction without implementing a queue-driven factory.

## What Changes

- Import `orc-openspec-groom`, `orc-openspec-implement`, `orc-openspec-verify`, `orc-pr-review-repair`, `orc-issue-to-pr`, and `cleanup-merged-issues`, including all bundled references, from `input-output-hk/lace-id-portal` wallet-sync commit `480e7d565e63469055caf7da75c98efb00d3b415`.
- Preserve source orchestration, thresholds, budgets, escalation, publication and cleanup contracts. Do not transplant the stricter acpx flow policy.
- Repair checkout-specific dependency links and export the skills through the existing Pi manifest and Nix skills package. Keep `origin/develop`, `issue-<n>`, exact `openspec` routing label and signing/DCO conventions rather than adding configuration.
- Document Agent/nested delegation, codemode/SubagentWorkflow, Git/GitHub, signing, OpenSpec CLI and externally supplied skill prerequisites. Keep the existing packaged `openspec-review`; do not bundle generated OpenSpec skills or `code-review`.
- Record source provenance and the author's confirmed permission to redistribute under this repository's MIT license.
- Validate frontmatter, bundled references, package contents and discovery independently of global user resources; do not execute the skills or require a live factory run.
- Supersede unimplemented `issue-to-pr-flow` and `pr-review-flows` planning rather than implement competing acpx lifecycles.

## Capabilities

### New Capabilities

- `factory-skill-distribution`: Package discovery, bundled resources, provenance and external prerequisites for the six-skill toolkit.
- `openspec-skill-orchestration`: Source-faithful delegated grooming, task-group implementation and verification/repair.
- `pr-review-repair-orchestration`: Fresh two-axis review, history-aware judgment, reserved repair accounting and verified publication.
- `issue-to-pr-orchestration`: Explicit single-issue routing, worktree reuse/provisioning, implementation, delivery and delegated PR review/repair.
- `merged-issue-cleanup`: Explicitly confirmed cleanup of safely matched merged issue branches/worktrees and stale remote-tracking refs.

### Modified Capabilities

None. Existing acpx capabilities remain unchanged until the separate `retire-acpx-flows` change.

## Impact

- New directories under `skills/`; existing `package.json` skills declaration and recursive Nix copy already cover this layout. Add packaging-focused tests/documentation and wire them into existing quality gates where appropriate.
- Requires an enhanced Pi environment providing orchestration tools; stock Pi installation alone does not supply them. Other skills and credentials remain operator-managed prerequisites, not installation guarantees.
- Reuse is limited to repositories compatible with the retained delivery conventions. Target-project instructions and mandatory delivery gates remain controlling; do not weaken them to accommodate hardcodes.
- No flow deletion, runtime extension, dependency installer, queue selection, automatic merge, generalized cleanup, sync or archive orchestration. Missing finalization/full-pipeline skills are tracked in GitHub #47 and #48.
