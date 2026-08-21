# Agent Mod

Pi coding agent package: extensions and prompt templates.

## Dev Commands

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test              # tsx --test (permission rules)
nix flake check        # nix build checks (biome, tsc, permission tests, package builds)
```

Quality gates: `format → lint → typecheck → test`.

**Before committing changes that touch `package*.json` or `nix/`**, also run:

```bash
nix flake check
```

(This verifies Nix package builds, the flake checks mirror the JS checks, and catches stale `npmDepsHash` values after dependency changes.)

**Biome is NOT in `node_modules`** — the `format`/`lint`/`check` scripts require biome in PATH. Use `nix develop` (provides nodejs, typescript, biome, git) or have biome installed globally.

## Repo Layout

- `extensions/permission/index.ts` — Permission extension (imports from `./rules.js`). Registers the `/permission-list-always-allow`, `/permission-reset`, and `/permission-yolo` commands
- `extensions/permission/rules.ts` — Permission rules and `findMatchingRule` logic (dependency-free, testable)
- `extensions/permission/rules.test.ts` — Permission rules test suite (65 tests)
- `extensions/tps/index.ts` — TPS (tokens-per-second) tracking extension (single-file, no `package.json`)
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `skills/` — Pi skills (`<name>/SKILL.md` with YAML frontmatter), packaged via the `pi` field and the `pi-skills` flake output
- `nix/` — Flake devshell and package build config

`package.json` `"pi"` field declares `extensions` and `prompts` directories. `tsconfig.json` includes `extensions/**/*.ts`.

## Key Conventions

- **Biome** for formatting and linting — `biome.json` configures 2-space indentation only; lint rules use defaults
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void`
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **forward order**; first match wins. Actions: `allow`, `ask`, `deny`. Registers commands `permission-list-always-allow`, `permission-reset`, and `permission-yolo`. Resets always-allowed state on `session_start`. `/permission-yolo` (bare toggle / `on` / `off`) enables a session-scoped mode that bypasses all permission checks — including `deny` rules and prompts — with a persistent status-bar warning; it is an explicit typed opt-in (no dialog) and resets on `session_start` and via `permission-reset`.
- **Permission extension**: when `PI_SANDBOX=true`, unmatched commands are allowed instead of prompting
`.pi/settings.json` is gitignored and controls what pi loads locally.
