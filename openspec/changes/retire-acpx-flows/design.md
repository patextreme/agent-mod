# Design

## Context

See `proposal.md` for the breaking surface and the five REMOVED capability deltas for retirement. The baseline has five entrypoint directories plus `flows/shared`, acpx in devDependencies, recursive flow-test discovery in npm and Nix, and a TypeScript include for flows. `pi-acp` is a separate flake package and is intentionally retained. This change depends on the delivered `migrate-factory-skills` toolkit, not the unimplemented acpx proposals.

## Goals / Non-Goals

**Goals:** One maintained skill-based orchestration surface; exhaustive package/build/doc cleanup; explicit spec retirement and lifecycle gaps; retained extension and ACP packaging checks.

**Non-Goals:** Implement missing finalization/pipeline skills, make a skill emulate an acpx CLI contract, remove globally installed tools, alter target repositories or delete external run histories/workspaces.

## Decisions

### 1. Remove the complete flow implementation only after skill delivery

Delete `flows/` including shared infrastructure and fixtures, plus `skills/acpx-flow/`. No helpers there are required by the migrated instruction-only toolkit. Remove the acpx dependency rather than retain a vestigial authoring/runtime surface. Keep Pi SDK/TypeScript/tsx dependencies used by retained code and tests. Do not delete `nix/packages/pi-acp`, its flake module import, package/check outputs, patches or dedicated documentation.

Alternative: retain parallel implementations or only disable entrypoints. Rejected because it retains maintenance burden and conflicting lifecycle policies. Separating migration and removal keeps this breaking action reviewable.

### 2. Update every current consumer, preserve historical evidence

Remove recursive `find flows` test arguments from `package.json`, the flow include from `tsconfig.json`, and the `groom-test` derivation/check from `nix/modules/pi-package.nix`. Preserve extension/docs tests, any new factory-skill packaging tests, biome/tsc checks and retained package builds. Keep the recursive `pi-skills` derivation so imported skill references still ship. Search current source/docs/config for flow/acpx references to avoid broken links and empty test commands.

Replace README flow sections and acpx skill row with the actual toolkit boundary; update AGENTS layout/conventions and current flow-specific glossary language without losing useful domain distinctions. Historical `openspec/changes/archive` and `openspec/superseded` records intentionally retain old paths/policies; do not make historical artifacts describe the new implementation. Current retirement artifacts can also mention removed surfaces. Historical references are not residual runtime dependencies.

Alternative: delete all textual mentions of acpx or ACP. That would erase provenance and inadvertently remove the separately retained ACP integration.

### 3. Retire capabilities through authorized OpenSpec deltas

Each of `openspec-groom`, `openspec-implement`, `openspec-verify`, `openspec-finalize` and `openspec-all` has a REMOVED block for every current requirement, with reason and migration guidance. `.openspec.yaml` declares `retire_capabilities: true` so ordinary spec synchronization/archival can retire their empty main specs. Implementation must not manually delete `openspec/specs/<capability>/spec.md` as a shortcut or invent replacement obligations in those legacy capabilities.

The imported stages are distinct new skill capabilities with source behavior, not MODIFIED versions preserving the old runtime contract. Finalization/all have no equivalent new capability until #47/#48 are implemented. No special acpx finalizer is required to retire this change: an explicitly requested ordinary external OpenSpec sync/archive procedure can be used, with its own prerequisites and scope. Do not execute spec sync/archive as part of this planning work.

Alternative: silently remove code while leaving old requirements authoritative, or directly delete specs by hand. Both conceal the breaking behavior and violate capability-retirement convention.

### 4. Refresh dependency and Nix state as one removal boundary

After removing acpx, regenerate the lockfile, inspect it for missing integrity entries and retain versions still required by the remaining package. Refresh `npmDepsHash` using a fake-hash build and the returned actual hash rather than guessing. Run JS gates in order and `nix flake check`, including `pi-acp` builds/tests and skill packaging. Dependency removal does not authorize unrelated upgrades or automatic cleanup of Ptah metadata/resources.

### 5. Publish an honest migration and issue disposition

Document the lack of deterministic acpx guards, explicit CLI result/exit contracts, per-stage flow budgets and persisted runtime traces. Source skills keep their own thresholds and progress behavior; ordinary user conversations/tool traces are not advertised as equivalent persisted flow state. The deliberate finalize/all gap is accepted, with #47 and #48 linked before removal; external sync/archive skills are separate operations, not parity.

Keep #32, #36 and #42–44 open until actual flow removal lands, then close as not planned/obsolete with the removal receipt. #34 is separately superseded by the migration plan and can close before removal. Do not close #39 wholesale: `openspec-review` remains, its flow-only scope can be reconciled with a focused note/edit without claiming the retained skill work is completed.

## Risks / Trade-offs

- [Removal leaves missing lifecycle automation] → Explicit #47/#48 tracking and current README limitation; removal does not wait for parity because the user accepted the gap.
- [Broad cleanup could remove retained ACP or unrelated tests] → Enumerate retained package/check/test outputs and verify them through Nix and JS gates.
- [Stale lockfile/hash breaks reproducible builds] → Recompute npm dependency hash and run all Nix checks after manifest changes.
- [Historical references appear to contradict current docs] → Preserve them as marked superseded/archived records, excluding them from current runtime-reference checks.
- [Issue closure suggests code was removed during planning] → Close removal-specific issues only after landed implementation, with receipts.

## Migration Plan

1. Confirm migration is delivered and follow-ups #47/#48 exist.
2. Remove flows/acpx authoring/dependency and update package/test/typecheck/Nix consumers, retaining ACP and unrelated resources.
3. Refresh lockfile/hash, current docs and useful glossary language; make lifecycle and assurance gaps explicit.
4. Run format → lint → typecheck → test → nix flake check and strict OpenSpec validation; inspect retained package discovery and retirement coverage.
5. Land the removal, then close obsolete flow-only issues. Sync/archive this change only through a separately authorized OpenSpec operation; main capability removal follows its deltas.

Rollback restores the flow/dependency/wiring/docs revision and matching lockfile/hash through an explicit follow-up, not automatic filesystem manipulation. Restoring already-retired main specs would need a corresponding spec change. No user branches, worktrees, external acpx records or global tools are removed by this package retirement.
