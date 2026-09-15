## 1. Prerequisite and planning artifacts

- [x] 1.1 Archive `agentflow-script-imports` so the retirement delta enumerates the post-archive requirement set — verified: the change moved to `openspec/changes/archive/2026-09-15-agentflow-script-imports/`, the three main specs gained +5/~7 requirements, and `openspec validate --all --strict` passes
- [x] 1.2 Author the change's `proposal.md`, `design.md`, and four `## REMOVED Requirements` delta specs covering all 42 requirements, with `retire_capabilities: true` in `.openspec.yaml` — verified: `openspec validate remove-unused-extensions --strict` reports the change valid

## 2. Remove the crof extension

- [x] 2.1 Delete `extensions/crof/` and remove the `pi-crof` derivation, the `crof-test` check, and their `packages`/`checks` entries from `nix/modules/pi-package.nix` — verified: `grep -n 'crof' nix/modules/pi-package.nix` returns nothing
- [x] 2.2 Drop `extensions/crof/parse.test.ts` from the `test` script in `package.json` and run `npm test` — verified: the remaining suites pass
- [x] 2.3 Update the two comments naming the crof extension (`README.md`'s `npm test` line, `extensions/ollama-usage/index.ts`'s refresh note) — verified: `git grep -in 'crof'` returns nothing

## 3. Remove the tps extension

- [x] 3.1 Delete `extensions/tps/` and remove the `pi-tps` derivation, check, and entries from `nix/modules/pi-package.nix` — verified: `grep -n 'pi-tps' nix/modules/pi-package.nix` returns nothing
- [x] 3.2 Remove the TPS row from the README extensions table, the `## TPS Extension` section, and the `extensions/tps/index.ts` bullet from `AGENTS.md` — verified: `git grep -in 'tps' -- ':!openspec'` returns nothing

## 4. Remove the agentflow extension

- [x] 4.1 Delete `extensions/agentflow/` and the tracked `.pi/agentflow/` flow script and declarations — verified: both paths no longer exist
- [x] 4.2 Remove the `pi-agentflow` derivation, the `agentflow-test` check, and their `packages`/`checks` entries from `nix/modules/pi-package.nix`, including the bundled `jiti`/`typebox`/skill/example copies — verified: `grep -n 'agentflow' nix/modules/pi-package.nix` returns nothing
- [x] 4.3 Drop the four `extensions/agentflow/*.test.ts` paths from the `test` script in `package.json` and run `npm test` — verified: the remaining suites pass
- [x] 4.4 Reduce `tsconfig.json` to `"include": ["extensions/**/*.ts"]` and remove the `exclude` — verified: `npm run typecheck` passes
- [x] 4.5 Remove the AgentFlow row from the README extensions table and the `## AgentFlow Extension` section — verified: `git grep -in 'agentflow' -- ':!openspec'` returns nothing
- [x] 4.6 Run `nix flake check` — verified: all packages, checks, biome, tsc, and test derivations build after the three removals

## 5. Drop the orphaned dependencies

- [x] 5.1 Remove `jiti` and `typebox` from `dependencies`, `@earendil-works/pi-ai` and `@earendil-works/pi-tui` from `devDependencies`, and `@earendil-works/pi-tui` from `peerDependencies` in `package.json`
- [x] 5.2 Regenerate `package-lock.json` and inspect the diff — verified: every `@earendil-works/*` entry still carries `integrity`, with any stripped hash backfilled from the npm registry
- [x] 5.3 Refresh `npmDepsHash` in `nix/modules/pi-package.nix` (`pkgs.lib.fakeHash` → build one check → copy the reported `got:` value back) and run `nix flake check` — verified: all checks build with the refreshed hash

## 6. Documentation

- [x] 6.1 Add the `ollama-usage` row to the README extensions table and an `## Ollama Usage Extension` section — verified: the table lists every directory under `extensions/`
- [x] 6.2 Re-frame the README's opening capability bullets so they no longer advertise TPS or AgentFlow — verified: every capability the intro names is one the package still ships

## 7. Removal convention

- [x] 7.1 Add the extension-removal procedure to `AGENTS.md`'s Key Conventions, mirroring the existing flake-output rule — verified: the bullet enumerates every artifact class this change had to touch
- [x] 7.2 Drop the stale `extensions/chain/node_modules/` line from `.gitignore` — verified: `extensions/chain/` does not exist

## 8. Archive

- [x] 8.1 Archive `remove-unused-extensions` so `retire_capabilities: true` deletes the four capability specs — verified: `openspec validate --all --strict` passes and `openspec list --specs` no longer lists any `agentflow-*` capability
