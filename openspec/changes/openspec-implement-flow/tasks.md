# Tasks

## 1. Organize flow ownership and shared infrastructure

- [x] 1.1 Move groom composition into `flows/openspec-groom/flow.ts` with an `index.ts` entrypoint and colocated helpers/tests; verify existing groom unit and integration tests pass at the new path with unchanged routing and budget behavior.
- [x] 1.2 Move terminal steering, shared skill-expansion tests, and fake-agent fixtures into `flows/shared/`; extract only genuinely reused command/local-target helpers, keeping groom artifact authorization flow-specific; verify steering, target-safety, and fixture-based tests pass.
- [x] 1.3 Update recursive test discovery in package and Nix configuration, fixture/import references, README groom invocation, and AGENTS.md layout guidance; verify JS and Nix commands include nested groom/shared tests and no executable/documented groom invocation references the retired entrypoint.

## 2. Implementation context and agent contracts

- [x] 2.1 Add implement target/context helpers using current OpenSpec status/apply instructions, preserving CLI state and project constraints; verify unit tests reject invalid, archived, store-backed, symlinked, and escaping targets and cover blocked/ready/all-done state.
- [x] 2.2 Define implementer reports, current task snapshots, gate evidence, and scoped blocker/steering packets; verify parser tests cover usable reports, malformed data, missing/stale/failing gate evidence, and explicit justification for no applicable gates.
- [x] 2.3 Build initial-apply and repair prompts that explicitly select changeId, read apply context, report pauses instead of awaiting inner interaction, delegate multiple substantive groups, sequence dependencies, consolidate checkboxes, and run current gates; verify prompt tests cover single-group work, delegation ownership, initially completed tasks, and scope-limited accumulated steering.
- [x] 2.4 Document implementer reporting, delegation, gate applicability, and authorization boundaries alongside the new flow in README; verify documentation matches tested prompt and report contracts and explicitly excludes independent verification.

## 3. Decision-driven implementation and repair graph

- [x] 3.1 Add the dependency-injectable flow factory and runnable `flows/openspec-implement/index.ts`, using fresh pi sessions for initial apply, repairs, and the three-choice decision judge; verify graph tests cover refreshed task snapshots, immediate success, unsupported completion decisions, and normal blocker summaries.
- [x] 3.2 Implement repair routing and dispatch accounting with initial apply plus ten repairs and judgment after repair ten; verify tests cover autonomous repair, tenth-repair success, exhaustion for both pause categories, failed dispatch accounting, and no eleventh repair or post-limit steering.
- [x] 3.3 Add validated escalation packets and reuse terminal human steering before consequential repairs; verify tests cover mixed blockers, explicit scoped plan authorization, accumulated answers across cycles, cancellation, unavailable input, and malformed steering data.
- [x] 3.4 Add phase-result guards and structured terminal outcomes with nonzero unsuccessful exits, preserving edits and avoiding silent invocation retries; verify tests cover agent/command failures, timeouts, unusable judge results, cancellation, and all terminal report fields.
- [x] 3.5 Extend the shared fake-agent fixture and add real FlowRunner/CLI integration coverage for success, repair, steering, budget exhaustion, and invocation failure; verify actual fresh sessions, transcript sequencing, exit codes, and preserved working-tree edits.
- [x] 3.6 Document the new invocation, Mermaid flow, ten-repair semantics, outcomes, human-input behavior, permission limits, and restart/no-rollback policy; verify the documented CLI path loads and example input matches the tested contract.

## 4. Cross-flow integration gates

- [x] 4.1 Run formatting, lint, typecheck, and the full test suite, confirming both migrated groom and implement integration tests execute; verify all commands pass and record any environment-limited gate rather than claiming success.
- [x] 4.2 Run `nix flake check` after package/Nix test-discovery changes and validate this OpenSpec change with `--strict`; verify both succeed without unnecessary dependency changes or stale package hashes.
