# Agent Mod

Pi coding agent package: extensions and prompt templates.

## Dev Commands

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
```

No test suite. Verify with: `format → lint → typecheck`.

**Biome is NOT in `node_modules`** — the `format`/`lint`/`check` scripts require biome in PATH. Use `nix develop` (provides nodejs, typescript, biome, git) or have biome installed globally.

## Repo Layout

- `extensions/permission/index.ts` — Permission extension (single-file, no `package.json`)
- `extensions/chain/` — Chain extension (package-with-dependencies). Owns `zod ^4` and `yaml ^2.8.3` in its own `package.json`
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `.pi/chains/` — Chain definitions (JSON or YAML). Each file becomes a `chain-<name>` command
- `nix/` — Flake devshell and package build config

`package.json` `"pi"` field declares `extensions` and `prompts` directories. `tsconfig.json` includes `extensions/**/*.ts`.

## Key Conventions

- **Biome** for formatting and linting — `biome.json` configures 2-space indentation only; lint rules use defaults
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void`
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **forward order**; first match wins. Actions: `allow`, `ask`, `deny`. Registers commands `permission-list-always-allow` and `permission-reset`. Resets always-allowed state on `session_start`.
- **Permission extension**: when `PI_SANDBOX=true`, unmatched commands are allowed instead of prompting
- **Nix build gotcha**: `nix/modules/pi-package.nix` hardcodes which chain extension source files are copied (`index.ts`, `execution.ts`, `loader.ts`, `schema.ts`). Adding a new `.ts` file to `extensions/chain/src/` requires updating the Nix module or the flake package build breaks.

## Chain Definitions

Chains are JSON/YAML files in `.pi/chains/` (local, project-scoped) and `~/.pi/chains/` (global, shared). The filename stem becomes the `chain-<name>` command.

- **Local precedence:** if a chain exists in both directories, the local version is used
- **Global availability:** chains unique to `~/.pi/chains` remain available even when a local `.pi/chains` directory exists
- **Same-stem priority:** `.yaml` > `.yml` > `.json` is applied *per directory*, not across directories
- **No cross-directory shadowing warnings:** no warnings are emitted when a chain exists in both directories (only same-stem priority warnings within a single directory)

Schema details and handoff behavior are defined in `extensions/chain/src/schema.ts` and `extensions/chain/src/execution.ts`. In short:

- `description` (required), `steps` (required, ≥1)
- Each step is either:
  - Prompt step: `prompt` string (default if `type` omitted)
  - Exit step: `type: exitPrompt`, `exitPrompt` string — agent calls `chain_exit` to break the loop
- `loop` (optional, integer, default 1) — repeats step sequence
- `handoffTarget` (optional) — chain name to hand off to after completion
- `handoffExitPrompt` (optional) — condition evaluated after completion; if agent calls `chain_exit`, handoff is skipped
- Step-level `exitPrompt` only breaks the loop; it never prevents handoff
- Context resets between chains during handoff
- Malformed/invalid files are skipped with descriptive warnings

`.pi/settings.json` is gitignored and controls what pi loads locally.
