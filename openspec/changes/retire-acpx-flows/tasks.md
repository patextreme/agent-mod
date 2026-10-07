# Tasks

## 1. Establish the delivered replacement boundary

- [ ] 1.1 Confirm `migrate-factory-skills` is delivered and its six resources pass packaging checks, with finalization #47 and pipeline #48 recorded; verify this dependency from delivered files/results before deleting runtime code.
- [ ] 1.2 Inventory current consumers of flows/acpx and retained ACP, extension, prompt and skill resources; verify the inventory distinguishes current runtime references from archived/superseded planning and identifies every npm/TypeScript/Nix consumer.

## 2. Remove runtime surfaces and keep meaningful checks

- [ ] 2.1 Remove the entire `flows/` implementation/helpers/fixtures/flow-only tests and `skills/acpx-flow/`; verify neither resource remains and no retained extension, prompt or imported skill is deleted.
- [ ] 2.2 Update npm test commands, TypeScript includes and Nix flow-test derivation/check wiring together; verify no command references `find flows`, retained tests still run, and factory-skill packaging tests remain in both applicable gate paths.
- [ ] 2.3 Update README/AGENTS current layout and orchestration guidance alongside runtime removal; verify all five flow entrypoint links and the acpx-flow skill row are gone, pi-acp instructions remain and #47/#48 gaps are explicit.
- [ ] 2.4 Reconcile current glossary terminology with the retained skill domain without making it a spec or implementation log; verify useful completion/verification/sync/archive distinctions remain and obsolete runtime-only terms do not misdescribe current behavior.

## 3. Remove dependency and preserve ACP distribution

- [ ] 3.1 Remove acpx from package manifests and regenerate/inspect the lockfile without unrelated upgrades; verify acpx is absent as a dependency and retained packages keep valid integrity metadata where Nix requires it.
- [ ] 3.2 Refresh `npmDepsHash` from a fake-hash build and its actual returned hash; verify retained checks build with the updated lockfile rather than an inferred hash.
- [ ] 3.3 Verify `nix/packages/pi-acp`, flake import, adapter package/build tests, existing extension outputs and recursive skill packaging are retained; run their checks and inspect package discovery to confirm removal did not erase ACP integration or imported references.

## 4. Validate retirement and current documentation

- [ ] 4.1 Compare all REMOVED requirement headers against the five current main specs and verify `retire_capabilities: true`; run strict OpenSpec validation and confirm no requirement is missed and no main spec was manually deleted during implementation.
- [ ] 4.2 Search current source/config/docs for obsolete runtime commands and broken links, excluding intentional historical/planning references; verify no active acpx consumer or unsupported parity promise remains and unrelated docs/tests are preserved.
- [ ] 4.3 Document breaking behavior, source-policy differences and missing finalize/all automation; verify readers can use the separate stage skills and understand that ordinary external sync/archive skills are not independent finalization parity.

## 5. Integration acceptance

- [ ] 5.1 Run format → lint → typecheck → test → nix flake check and `openspec validate retire-acpx-flows --strict`; verify all retained gates/packages and migration packaging checks pass after removal.
- [ ] 5.2 Review the final diff against the removal/retention inventory; verify no user worktrees, branches, external run history, global tooling, archived evidence or unrelated Ptah/ACP resources were modified or removed.

## Workflow follow-up

- Land removal before closing GitHub #32, #36 and #42–44 as obsolete/not planned; link the landed removal receipt and do not claim their original requested features were implemented.
- Preserve #39's openspec-review work; reconcile only its obsolete flow scope separately.
- Request ordinary OpenSpec sync/archive separately after acceptance. Its retirement deltas, not hand deletion, remove empty main capabilities.
- Skill-based finalization [#47](https://github.com/patextreme/agent-mod/issues/47) and full pipeline [#48](https://github.com/patextreme/agent-mod/issues/48) remain follow-ups, not prerequisites for parity before this agreed removal.
