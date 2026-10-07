# Design

## Context

See proposal.md for [#48](https://github.com/patextreme/agent-mod/issues/48) and specs/openspec-lifecycle-orchestration/spec.md for the contract. Implementation groups 1–4 were independently accepted on the user-approved frozen `0db5dd6` baseline; original verification applies to that baseline, not the integrated result. PR50 is now merged at `origin/main` `0fa734b63032c56c1cb2bf7e814ecdb70fef578e`, with migration sync/archive verified and the five skill capabilities present in main specs. This satisfies the deferred baseline gate. The new worktree `/home/pat/Desktop/workspace/personal/agent-mod-issues-48-49-integrated` on `issues-48-49-integrated` contains the authorized implementation transplant. Preserve the original checkout, verified orphan, frozen manifest and snapshots. Integration attribution/checks are in `/tmp/agent-mod-48-49-integration-evidence/report.md`; final tasks 5.1–5.3 are reopened for fresh acceptance and subsequent verification, not declared complete by transplant evidence.

Relevant current inputs include the constituent skills/references, actual `openspec-skill-orchestration`, `issue-to-pr-orchestration`, `pr-review-repair-orchestration` and distribution main specs, merged AGENTS/tracker guide, package manifest and Nix recursive copy. `openspec-lifecycle-orchestration` has no main spec yet. The merged README/notice tests replace dangling standalone provenance references with `skills/LICENSE` and archived migration history; the deliberately deleted provenance file is not restored. Recursive package discovery/copy already covers the lifecycle resources, and no package/lockfile/Nix edits are needed. Main bounds npm/Nix test file concurrency to two; its unchanged watchdog and bounded heavy-test pair pass scoped integration checks. The old orphan's timeout repair was not ported and is not required scope; full integrated gates remain outstanding. Current `openspec-all`/`openspec-finalize` main specs are acpx contracts with bounded budgets and an independent assessor; they are deliberately not reused. Their retirement remains separate.

For frozen-baseline contract review, installed archive/sync procedures were read from the invoking environment's supplied skill paths, not discovered in the new worktree. This installation uses generatedBy 1.7.0 skills with the current rules/context enhancements and OpenSpec CLI 1.14.1. Their behavior, not those versions alone, controls compatibility. CLI context/status resolves this planning session to the isolated worktree, with no registered stores; no shared store or original planning root is authorized for these artifact writes.

## Goals / Non-Goals

**Goals:** A shallow composition layer with explicit evidence acceptance, delegated constituent ownership and finalization via the existing built-in archive procedure. Scoped pauses and explicit reconciliation are user-visible outcomes, not exceptional successes.

**Non-Goals:** A runtime extension, deterministic enforcement, native resume checkpoint, generic finalizer, stock-Pi fallback or target-project publication. This change supplies instructions, not missing tools or permission approvals.

## Decisions

### 1. Add a lifecycle skill, not a replacement for the stages

Use `skills/orc-openspec-all/SKILL.md` with local `references/pseudocode.md` and `references/evidence-and-recovery.md`. Resolve siblings relative to the installed package and external procedures from invoking available-skill information. Read all resolved procedures before dispatch and pass their absolute paths separately from the selected repository/worktree and CLI-resolved planning paths. Ordinary apply/verify/archive/sync files remain external and unchanged.

Outer coordination uses Agent/codemode; each `orc-*` stage runs in a general-purpose Agent with its required nested tools. Do not wrap the lifecycle in an outer SubagentWorkflow: implementation already needs that tool for task-group scheduling. Check host opt-in, nested visibility and workflow depth before execution; pause if unsupported. Retain constituent histories on continuations.

Alternative: compose the acpx graph or flatten workers in one workflow. Rejected because it changes stage policies and depth behavior and falsely implies deterministic/runtime parity.

### 2. Pin an evidence contract rather than infer completion

Preparation resolves a sticky tuple: repository, worktree/canonical paths, expected branch/refs when applicable, change ID/schema, planning root, optional store and selected-root flags, artifact inventory, installed skill paths, authorization and initial owned-change inventory. Use status's concrete `artifactPaths` and apply context; never confuse the installed skill's location with the implementation/planning target. Guards delegate inspection of actual state before accepting transitions.

The control-flow reference specifies:

| Boundary | Required evidence |
| --- | --- |
| groom → readiness | Fresh complete semantic report, zero Critical, full counts/remaining decisions; no arbitrary round cap. |
| readiness → implement | Separate structural validation and explicit assessment of every remaining material blocker; unresolved consequential choices pause. Nonblocking Major/Minor findings remain visible. |
| implement → verify | All assigned tasks independently diff/check validated, serialized bookkeeping, integrated required checks and fresh apply status. |
| verify → finalize | Fresh complete zero-Critical/zero-Warning verification, current required checks, skipped optional scope and Suggestions disclosed. |
| finalize → complete | Built-in sync assessment/comparison or no-delta result plus confirmed whole archive move and contents. |

Retain full reports, check commands/results, accepted file/ref snapshots and readiness dispositions in returned run evidence. This is not a prescribed persisted JSON schema or automatic checkpoint store. Relevant intervening edits invalidate affected evidence; expected sync edits and archive relocation are recorded transitions, not reasons to blindly rerun implementation. Unauthorized code/intent drift does require renewed affected acceptance.

Alternative: treat zero Critical as readiness or completed tasks as verification. Rejected by the actual stage contracts. No acpx ten-repair caps, terminal deadlines or classifier protocol are imported.

### 3. Pass invocation authorization through the built-in archive choices

Before finalization, tell the delegate that this lifecycle invocation explicitly chose **Sync now when needed, then archive only after acceptance**, or **Archive now when already synced**. The built-in still announces the selected target, reads optional archive context/guidance, checks current artifacts/tasks and displays its combined delta analysis. This records the user's choice instead of deleting prompts from the procedure or synthesizing unrelated human answers.

Invocation is not confirmation to proceed through incomplete-artifact/task warnings. Return those warnings, conflicts, ambiguous choices and failures to the outer user and pause. After reconciliation, refresh predecessor evidence as affected. Never select Archive without syncing while claiming completed lifecycle. Tool permissions stay separate.

Delegate to the installed archive skill in one sequential agent. It obtains required valid specs instructions once before sync writes, then runs its sync skill inline using that snapshot (or synchronously delegates and waits if the host requires it). Keep archive advisory lookup optional as specified by the built-in. Status-resolved delta paths are the only sync inventory. Reuse semantic merge behavior, rules-as-content constraints, store roots and preservation of unaffected scenarios.

The archive delegate performs the built-in post-sync comparison across **all** selected capabilities; accept that comparison, not a fresh independent assessor. With no delta paths, retain the built-in no-sync/no-rules-lookup path. With already-synced deltas, retain its assessment and Archive now choice. These checks are not a second implementation verification stage.

Alternative: use #47, a new shared finalization skill, or the retired assessor. All are outside the explicit issue scope.

### 4. Confirm archival and preserve partial work

Capture the selected change's complete pre-move file inventory/content identity, including metadata. After the built-in date-derived whole-directory move, delegate filesystem confirmation: source absent; destination complete and matching the target/inventory. This is move confirmation, not a synchronization assessor. No existing destination is overwritten/merged or assigned an automatic alternate name.

Report each stage as accepted, blocked, failed, interrupted, partial or unstarted, preserving actual child outcomes rather than translating them into acpx CLI enums. Distinguish attempted sync, accepted built-in comparison, no-delta and archive moved-but-unconfirmed. Preserve safe edits and receipts; do not commit, stash, reset or rollback. No later stage starts after missing evidence or a human-input branch.

### 5. Resume is explicit reconciliation, not replay

| Observed state | Recovery |
| --- | --- |
| Active change; stage failed/paused | Reconcile current target/owned changes and accepted reports; re-establish stale affected evidence, then resume only remaining authorized stage work. |
| Partial main-spec sync | Inspect every selected delta against current main specs under the built-in contract; reuse applied effects idempotently, finish missing authorized effects, then require the built-in comparison. |
| Sync accepted; move failed | Verify current implementation acceptance and current sync assessment before retrying only an available safe destination. |
| Source absent; complete matching archive | Require matching current predecessor/sync evidence and contents; report finalization already observed without another move or active-change invocation. |
| Both paths, neither path, partial archive, missing receipts or conflicting identity | Preserve state and pause with specific reconciliation options; no inferred success, duplicate move or automatic reopen. |

A fresh invocation without usable prior evidence establishes stage acceptance from current active files. A selected already-archived target cannot be treated as a new active lifecycle; it is either a reconciled completion with evidence or a surfaced limitation. Interruption may prevent reporting; files and actual state, not absence of output, control recovery.

### 6. Coordinate with #49 without a runtime dependency

The two orchestrators separately delegate the same external built-ins. Keep orchestration/evidence references local to each skill rather than requiring `orc-issue-to-pr` to call `orc-openspec-all` or introducing a finalizer. Shared wording is short authorization/evidence glue; the external built-ins remain the operation source of truth. Review parity of those glue contracts across both issues.

| File area | Owner / scheduling |
| --- | --- |
| `skills/orc-openspec-all/**` | #48 exclusive. |
| `skills/orc-issue-to-pr/**`, `skills/orc-pr-review-repair/**`, intentional policy-extension disclosure | #49 exclusive. |
| `README.md` | #48 adds lifecycle row/usage/prerequisites/limitations first; #49 then changes issue-route/finalization/repair sections. Serialize whole-file edits. |
| `scripts/factory-skills.test.mjs` | #48 extends discovery/inventory and lifecycle fixtures first; #49 appends delivery/archive/repair contract cases after handoff. One file owner at a time. |
| package/Nix wiring | No expected edits: current test entrypoint and recursive copy suffice. Any necessary expansion is one serialized integration owner and requires affected gates. |
| Each change's planning artifacts/task checkboxes | Its own change only; bookkeeping serialized within that change. |

The historical handoff used #48-first shared docs/tests ownership. Integrated inspection/check evidence and bookkeeping remain serialized, with separate acceptance per change. The migration merge gate is now satisfied; #49 reconciles its actual-main requirement conflicts in its own planning deltas. Both changes still require fresh integrated acceptance/verification. Acpx retirement remains independent; neither issue has a runtime dependency on the other.

### 7. Choose bounded validation rather than live delivery

Extend existing model-free factory tests for new metadata, bundled reference inclusion, npm dry-run, isolated Pi discovery with defaults excluded, and absence of absolute source/home dependencies. Add declarative scenario/trace fixtures for stage ordering, stale/missing evidence, Major readiness pause, human-input propagation, missing nested tools/dependencies, no-delta/already-synced paths, rejected sync, archive failure and resume collision/success. Fixtures check documented expected transitions; they are not a new executable orchestrator.

Pair automated distribution/fixture consistency with a read-only contract review of SKILL.md and references against actual installed constituents and archive/sync. Do not claim keyword tests prove semantic acceptance or model obedience. A live-model smoke run is optional only with separate authorization in disposable fixtures; no target-project sync/archive/publication is required for these validation tasks.

## Risks / Trade-offs

- [Prompt-level guards are not OS/runtime enforcement] → State that isolated workspaces/tool permissions remain operator responsibilities; report assurance as static/contract coverage.
- [Externally generated skills can change or be shadowed] → Resolve/read actual installed files and recheck compatibility before dispatch; block incompatible behavior rather than rely on name/version alone.
- [Sync/move is not a multi-file transaction] → Exclusive target operation, explicit before/after evidence, built-in comparisons and conservative partial-state pauses.
- [Frozen acceptance mistaken for integrated acceptance] → Preserve external manifests and actual-main attribution; reopen only final acceptance tasks and require fresh post-reconciliation gates.
- [README/test overlap with retirement and #49] → Single-file ownership and integration handoffs; keep retirement out of these tasks.

## Migration Plan

1. Retain checked groups 1–4 and frozen-baseline verification as historical implementation evidence. The original checkout/orphan/manifests remain untouched.
2. Use the already transplanted #48 resources and merged distribution conventions; reconcile planning against actual main without implementation, main-spec or migration-archive edits.
3. Freshly groom/assess readiness, then independently accept tasks 5.1–5.3 on the reconciled integrated content: contract inspection, format → lint → typecheck → test, strict validation and actual-main diff/ownership evidence. Run required Nix checks if package/Nix wiring changes; preserve dependency links. Scoped integration results do not replace these gates.
4. Obtain fresh implementation verification before any separately authorized finalization/delivery. Migration merge is no longer deferred; #49's acceptance remains separate. No commits, publication, spec sync or archival is authorized by this planning reconciliation.

Rollback removes/disables the lifecycle skill and its test/docs additions. It does not undo effects of prior user invocations; those require state reconciliation, never an automatic spec rollback or archive move back.

### Readiness and prerequisite limitations

Artifact completion is not integrated acceptance or runtime readiness. The parent supplies Agent/codemode/SubagentWorkflow; actual execution must still confirm nested visibility, host authorization and workflow depth. This is an operational prerequisite, not a static-development blocker or a claim that the current planning session lacks orchestration support. Resolve/read external procedures from the invoking environment anew before dispatch; ignored `.pi/skills` was not copied into packaged output. Biome is supplied through Nix/cached worktree tooling, not node_modules. The tracker guide now targets `main` while existing delivery skills/specs retain `develop`; that preexisting incompatibility blocks operational issue-to-PR delivery pending separate authorization, not this lifecycle's local static acceptance. No delivery-policy change, workflow dispatch or finalization is performed here.
