# Design

## Context

Four execution surfaces run tests today: `npm test` (five hardcoded file paths), `nix flake check` (one near-identical derivation per test plus `biome-check`/`tsc-check`), the ownerless contract tests in `scripts/`, and the never-wired `tests/semantic/` live-model suite. The semantic suite's evidence policy and the harness vocabulary are already decided and recorded in the working tree: `docs/adr/0001-semantic-evidence-stays-local.md` and the `GLOSSARY.md` testing terms. Repository constraints that shape the approach: Nix mirrors the JS gates and pins `npmDepsHash`; biome is not in `node_modules` (devshell only); the CI workflow runs only `nix flake check -L`; commits are signed and DCO-signed.

## Goals / Non-Goals

**Goals:**

- One seam for gate identity: discovery by convention, so a test file at a recognized root runs by construction.
- One runner entry point shared by local and hermetic execution.
- A Nix side that derives its behavior from that seam instead of re-enumerating tests.
- Named, separated test classes (gate tests vs semantic suites) with the evidence policy enforced by structure.

**Non-Goals:**

- Converting contract tests from `.mjs` to `.ts` or expanding `tsconfig` include paths.
- Touching `nix/packages/pi-acp` (vendored upstream, own tests).
- Running semantic suites in CI or committing their evidence (forbidden by ADR-0001).
- Changing what any existing test asserts; this change relocates and re-routes, it does not rewrite suites.

## Decisions

- **D1 — Discovery replaces registration.** The runner scans `extensions/**/*.test.ts` and `tests/gates/**/*.test.mjs`; those two roots are the entire manifest. Alternative: keep lists and add a rule-checker — rejected because a checker enforces after the fact while discovery makes under-registration impossible.
- **D2 — Runner is a plain Node file at `tests/run.mjs`, spawning `tsx --test --test-concurrency=2` on the discovered set.** Alternatives: globs directly in the `package.json` script (rejected: npm scripts run under `sh` without `globstar`, so a test one directory deeper silently does not run) or a test-framework config file (rejected: adds a dependency surface for no gain). Named `run.mjs` so the glob never self-matches; lives in `tests/` since `scripts/` is deleted.
- **D3 — Two-rule placement.** Unit tests stay co-located with their extension module; ownerless repository contracts move to `tests/gates/`. Alternative: mirror everything under `tests/` — rejected: extensions are the packaged artifacts and opening one should show its contract test.
- **D4 — One runtime.** Everything runs under `tsx`; `docs-version.test.mjs` loses its dependency-free plain-`node` property and its Nix check joins the shared `rootNodeModules` closure. Accepted: the dependency-free property was convenience, not a contract, and `rootNodeModules` is already built and cached for every other check.
- **D5 — Nix collapses to one `node-tests` check** that invokes the runner with `PI_FACTORY_SKILLS_OUTPUT` set; `biome-check` and `tsc-check` remain separate derivations; the five package derivations are untouched. Per-suite failure isolation is traded away deliberately: the suites are seconds-fast, and if a slow suite ever arrives, re-splitting is a small change behind the same runner. `package-lock.json` and `npmDepsHash` are unaffected.
- **D6 — Tiers stay env-gated.** One gates directory; suites needing hermetic-only inputs self-skip missing tiers locally. Alternative: a `tests/gates/nix/` directory — rejected for a tier with one member; eliminating the tier by always building skill output locally was rejected to keep the local loop fast.
- **D7 — Semantic evidence contract is spec behavior backed by ADR-0001.** `npm run test:semantic` stays a thin script to the materializer: it cannot assert pass/fail because grading is human; its honest output is materialized fixture locations plus the procedure README. The tracked `tests/semantic/openspec-review/results/` record is removed from HEAD under the policy.
- **D8 — Vocabulary is normative.** `GLOSSARY.md` gains quality gate, gate test, semantic suite, hermetic gate; `README.md` and `AGENTS.md` development-command sections are updated to name the runner and the two test classes.

## Risks / Trade-offs

- [Single Nix check loses per-suite failure granularity] → suites are seconds-fast; a full rerun is cheap; the runner seam makes re-splitting into per-suite checks a small change.
- [Discovery depends on the recognized roots staying accurate] → the roots live in exactly one file; moving a tree updates one line, and the placement spec makes other locations visibly out of contract.
- [The main checkout currently holds uncommitted `GLOSSARY.md` and `docs/adr/` edits duplicating this change's tasks] → the implementation re-applies them identically in this worktree; the main-checkout copies must be discarded when the change lands to avoid drift.
- [CI stays Nix-only, so first signal waits on a Nix build] → unchanged from the status quo the team accepted when adding CI; no new duplication is introduced.

## Migration Plan

Single PR: runner added, contract tests moved, Nix checks collapsed, documentation updated, results record removed — all one commit series on `issue-71`. Rollback is a revert: the previous lists and derivations are in history. After merge, contributors only need a normal pull; no data or external state migrates.

## Open Questions

None.
