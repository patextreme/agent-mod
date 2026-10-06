# Design

## Context

See `proposal.md` for motivation and the interview at `docs/design/issue-to-pr-grilling.md` for decisions. The committed baseline has `openspec-all` and its four constituent factories, but not the implementation currently in flight for `pr-review-flows`. That change is an integration prerequisite for reusing its neutral Git/GitHub/CI and pending-decision mechanics; do not restructure files underneath ongoing work or pretend absent helpers already exist on this branch.

The factories accept a fixed `cwd` dependency but evaluate it inside runtime preflight. Agents and deterministic operations then use the resolved target. `openspec-all/adapter.ts` projects namespaced constituent outputs and deliberately hides parent outputs. Pipeline progress is already keyed by run ID. These are adequate seams for native preparation; no external launcher or nested runner is required.

Installed acpx 0.19.4 has native action/shell preparation, dynamic ACP cwd, checkpoints and persisted traces. It has no public restore/resume/inject-answer API or `flow resume` command. Upstream source checked at `27efb1b57b9de22105a91e9154b1d29b51ede8cb` matches the installed runtime/CLI. References: [workspace example](https://github.com/openclaw/acpx/blob/main/examples/flows/workdir.flow.ts), [runtime checkpoint return](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/flows/runtime.ts#L512-L528), [run allocation](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/flows/runtime.ts#L206-L251).

## Goals / Non-Goals

**Goals:**
- Keep execution, routing, agent sessions and managed-command deadlines native to acpx.
- Put workspace/publication/recovery ownership outside the OpenSpec pipeline.
- Share escalation mechanics, not domain repair authority or acceptance predicates.
- Preserve standalone behavior while making hosted dependencies explicit and testable.
- Separate an issue attempt from any particular acpx run, with durable scoped evidence and cumulative accounting.

**Non-Goals:**
- Implement a graph scheduler, native acpx resume, serialized callback restoration or cross-host coordination.
- Adopt caller dirt, support arbitrary repositories, consume arbitrary GitHub comments as answers, merge PRs or close issues automatically.
- Make worktrees a sandbox, enable YOLO or derive shell commands from issue text.
- Require the PR review flow's Standards/Spec review or comment ledger as an additional issue-to-PR acceptance layer. OpenSpec verification remains the implementation acceptance policy.

## Decisions

### 1. Outer native graph owns the attempt

Add `flows/issue-to-pr/index.ts`, composition in `flow.ts`, contracts and adapters alongside. The conceptual graph is:

```text
preflight → acquire → snapshot/load attempt → prepare workspace/environment
    → plan → active OpenSpec pipeline → finalized-tree gates
    → commit/push → ensure draft PR → observe base/head/CI
        ├─ pending → bounded wait → observe
        ├─ in-scope failure → budget → assess/repair → reverify → push → observe
        ├─ moved base → bounded integration → reverify → push → observe
        ├─ consequential/unknown/external edit → shared escalation → needs_human
        └─ accepted → mark ready → recheck → success

later invocation → load same attempt + answers → validate/reconcile
    → active pipeline OR finalized-result verification OR publication/CI phase
```

Compute nodes transform validated data; side effects live in action/shell nodes with attempt signals and managed commands. Explicit failure routing prevents unsuccessful preparation from dispatching agents. A native parent graph scopes the child pipeline, projects input to `{changeId}` and captures aggregate child results without duplicate CLI output. Terminal child failures become guarded parent outcomes, not swallowed exceptions. Default standalone terminal behavior remains unchanged.

Alternative: an external launcher solves process cwd but obscures preparation in flow traces. A nested `FlowRunner` or subprocess per stage duplicates lifecycle handling. Adding Git fields to every child input unnecessarily widens strict schemas.

### 2. Operator inputs and trusted configuration

Use strict outer inputs with two modes: new attempt (`issueNumber`, optional `baseBranch`, optional `clarificationCommentIds`) and continuation (`attemptId`, optional correlated `answers`). Repository identity is resolved from the invoking checkout and configured GitHub remote; cross-repository or ambiguous mapping fails. Continuations cannot quietly replace intake options. An explicit fresh-start operation can create a successor attempt only after reconciling prior ownership and any existing PR; existing PRs are never silently superseded or duplicated.

Technical defaults, not new product decisions: default base is the repository's GitHub default branch and is also the PR target; selected comments are captured by immutable IDs/content digests; output and branch names are controller-generated. Freeze captured request and trusted setup/gate configuration. New comments or issue edits do not silently mutate that request. A requested material change creates a successor attempt and retains prior evidence.

Add documented operator-owned repository configuration for setup command vectors, local gates, explicitly configured CI gates, environment expectations and finite deadlines. Load it from the trusted invoking repository/configuration before agents can edit the worktree and persist its identity. No agent/issue-derived install commands. Fail before implementation if required OpenSpec, skills, permissions, tools or configuration are missing. Use trusted absolute package entrypoints/skills independently of the target project's baseline. Required GitHub issue/read/check/branch/push/PR authorities are preflight checks; invocation never broadens Pi tool permissions.

### 3. A deep workspace module with explicit disposition

After the PR prerequisite is stable, extract neutral provisioning and executor mechanics to `flows/shared/workspace.ts` and atomic lease mechanics to `flows/shared/ownership.ts`, leaving PR-specific refresh/publication semantics in `pr-shared`. Keep `shared/command.ts` OpenSpec-only. Workspace allocation resolves a branch to one full commit SHA, uses an external durable owned root, creates a detached checkout then a unique working branch, verifies actual HEAD and validates physical paths. Reject unsupported submodule layouts initially rather than claiming worktree completeness.

Separate success from resource disposition: an issue workspace is retained on all outcomes initially, with explicit clean-only removal or operator-authorized discard. Do not reuse PR `finish(true)` forced removal, which would destroy uncommitted OpenSpec output. Record paths before agent dispatch. Reuse requires a physical-workspace lease and validated common Git directory, branch and manifest; dirty content is compared against recorded attempt state, not assumed absent.

Sanitize inherited Git repository/index overrides; use argv execution and a command-local hook policy without changing shared Git config. Provisioning/controller publication suppress unapproved hooks, while approved hooks/setup are explicit trusted configuration. Separate dependency directories and build outputs; do not symlink writable `node_modules` between attempts. Worktree registration/refs are necessarily shared Git state, so caller preservation concerns HEAD/index/content, not byte-identical `.git` metadata.

### 4. Runtime cwd and native graph composition

Widen factory workspace dependencies conceptually to `string | ((context) => string | Promise<string>)`, resolve once during each preflight, then use only the canonical target. The top-level pipeline resolves the prepared path; its children receive a resolver returning its per-run canonical target, including finalize. They must not read `outputs.prepare_workspace`, which scoped projection removes. Never use `process.chdir()`.

Extract the existing namespacing adapter into a neutral composition module only as needed: preserve signals, managed-shell callbacks, permissions, session configuration and failure switches; add explicit child-input projection and parent-controlled terminal result handling. Keep unsupported edge shapes rejected. The issue graph's validated attempt context supplies workspace/change identity to the pipeline without exposing issue inputs to strict local-target validation.

Standalone entrypoints keep their current input, terminal outcomes and fresh-budget restart rules. Hosted re-entry into an active change starts at groom with fresh evidence and restored cumulative counters; it does not skip stages using saved success prose. Already-archived targets remain rejected by pipeline and standalone factories.

### 5. Shared escalation is an internal seam, not an authorization engine

Add `flows/shared/escalation.ts` with a small interface for a complete question packet and either complete validated answers or a durable pending disposition. Reuse `steering.ts` for live TTY collection and extract neutral correlation/freshness mechanics from PR repair. Callers retain their authorizers; the module cannot decide repairs, waive evidence or run graph nodes.

Persist question IDs, recommendations, originating phase, request/target digests, scope, record revision and answer receipts. When durable mode has no applicable answer, save pending questions before returning `needs_human`; expose attempt ID and operator-answer instructions. A later invocation reacquires ownership and checks all answers, scope and state before consuming them. Reject unknown/partial/stale answers; consumed submissions are idempotent, not renewed authority. No GitHub-comment listener is introduced.

Ordinary standalone calls retain existing TTY requirements/timeouts. Hosted callers opt into durable handling through dependencies. Initial planning and finalization failures that do not themselves support steering may be escalated by the outer flow; finalization's internal no-repair/no-steering policy remains intact. Any authorized edits before a finalization retry require fresh implementation verification first.

### 6. Durable domain state and conserved budgets

Store versioned records outside checkout paths under a configurable per-user state root. A record contains canonical repository/issue, attempt/successor IDs, snapshot digests, original baseline plus last integrated target SHA, workspace/working branch, change/archive paths, domain phase, pending/consumed decisions, constituent counters, initial-apply receipt, CI-repair and integration counters, local evidence digests, push/PR/readiness receipts and acpx diagnostic references.

Acquire single-host repository/issue ownership before writing/provisioning and hold through invocation retirement; use revision checks and atomic record replacement. Do not steal uncertain locks after process death. Separate clones contend through canonical GitHub identity, not merely common Git directory. A short-lived invocation lease is distinct from the retained attempt; release it only when owned work has retired.

Persist consumption before any hosted mutation dispatch. Conserved limits include grooming's ten updates, implementation's single initial apply and ten repairs, verification's ten repairs, plus a separate outer CI-repair limit (default ten) and bounded base-integration cycles (default three). Re-entry must not create a free initial apply: if initial apply already occurred, rejudge current state and use remaining counted repairs. Fresh read-only validation at exhaustion can still establish acceptance. Waiting consumes a finite deadline, not a repair attempt; human delay is not active execution time. Exhaustion cannot be waived by an answer or reset by continuing the same attempt.

Recovery routes through ordinary declared graph edges based on validated domain state, not restored node IDs/callbacks. Never edit old acpx run bundles. Unknown effects are reconciled before retrying: a push or PR creation response lost to interruption requires remote inspection, not blind repetition. Materially invalid request/baseline needs a new attempt; base movement incorporated safely is recorded evolution, not an automatic reset of the original identity or budgets.

### 7. Publication and post-finalization verification

Before the initial controller commit, run applicable final-tree gates (sync/archive happened after implementation verification), inspect complete tracked/untracked changes and verify they belong to the attempt. Include archived planning and synchronized main specs. Do not commit dependency/config/secrets accidentally. Only controller code commits and pushes; agents are scoped editors. Normal pushes, expected-head reads, result verification and post-push remote checks protect publication, with races surfaced rather than force-corrected.

Ensure one draft PR for the attempt's canonical repository/head/base and reconcile existing matching PRs after uncertain publication. After finalization, CI repair or integration cannot call `openspec-verify` on an archived target. Add an outer read-only archived-result verifier using the existing verification skill and explicit archived artifact context; apply the same no-Critical/no-Warning/no-missing-evidence criterion plus fresh local gates. It assesses current implementation and consistency of final main specs with preserved deltas. Never unarchive, treat archive collision as success or weaken existing active-target validation. Within-scope repairs retain approved intent; consequential changes require clarification or a successor change/attempt rather than rewriting archived evidence to pass.

### 8. CI, movement and ready transition

Reuse PR CI policy/evidence mechanics, not its review-ledger acceptance predicate. Resolve all required check/status identities and configured gates with complete pagination. Unknown/empty policy is unsupported, not vacuous success. Pending checks wait within finite limits; failed checks create assessed issue-scoped repair work. Default deadlines are configurable finite phase/CI/invocation bounds; preserve timeout versus failure versus unavailable-access diagnostics.

Before acceptance and publication observe current remote head and target SHA. Unexpected head movement always escalates, unlike PR review-fix's autonomous adoption of external heads. On target movement, incorporate the new target with a non-force merge strategy, rerun gates/independent verification, publish the resulting head and require new CI evidence. Conflicts retain local state and escalate; do not abort away human edits or endlessly follow a moving target.

Only verified current local evidence, current-head green required checks, an incorporated/current evaluated base, no pending consequential decision and owned publication permit marking ready. Re-read remote state after the transition. If observed movement invalidates acceptance, report non-success and return the PR to draft when authorized; do not assert atomic GitHub-wide acceptance. Success reports the observed accepted head/base snapshot, not a promise the branch can never move afterward.

## Risks / Trade-offs

- [Async recovery can replay side effects or reset budgets] → Persist pre-dispatch accounting/effect intent, reconcile actual state and exercise crash boundaries; never implement recovery by rerunning arbitrary callbacks.
- [Finalization precedes CI repair] → Explicit archive-aware independent verification and final-tree gates; active-target flows remain unchanged.
- [Existing PR helpers are in flight] → Integrate the prerequisite first and adapt shared mechanics through tested seams, without forcing PR lifecycle policy onto issue attempts.
- [GitHub state races are not transactional] → Normal pushes, repeated SHA-bound checks, explicit stale diagnostics and no force overwrite or permanent-green claim.
- [Trusted commands execute repository code] → Worktrees are not sandboxes; keep permissions/configuration explicit and do not infer commands from issues.
- [Workspaces consume disk] → Durable reporting and explicit owned cleanup; retain uncertain work rather than optimizing away recoverability.
- [A required CI workflow skips drafts] → Preflight/configuration must support draft CI; missing evidence escalates rather than marking ready to evade the gate. Repositories must configure suitable CI.

## Migration Plan

1. Integrate stabilized `pr-review-flows` work into the implementation branch; this proposal does not edit that change's artifacts or ongoing checkout.
2. Introduce neutral workspace/ownership/escalation seams with compatibility tests; preserve PR domains and default OpenSpec behavior.
3. Add runtime cwd, composition and hosted accounting hooks, then the issue attempt graph and publication/CI path.
4. Add archive-aware reverification, fault-injection and parallel-process coverage before authenticated use; document operator setup and continuation.
5. Rollback disables the new entrypoint. Retained workspaces, published commits/PRs and state records remain for explicit inspection; no automatic revert, deletion or issue closure.
