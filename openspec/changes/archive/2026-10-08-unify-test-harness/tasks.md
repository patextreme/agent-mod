# Tasks

## 1. Runner and gates layout

- [x] 1.1 Create `tests/run.mjs`: dependency-free Node script that scans `extensions/**/*.test.ts` and `tests/gates/**/*.test.mjs`, spawns `tsx --test --test-concurrency=2` on the discovered files, passes the environment through, and exits nonzero if any suite fails. Verify: `node tests/run.mjs` discovers and runs all five suites and passes.
- [x] 1.2 Move `scripts/docs-version.test.mjs` and `scripts/factory-skills.test.mjs` to `tests/gates/`, adjusting repo-root resolution for the new depth, and delete the emptied `scripts/` directory. Verify: both suites execute under the runner from their new paths, and `git grep -n "scripts/"` returns no live references.

## 2. Package manifest wiring

- [x] 2.1 Point `package.json` at the runner: `"test": "node tests/run.mjs"`, and add `"test:semantic": "node tests/semantic/openspec-review/materialize.mjs"`. Verify: `npm test` runs the discovered gate suite only (nothing under `tests/semantic/` executes) and passes; `npm run test:semantic` materializes a fresh fixture tree, prints case locations, and exits 0.

## 3. Nix collapse

- [x] 3.1 Replace the five per-test derivations (`permission-test`, `ollama-usage-test`, `codex-alias-test`, `docs-version-check`, `factory-skills-test`) with one `node-tests` check that provides `rootNodeModules` and runs `node tests/run.mjs` with `PI_FACTORY_SKILLS_OUTPUT=$(pi-skills)`. Verify: `nix build .#checks.x86_64-linux.node-tests -L` succeeds, including the factory-skills installed-output tier.
- [x] 3.2 Update the `checks` set to `node-tests` plus the unchanged `biome-check`, `tsc-check`, and package checks. Verify: `nix flake check` evaluates and `nix flake show` lists exactly the expected checks and packages, with no stale test derivation names.

## 4. Semantic suite evidence policy

- [x] 4.1 Remove `tests/semantic/openspec-review/results/` from HEAD and update the suite README: drop the results link, state that runs and their evidence live in the operator workspace and are never committed, and reference `docs/adr/0001-semantic-evidence-stays-local.md` as the decision of record. Verify: `git grep -n "results/2026-10-05"` returns nothing and the README states the policy.

## 5. Vocabulary and documentation

- [x] 5.1 Add the testing terms to `GLOSSARY.md` — quality gate, gate test, semantic suite, hermetic gate — with the definitions recorded in the architecture review. Verify: the four terms are present under a Testing section.
- [x] 5.2 Add `docs/adr/0001-semantic-evidence-stays-local.md` with the recorded decision text. Verify: the file exists and matches the decision (evidence local, suites never gates, no per-suite exceptions).
- [x] 5.3 Update `README.md` and `AGENTS.md` development-command sections: `npm test` runs the discovery-based runner, `test:semantic` is the manual semantic entry point, the Nix check set, and the two-rule test placement convention; remove references to the deleted `scripts/` tests. Verify: documented commands match the implemented package scripts and `git grep -n "scripts/docs-version\|scripts/factory-skills"` returns nothing.

## 6. System verification

- [x] 6.1 Run the JS gates in order — `npm run format`, `npm run lint`, `npm run typecheck`, `npm test` — and confirm all pass with the new layout. Verify: clean exit on each command.
- [x] 6.2 Run `nix flake check -L` end to end. Verify: all checks and packages build; `npmDepsHash` needs no refresh (no lockfile change expected).
- [x] 6.3 Run `openspec validate unify-test-harness --strict`. Verify: validation passes with the implemented state matching the delta spec.

## Workflow follow-up

- Archive via the issue-to-PR flow after verification acceptance (sync specs, archive the change, deliver the PR); not part of tracked implementation progress.
- After merge, discard the duplicate uncommitted `GLOSSARY.md` and `docs/adr/` edits in the main checkout before pulling, so the worktree's canonical copies are the only ones.
