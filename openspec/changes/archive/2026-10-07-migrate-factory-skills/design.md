# Design

## Context

See `proposal.md` for motivation and the five capability deltas for observable contracts. The repository already exports `./skills` in its Pi manifest and copies that directory recursively into `pi-skills`. It currently packages `openspec-review` and `acpx-flow`; generated OpenSpec procedures live under `.pi/skills` but are not manifest resources. No extension here supplies Agent, codemode or SubagentWorkflow.

The source is `input-output-hk/lace-id-portal`, wallet-sync commit `480e7d565e63469055caf7da75c98efb00d3b415`. Six `.pi/skills/<name>` directories contain six SKILL.md files and six references: one pseudocode file for each of the five orchestrators, plus PR report contracts. Cleanup has no script or bundled reference. The author confirmed personal authorship and permission for MIT redistribution during planning; record this grant with the pinned origin.

## Goals / Non-Goals

**Goals:** Faithful distribution with only installation/path/provenance adaptations; clear external prerequisites; safe composition of the source's nested orchestration; packaging checks independent of global resources.

**Non-Goals:** Reproduce deterministic acpx enforcement, supply an orchestration runtime, install external skills, make hardcoded repository conventions configurable, prove model obedience, or provide queue selection/finalization/full-pipeline parity.

## Decisions

### 1. Preserve the six source directory names and bundled hierarchy

Import each full directory into `skills/<source-name>/`. Retain frontmatter names/descriptions and cleanup's `disable-model-invocation: true`. Keep pseudocode/report-contract references colocated and relative to their skill. Do not flatten resources into prompts or introduce executable wrappers. The existing Pi manifest and Nix recursive copy already provide the distribution boundary; change them only where test wiring actually needs it.

Alternative: rename/reorganize everything around a generic factory namespace. That changes cross-skill links and invocation unnecessarily and obscures source fidelity.

### 2. Keep source behavior, not old flow compatibility

Treat the pinned SKILL.md and references as the behavioral baseline, summarized by the delta specs. In particular, groom/verify have no arbitrary iteration cap but pause on stalled progress or blockers; grooming does not structurally validate; implementation verifies task groups and serializes shared bookkeeping; PR repairs retain verified reservations and a cumulative ten-attempt budget. Do not add the acpx ten-update/repair caps, classifier protocols, seven-day terminal steering, structured CLI envelopes or whole-invocation guarantees.

The issue orchestrator separately validates structure/readiness after grooming, so it does not conflate Critical-free review with implementation readiness. Do not alter ordinary external apply/verify/update procedures to make orchestration work. Keep human-input branches and scope boundaries as written. Invocation-level edit/publication authority is not a permission bypass, and delegated read-only instructions are not an OS sandbox.

Alternative: transplant current flow safeguards. Rejected by the user's explicit source-adoption decision; future policy changes need their own change and evidence.

### 3. Resolve external skill dependencies rather than ship generated copies

Keep packaged `openspec-review` available by its declared skill name. Treat `openspec-apply-change`, `openspec-verify-change` and `code-review` as operator-supplied available skills. Replace the verification link into Lace's `.agents/skills` with installed-skill lookup instructions. Resolve dependency locations from the invoking environment's available-skill information, load those files and pass absolute paths with explicit repository/worktree/change/store context to delegates. Do not invent a fixed Pi-directory search order or a home path. An unavailable required dependency remains the source skill's prerequisite blocker; do not silently substitute flow-owned prompts.

Sibling `orc-*` links remain relative within this package and are resolved to absolute paths before worktree dispatch. External skills need not exist in a newly provisioned worktree. Do not export this repository's `.pi/skills` merely because files happen to be included in a tarball.

Alternative: bundle all generated procedures and code-review. Rejected because the operator chose an explicit external-prerequisite model, avoiding duplicate skill identities and maintained copies.

### 4. Document the enhanced runtime and nested orchestration

Add a prerequisite matrix to the README/toolkit usage documentation: Agent/general-purpose and nested delegation; codemode; SubagentWorkflow for implementation and applicable composition; OpenSpec CLI and store-aware commands; external skills; Git/gh access and signing for delivery; issue-tracker setup required by code-review. Package installation exposes instructions only and does not provide these tools or credentials.

Preserve source composition: outer issue-to-PR uses Agent/codemode and delegates nested orchestrators rather than wrapping them in an outer SubagentWorkflow. Implementation uses dependency-aware task-group dispatch. Workflow invocations must respect the host's explicit opt-in and depth constraints; loading a skill that directs workflow use follows that host's authorization rules, not a new runtime shim.

Alternative: a stock-Pi fallback or runtime extension. Both would become a separate implementation project and change the scope.

### 5. Retain delivery conventions and limit portability claims

Keep `origin/develop`, worktree/branch `issue-<n>`, exact `openspec` label routing, signed/DCO commits, source PR history markers and normal pushes. Cleanup remains issue-branch-only and uses its own verified repository/remote policy rather than assuming origin. Do not broaden it to arbitrary PR branches or allow invocation alone to confirm deletion. Issue-to-PR respects required target-project gates, including a current-head Claude gate only where the target policy requires it; this is not a universal Claude dependency.

State plainly that installation is reusable but delivery requires compatible conventions. Preserve controlling project policy and pause on incompatibility; do not add a configuration abstraction or weaken project gates.

### 6. Validate distribution without exercising external authority

Add repository-owned, model-free tests for the six names, frontmatter (including cleanup's invocation mode), bundled reference targets and absence of source-specific external links. Check package contents with npm's dry-run/temporary packaging surface and use Pi resource discovery from a fresh temporary project with global/project defaults excluded. Assert presence of the six definitions and bundled resources without dispatching agents, expanding execution into a model run, contacting GitHub, signing or supplying external skill implementations. Wire tests into npm/Nix quality gates; use the existing root SDK dependency rather than add a runtime dependency solely for discovery.

Record source comparison expectations for each migrated directory and explain every intentional path/provenance/documentation difference. Static/discovery tests support distribution, not real-world safety or model adherence. Do not expand this work into package-wide publish filtering or live semantic evaluation.

## Risks / Trade-offs

- [Source skills are prompt contracts, not deterministic guards] → Disclose this boundary and avoid claiming acpx-equivalent results, isolation or recovery.
- [Hardcoded develop/origin/signing limits reuse] → Document compatible conventions and preserve blockers on incompatible policy; configuration remains deferred.
- [External skill availability/collisions vary] → Document prerequisites and pass the actually resolved absolute paths; packaging tests do not assert external availability.
- [Nested workflow depth can block dispatch] → Preserve outer Agent/codemode coordination and source nested-tool requirements.
- [Deletion/publication instructions can cause destructive effects] → Preserve cleanup confirmation/snapshot checks and source PR ownership/history contracts; do not execute either during migration validation.

## Migration Plan

1. Import the six pinned directories with references and MIT provenance; adapt dependency lookup only.
2. Document installation, prerequisite matrix, source conventions and exact lifecycle/assurance boundaries; link finalization #47 and pipeline #48.
3. Add model-free packaging/discovery tests and run format → lint → typecheck → test; run Nix checks if manifests/Nix wiring change.
4. Validate this OpenSpec change. Keep the existing acpx implementation untouched here; deliver `retire-acpx-flows` afterward.

The former `issue-to-pr-flow` and `pr-review-flows` planning is superseded, preserved outside active changes under `openspec/superseded/`, with no tasks falsely completed or deltas synced. GitHub #34 closes as not planned once this replacement is recorded. No corresponding issue-to-PR GitHub issue was found. Rollback removes/disables the new skill resources and test/docs wiring; it does not undo target-project Git effects because this migration executes none.
