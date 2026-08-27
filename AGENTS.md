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

**`npm install` produces a lockfile nix cannot parse** when `@earendil-works/pi-coding-agent` is upgraded: its published `npm-shrinkwrap.json` omits `integrity` for its own `@earendil-works/*` deps, so npm writes lockfile entries without integrity and nix's npm-deps fetcher panics. After upgrading it, backfill the missing `integrity` hashes in `package-lock.json` manually (fetch each `@earendil-works/*` package's hash from the npm registry), then refresh `npmDepsHash` in `nix/modules/pi-package.nix` (set it to `pkgs.lib.fakeHash`, build any check, copy the `got:` hash back).

**Biome is NOT in `node_modules`** — the `format`/`lint`/`check` scripts require biome in PATH. Use `nix develop` (provides nodejs, typescript, biome, git) or have biome installed globally.

## Repo Layout

- `extensions/permission/index.ts` — Permission extension (imports from `./rules.js`). Registers the `/permission-list-always-allow`, `/permission-reset`, and `/permission-yolo` commands
- `extensions/permission/rules.ts` — Permission rules and `findMatchingRule` logic (dependency-free, testable)
- `extensions/permission/rules.test.ts` — Permission rules test suite (65 tests)
- `extensions/tps/index.ts` — TPS (tokens-per-second) tracking extension (single-file, no `package.json`)
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `skills/` — Pi skills (`<name>/SKILL.md` with YAML frontmatter), packaged via the `pi` field and the `pi-skills` flake output
- `nix/` — Flake devshell and package build config

`package.json` `"pi"` field declares `extensions`, `prompts`, and `skills` directories. `tsconfig.json` includes `extensions/**/*.ts`.

## Key Conventions

- **Biome** for formatting and linting — `biome.json` configures 2-space indentation only; lint rules use defaults
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void`
- **Every extension must have a flake output** — each directory under `extensions/` needs a `pi-<name>` package (and a `<name>-test` check if it has tests) in `nix/modules/pi-package.nix`, wired into both `packages` and `checks`
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **forward order**; first match wins. Actions: `allow`, `ask`, `deny`. Registers commands `permission-list-always-allow`, `permission-reset`, and `permission-yolo`. Resets always-allowed state on `session_start`. `/permission-yolo` (bare toggle / `on` / `off`) enables a session-scoped mode that bypasses all permission checks — including `deny` rules and prompts — with a persistent status-bar warning; it is an explicit typed opt-in (no dialog) and resets on `session_start` and via `permission-reset`. A `--yolo` CLI flag (registered via `pi.registerFlag`) pins YOLO mode on for the entire process run — including headless runs (`-p`, `--mode json`) where there is no UI to prompt; the pin survives `session_start` and `/permission-reset` and cannot be turned off mid-session.
- **Permission extension**: when `PI_SANDBOX=true`, unmatched commands are allowed instead of prompting
- **Permission extension**: when `PI_NO_BELL` is set to any non-empty value, all bell sounds are suppressed (permission prompts and the agent_end "your turn" bell)
`.pi/settings.json` is gitignored and controls what pi loads locally.
