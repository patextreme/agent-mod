# Proposal

## Why

The set of tests is enumerated by hand on every execution surface: the `package.json` test script lists five file paths, `nix/modules/pi-package.nix` re-enumerates the same tests as one near-identical derivation each, and the ownerless contract tests sit in a misnamed `scripts/` directory while the live-model semantic suite is referenced by no command at all. Adding a test means registering it in several places, and the lists are free to drift; these two files are the hottest non-lockfile files in recent history, which is the churn signature of that duplication.

## What Changes

- Add a dependency-free test runner at `tests/run.mjs` that discovers gate tests by convention — `extensions/**/*.test.ts` plus `tests/gates/**/*.test.mjs` — and spawns `tsx --test` on what it finds. `npm test` invokes the runner; the hermetic Nix check invokes the same runner.
- Move the ownerless contract tests (`scripts/docs-version.test.mjs`, `scripts/factory-skills.test.mjs`) to `tests/gates/`, keeping them as `.mjs`, and delete the emptied `scripts/` directory.
- Collapse the five per-test Nix derivations into a single `node-tests` check that runs the runner; `biome-check`, `tsc-check`, and the package derivations are unchanged.
- Keep extension unit tests co-located at `extensions/<name>/<name>.test.ts` under an explicit two-rule placement convention: unit tests beside their module, ownerless contracts under `tests/gates/`.
- Document the tier convention: one gates directory; suites needing hermetic-only inputs keep env-gated subtests (`PI_FACTORY_SKILLS_OUTPUT` skips locally, runs under the hermetic gate).
- Adopt the semantic-suite evidence policy as spec behavior per `docs/adr/0001-semantic-evidence-stays-local.md`: semantic suites run manually at skill-change decision points, never as gates; run evidence stays outside version control. Remove the tracked `tests/semantic/openspec-review/results/` record from HEAD and state the policy in the suite README.
- Record the harness vocabulary (quality gate, gate test, semantic suite, hermetic gate) in `GLOSSARY.md`, and update the development-command documentation in `README.md` and `AGENTS.md`.

## Capabilities

### New Capabilities

- `testing-harness`: How this repository discovers, places, tiers, and runs its automated checks — convention-based discovery, the runner interface shared by local and hermetic execution, the gates/semantic separation, and the semantic evidence contract.

### Modified Capabilities

## Impact

- `package.json` (test scripts), `nix/modules/pi-package.nix` (check derivations), `scripts/` (deleted), `tests/` (runner, gates move, semantic README/results), `README.md`, `AGENTS.md`, `GLOSSARY.md`, `docs/adr/0001-semantic-evidence-stays-local.md`.
- No dependency changes: `package-lock.json` and `npmDepsHash` are unaffected; `.github/workflows/ci.yml` (`nix flake check -L`) is unchanged and already covers the unified set.
- Contributor-facing only: nothing in the distributed package (`pi-skills`, `pi-prompts`, extension outputs) changes.
