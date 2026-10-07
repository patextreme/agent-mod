# Proposal

## Why

[#48](https://github.com/patextreme/agent-mod/issues/48) needs one skill invocation for groom → implement → verify → finalize without importing the retiring acpx pipeline's contracts. The merged migration supplies the stage skills, but its baseline has no skill owning their composition or built-in finalization.

## What Changes

- Add `orc-openspec-all`, its bundled control-flow/evidence references, installed-package discovery coverage, and usage/prerequisite documentation.
- Retain one repository/worktree/change/planning-root/store identity and gate each stage on current accepted predecessor evidence; separately assess structural validity and readiness after Critical-free grooming.
- Preserve constituent edit scopes, acceptance, repair accounting, human-input branches and nested-tool/depth requirements. Implementation completion, verification acceptance, sync acceptance and archival remain distinct.
- Delegate finalization to externally installed `openspec-archive-change`, using its inline `openspec-sync-specs` procedure and built-in post-sync comparison; add neither a finalization skill nor an independent sync assessor.
- Treat lifecycle invocation as the explicit sync/archive choice after verification; pause on incomplete artifacts/tasks, conflicts or failed operations. Retain the no-delta path and confirm the whole-directory move before success.
- Report blocked/partial outcomes and unstarted stages; reconcile real sync/archive state and current evidence on explicit resume without replaying completed operations.

## Capabilities

### New Capabilities

- `openspec-lifecycle-orchestration`: Skill-based ordered composition, readiness/evidence boundaries, built-in finalization authorization and explicit state reconciliation.

### Modified Capabilities

None. `openspec-all` and `openspec-finalize` describe acpx flows, not these skills; `retire-acpx-flows` owns their removal. The merged `openspec-skill-orchestration` remains the constituent contract, not a new name for this composition capability. No lifecycle main capability exists yet.

## Impact

- Adds `skills/orc-openspec-all/`; extends `scripts/factory-skills.test.mjs` and README sections. Existing `pi.skills` and recursive `pi-skills` export cover the new directory/resources without a new extension or runtime dependency.
- PR50 is merged at integrated base `origin/main` `0fa734b`; migration sync/archive is verified, satisfying the deferred baseline gate. Implementation groups 1–4 retain their frozen-baseline acceptance; integrated tasks 5.1–5.3 require fresh contract inspection, full gates and actual-main diff attribution before acceptance and subsequent verification. `/tmp/agent-mod-48-49-integration-evidence/report.md` records scoped transplant checks, not whole-change acceptance. No migration operations are authorized here.
- Executing the resulting lifecycle requires operator-supplied Agent/nested delegation, codemode, SubagentWorkflow, OpenSpec CLI, apply/verify/archive/sync skills and permissions. Parent tool availability does not prove nested-worker visibility/depth. Resolving installed procedures is separate from finding a planning root.
- Coordinate with [#49](https://github.com/patextreme/agent-mod/issues/49) on the built-in finalization contract and serialized shared test/docs ownership; neither issue requires the other's orchestrator. No dependency on #47.
- Chosen assurance scope: isolated distribution/discovery tests, model-free contract/trace fixtures, and explicit human contract review against resolved built-ins. No claim of live model obedience, stock-Pi support or acpx resume/CLI-result parity.
- No queue selection, PR delivery, merge, cleanup, external-skill installer, generated-skill edits, independent assessor, acpx runtime integration or automatic Git management. Static development does not invoke the resulting lifecycle on these changes or deliver, sync or archive any target. Frozen baseline, original checkout and verified orphan remain preserved. Merged notice/package/test conventions are retained without resurrecting standalone provenance or adding acpx constraints.
