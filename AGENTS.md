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

Dev shell via Nix (`nix develop`) provides nodejs, typescript, biome, git.

## Repo Layout

- `extensions/` — Pi extensions (TS). Currently only `permission.ts`
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `nix/` — Flake devshell config

`package.json` `"pi"` field declares which directories contain extensions and prompts. `tsconfig.json` only includes `extensions/**/*.ts` — extensions are the only type-checked source.

`.pi/settings.json` is gitignored and controls what pi loads locally (prevents auto-discovery from loading project extensions/prompts unconditionally).

## Key Conventions

- **Biome** for formatting and linting — configured via `biome.json` (2-space indentation)
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void` and use `pi.on("tool_call", ...)` to intercept
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **reverse order** (later patterns override earlier ones). Actions: `allow`, `ask`, `deny`
- **Permission extension**: when `PI_SANDBOX=true`, unmatched commands are allowed instead of prompting the user
