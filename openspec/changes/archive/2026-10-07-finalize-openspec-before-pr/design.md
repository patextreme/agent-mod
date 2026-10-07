# Design

## Context

See proposal.md for [#49](https://github.com/patextreme/agent-mod/issues/49) and specs/openspec-pr-finalization/spec.md for behavior. Merged main supplies `orc-issue-to-pr` and PR review/repair with their references. Its baseline transitions from OpenSpec verification directly to Deliver and excludes sync/archive; #49's integrated implementation inserts finalization and archived-evidence alignment. `orc-openspec-verify` remains verification-only.

Implementation groups 1–4 were independently accepted on the user-approved frozen `0db5dd6` baseline. PR50 is now merged at integrated base `origin/main` `0fa734b63032c56c1cb2bf7e814ecdb70fef578e`; migration sync/archive is verified and its five skill capabilities are actual main specs. The deferred baseline gate is satisfied. Actual **Selected implementation path** and **Single-issue lifecycle limit** still carry the known conflict; Decision 7 reconciles it in #49 deltas, not by editing main or historical migration artifacts. The new worktree `/home/pat/Desktop/workspace/personal/agent-mod-issues-48-49-integrated`, branch `issues-48-49-integrated`, preserves the original checkout, verified orphan and frozen snapshots/manifest. Transplant attribution/scoped checks are in `/tmp/agent-mod-48-49-integration-evidence/report.md`; frozen verification is not integrated acceptance. Only tasks 5.1–5.3 are reopened for fresh acceptance and subsequent verification. Acpx retirement remains separate.

Current reconciliation inputs include actual issue-to-PR, PR-review, constituent-stage and distribution main specs, merged AGENTS/tracker guide, package/Nix wiring and integration evidence. Retain merged `skills/LICENSE` and archived migration history; the deliberately removed standalone provenance file is not restored. Recursive skill exports/tests suffice without package/lockfile/Nix edits. Main bounds test file concurrency to two; unchanged watchdog and bounded heavy-test pair pass scoped integration checks. The old orphan's timeout repair is not ported or required new-branch scope; full integrated gates remain pending. For frozen-baseline contract review, installed archive/sync (generatedBy 1.7.0 with current context/rules behavior) were read from actual available-skill locations; OpenSpec CLI is 1.14.1. This worktree's CLI planning root is local and no stores are registered. Root/path fields, not skill install locations or shell assumptions, select planning writes.

## Goals / Non-Goals

**Goals:** A narrow insertion in existing issue-to-PR, with accepted archive evidence carried through delivery and material PR repairs. Preserve clean requirements context for fresh reviews and history context only for judges/accounting.

**Non-Goals:** Replace issue-to-PR with #48, add #47/a finalization skill/assessor, change routing/provisioning or PR repair thresholds/budget, reopen archived changes, merge/cleanup, or install missing external procedures/tools.

## Decisions

### 1. Extend the OpenSpec route in place

Update `skills/orc-issue-to-pr/SKILL.md`, `references/pseudocode.md`, and a new local `references/openspec-finalization.md`. Make Finalize an explicit stage after Verify and before Deliver; update the Finish exclusion only for OpenSpec syncing/archiving. Ordinary verification and direct-edits flow remain unchanged.

Outer coordination stays Agent/codemode; delegate nested stages to general-purpose Agents with nested tooling, never an outer SubagentWorkflow. Resolve bundled sibling paths from installation and external apply/verify/archive/sync/code-review paths from actual available skills. Read dependencies before selected-route write dispatch and pass absolute skill paths separately from worktree/change/store/planning paths. Missing/incompatible tools, opt-in or workflow depth pauses the route.

Alternative: replace the OpenSpec route with #48. Rejected: #49 has delivery, post-archive review and recovery requirements of its own, and must remain independently implementable. No runtime dependency on either #48 or #47.

Previously recorded #48/#49 labels lack exact `openspec` (#48 none, #49 enhancement); unchanged labels would route both to direct edits. Re-fetch exact labels before operational execution. The explicit OpenSpec planning/local-development approval selects these changes independently of executing issue-to-PR; it does not authorize relabeling them or silently changing the source routing rule for later execution. Exact labels, stock issue/worktree identity, signing/access, tracker setup and delivery receipts remain prerequisites of the resulting operational skill, not gates on static local implementation/verification.

### 2. Keep evidence and roots sticky, including delivery feasibility

Retain the existing issue/worktree/branch/base/head contract and add resolved schema/planning root/store, authoritative artifact/delta inventory, relevant main specs, accepted verification report/check state and explicit sync/archive choice. Delegate state checks at boundaries. Fresh complete zero-Critical/zero-Warning verification with required checks and disclosed optional scope gates Finalize; summaries alone cannot establish it.

A store may resolve outside the implementation repository. Before writes, establish whether main specs and archive contents belong to the authorized PR repository/worktree. If not, pause for a scoped delivery decision; never expand edit authority, silently select a local root, stage across repositories or claim a single PR contains external-store files. Current local plans avoid this mismatch; retained store identity is not a guarantee of cross-repository delivery.

Alternative: infer finalization target from whatever active change is visible in the delegate. Rejected because newly provisioned worktrees and installed skills may resolve different roots.

### 3. Explicitly pass the invocation's choices into installed archive

Issue-to-PR invocation supplies the user's explicit **Sync now if needed, then archive after acceptance** choice, or **Archive now when already synced**. Pass that recorded authorization to a sequential archive Agent along with accepted verification evidence and target context. The archive skill still announces selection, loads optional archive inputs, inspects current completion and displays its combined delta analysis. Do not suppress prompts/checks or treat invocation as confirmation to override incomplete artifacts/tasks.

Pause and relay warnings, conflicts, ambiguous evidence and failures. Human decisions remain scoped; permission prompts are separate. No skip-needed-sync outcome may claim PR readiness.

Follow the built-in archive procedure as installed: status-only delta inventory; optional/advisory archive context/guidance (lookup failure is not an archive blocker); a required valid specs-instruction/rules snapshot before sync writes; inline sync reusing that snapshot; synchronous waiting if delegation is necessary; semantic preservation; post-sync comparison across all selected capabilities. Accept that built-in comparison without another independent assessor. No delta paths means no specs-instruction lookup, no main-spec writes and a No delta specs result. Already-synced paths retain assessment plus Archive now without needless replay.

Alternative: direct CLI move or an acpx flow-owned finalizer. Rejected because it bypasses controlling built-in choices/comparison or introduces the excluded assessor.

### 4. Actual archival, not delegate prose, authorizes delivery

Before the move capture the selected directory's complete inventory/content identity, including `.openspec.yaml`, and authoritative delta/main-spec mapping. The built-in determines date-prefixed destination and checks collisions. After its whole-directory move, delegate filesystem evidence of source absence and matching complete destination. This is move verification, not an independent sync assessment.

Keep attempted sync, built-in comparison acceptance, no-delta/already-synced assessment and archive state separate in the stage report. A failed or moved-but-unconfirmed archive blocks Deliver; preserve main-spec edits and both reported paths. No overwrite, alternate name, reopen or automatic rollback.

Delivery receives implementation ownership plus authorized main-spec updates, archive additions and active-path deletions, including generated archive metadata. Independently inspect actual staged diff and entire outgoing range, using initial ownership/baseline evidence to exclude unrelated user work. Preserve existing `git commit -S -s`, signature/DCO verification, normal push, issue branch/PR base/body, origin/develop reconciliation and current-head gate requirements. Return explicit code/spec/archive inclusion receipts alongside ordinary commit/push/PR receipts.

### 5. Make archived evidence first-class PR inputs

Update `skills/orc-pr-review-repair/SKILL.md`, pseudocode and `references/report-contracts.md` with an **optional OpenSpec archived-source context**. Ordinary/non-OpenSpec PR review behavior remains unchanged. Issue-to-PR passes exact confirmed archive path/inventory, main-spec paths, originating issue and approved intent; the PR preparer verifies these against the current branch and outgoing diff.

Fresh `code-review` and both nested axes receive clean archived proposal/specs/design/tasks and relevant main specs as explicit sources, without previous findings or repair summaries. They read the archive directly rather than issue active-change status/apply commands. Judges still receive complete prior ledgers/history. Require external code-review's tracker prerequisite. The merged `docs/agents/issue-tracker.md` supplies GitHub pagination and non-issue/archived OpenSpec sources. It targets `main` but explicitly does not override incompatible skills: source `develop`/`origin/develop` conventions remain unchanged. Operational delivery is blocked pending separately authorized policy reconciliation; static local contract acceptance does not require or authorize that change.

Archival means complete and packaged for review, not merged or immutable intent-free history. For material, in-scope repairs:

| Repair | Evidence / operations |
| --- | --- |
| Code-only correction to approved intent | Read archived/main requirements, establish alignment, run affected regression/required checks and fresh full-diff review. Leave archive location/content unchanged unless evidence-backed bookkeeping is required. No reopen/rearchive/full lifecycle. |
| Behavior-affecting correction within approved intent | Compare code, archive specs/design/tasks and main specs together. Update affected archived documents/main specs when actual approved behavior or evidence changes; avoid rewriting requirements to justify an unrelated implementation. Validate affected spec form/coherence and targeted implementation behavior before fresh review/final-head gates. |
| New requirement or consequential design/risk/public-contract change | Return finding, attempted investigation, proposed intent, affected documents, options/consequences; pause for scoped user authorization. Do not initiate a new change or expand this PR automatically. |

Affected documents may be unchanged when they already express the approved correction; record why. Archived delta-to-main comparison and archived-document validation use resolved files directly or a disposable validation fixture when CLI active-change commands cannot target an archive. Do not move/reopen the archive merely to make a CLI command work. Preserve unaffected requirements/scenarios and mandatory test expectations.

Keep existing material repair thresholds, separate reviewers/judge/repair agents, verified repair-start reservations and cumulative ten-attempt history. Extend existing summary/escalation evidence fields for archive/main-spec alignment and affected validation rather than introduce a parallel history protocol. Any fixing commit invalidates earlier head-bound gates.

### 6. Reconcile actual state on explicit resume

| State | Required action |
| --- | --- |
| Active source; partial sync | Inspect all authoritative deltas/current main specs and current verification evidence; finish missing authorized effects idempotently, then run built-in comparison before moving. |
| Sync accepted; move failed | Re-establish current sync and verification state; retry only the remaining safe archive operation. |
| Source absent; complete matching archive | Confirm identity, inventory and accepted current comparison/verification evidence; retain archive path and advance to remaining delivery. Do not invoke active-change stages again. |
| Both copies, neither copy, incomplete destination or uncertain receipts | Preserve state; pause with exact paths/evidence and reconciliation options. Never treat matching name alone as prior success. |
| Local commit/push/PR partly completed | Verify signed contents and exact local/remote/PR identity, complete only missing delivery operations. No duplicate commits/PRs or force push. |
| PR repair interrupted | Recover the same run ID, ledger and reserved attempt; reconcile current code/archive/main-spec changes and finish that attempt's remaining checks/delivery before another review. |

Relevant external issue, code, artifact, base/head or spec drift invalidates affected acceptance. Authorized sync edits and archive relocation are expected transitions recorded in receipts, not grounds to replay the entire lifecycle. If predecessor evidence is unavailable after archival, surface that gap rather than infer verification or reopen the change. Prompt reports do not supply durable native checkpoints or transactional filesystem guarantees.

### 7. Reconcile actual merged main without changing approved intent

PR50 merge and verified migration sync/archive satisfy the deferred baseline-existence gate. Per CLI specs instructions and explicit user creation authorization, add `specs/issue-to-pr-orchestration/spec.md` with full MODIFIED blocks copied from actual main, using exact requirement headers:

- **Selected implementation path**: keep direct research/planning/implementation/check/independent acceptance text and both missing-change/readiness scenarios verbatim; insert finalize after verify before delivery and add its acceptance scenario.
- **Single-issue lifecycle limit**: retain completion/final-head/report fields and merge/cleanup/queue limits. Preserve the exact **Successful delivery stops before merge and archive** scenario header and original THEN, qualifying its WHEN to direct execution; add an OpenSpec completion scenario requiring finalization evidence. This replaces the obsolete universal scope coherently while satisfying strict scenario-preservation validation. Only the OpenSpec route loses the separate-sync/archive exclusion.

All other issue-to-PR requirements stay untouched, including exact-label routing, `issue-<n>` identity, `develop` base, signing/DCO, normal push and nested history/final-head gates. Proposal Capabilities names this modification; `openspec-pr-finalization` continues to own detailed built-in choices, receipts, archived alignment and recovery rather than duplicate general policies.

Full actual `pr-review-repair-orchestration` inspection finds no conflict: preparation accepts requirements sources without requiring active paths; fresh axes remain history-free, and judges/accounting/publication retain their existing contracts. Optional archived-source inputs and in-scope alignment are additive. No PR-repair MODIFIED block is necessary. Constituent stage main specs remain stage-only and retain separate-finalization boundaries; #49 authorizes the additional outer stage, not a change to them.

Strict structural validation and preservation inspection accompany this planning reconciliation, but are not whole-change acceptance. Fresh grooming/readiness and tasks 5.1–5.3 must establish integrated contract/gate/diff evidence, then implementation verification, before separately authorized finalization or delivery. No main-spec or migration-archive writes, bookkeeping completion, commit or publication is authorized here.

Alternative: edit historical migration specs or add unnecessary PR-repair replacements. Rejected because actual main already supplies the baseline and additive archived-source behavior leaves approved PR-repair policy intact.

### 8. Separate task ownership and assurance scope

| File area | Owner / scheduling |
| --- | --- |
| `skills/orc-issue-to-pr/**` | #49 route/finalization group, then serialized evidence/recovery handoff. |
| `skills/orc-pr-review-repair/**` | #49 archived-evidence group; exclusive to that group. |
| `skills/orc-openspec-all/**` | #48 only; no #49 dependency on these files. |
| `README.md` | #48 lifecycle additions first, #49 route/finalization/repair updates second; whole-file ownership serialized. |
| `scripts/factory-skills.test.mjs` | #48 discovery/lifecycle additions first, #49 archive/delivery/repair cases second; one writer at a time. |
| Policy-extension disclosure / license history | #49 README disclosure identifies intentional behavior changes; preserve `skills/LICENSE` and archived migration source history. Do not restore removed standalone provenance. |
| package/Nix wiring | Normally unchanged; existing recursive resources and test entrypoint suffice. Any needed integration edit gets one owner and affected gates. |
| Planning artifacts/bookkeeping | Each change owns its own artifacts; groups 1–4 retain historical acceptance; actual-main planning reconciliation and fresh tasks 5.1–5.3 use serialized integrated evidence. |

Historical implementation used #48-first shared-file handoff; current integrated checks/bookkeeping remain serialized, with separate acceptance for each change. Migration merge is satisfied and Decision 7 reconciles actual-main conflicts. Fresh acceptance/verification remains required; acpx retirement and #48 runtime behavior are not dependencies.

Extend existing isolated distribution/discovery tests to include the new local reference. Add model-free contract/trace fixtures for success, no-delta/already-synced, missing built-ins/tools, incomplete tasks, rejected sync, collision/unconfirmed move, active/archived resume, partial delivery and code-only/behavior-affecting/new-intent repairs. Preserve direct-route and signing/history/final-head negative cases. Human read-only contract review against actual built-ins and both references complements fixture consistency. This proves static distribution and documented transition coverage, not model obedience or live GitHub/signing safety. No required validation task performs target-project sync/archive/delivery; any live disposable exercise needs separate authorization.

## Risks / Trade-offs

- [Archive accepted as merge or exemption from requirements] → Explicit packaged-for-review wording, archived-source review inputs and alignment checks on material repairs.
- [Separate store cannot fit in one PR] → Pre-dispatch root/delivery feasibility check and user reconciliation; no implicit cross-repository staging.
- [Sync/archive is nontransactional] → Whole inventory evidence, built-in comparison and conservative resume paths; no unconfirmed-success shortcut.
- [Imported provenance claims become false after policy edits] → Record #49 as an intentional subsequent behavioral extension; retain original import license/history.
- [Static trace tests can masquerade as runtime guarantees] → Name their scope, add human semantic comparison, and keep optional live runs separately authorized.
- [Frozen acceptance or transplant checks mistaken for integrated completion] → Preserve both baseline and actual-main attribution, reopen final acceptance only, and serialize fresh checks/owners.

## Migration Plan

1. Preserve accepted frozen-baseline groups 1–4, original checkout/orphan/manifests and historical verification. The migration merge/sync/archive prerequisite is now satisfied.
2. Reconcile proposal/design/deltas/tasks against actual main via Decision 7 without implementation, main-spec or migration-archive edits; retain merged license/distribution/test-concurrency conventions.
3. Freshly groom/assess readiness, then independently accept tasks 5.1–5.3: full contract inspection, format → lint → typecheck → test, strict validation and actual-main diff/ownership evidence. Required Nix checks follow package/Nix changes; do not mutate dependency links. Scoped transplant checks are not full acceptance.
4. Obtain fresh implementation verification before separately authorized finalization/publication. #48/#49 acceptance stays separate; this reconciliation authorizes no sync/archive, staging, commits, pushes or PR operations.

Rollback disables the OpenSpec finalization insertion and archived-source additions while retaining historical PR evidence. It does not move archived changes back, revert synchronized specs or undo published commits without a separate scoped user decision.

### Readiness and prerequisite limitations

Structural validity is separate from fresh grooming/readiness, integrated acceptance and implementation verification. Parent Agent/codemode/SubagentWorkflow availability does not prove nested visibility, host opt-in or permitted depth; check those before operational dispatch, not before static development. Resolve/read actual external built-ins anew before execution; ignored `.pi/skills` was not copied into package output. Merged tracker setup now exists; its `main` policy does not override source `develop` conventions. That preexisting operational incompatibility needs separate authorization and is not new scope or a local acceptance blocker. Previously recorded labels (#48 none, #49 enhancement) would select direct edits unless current exact labels differ; re-fetch for execution. This combined development worktree/branch is not `issue-<n>` identity and grants no exception. Live signing/access, route/root/identity and delivery receipts remain operational requirements. Biome comes from Nix/cached tooling. This worker performs planning only, not implementation or delivery.
