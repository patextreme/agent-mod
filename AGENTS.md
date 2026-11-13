# Agent Mod

Pi coding agent package: prompt templates and skills, plus extensions distributed as Nix flake outputs.

## Dev Commands

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test              # node tests/run.mjs (discovery-based gate runner)
nix flake check        # nix build checks (biome, tsc, node-tests, package builds)
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
- `extensions/codex-alias/` — Codex provider alias (`index.ts` imports `./alias.js`). Registers `openai-codex-secondary` ("OpenAI Codex — Secondary") as an independently authenticated alias of the built-in `openai-codex` provider, reusing its OAuth flow and catalog so two Codex accounts share one agent directory; unit-tested in `alias.test.ts`
- `extensions/notify-me/` — One-shot Discord reminders (`index.ts` with configuration, pending-state, lifecycle, payload, and delivery helpers); registers `/notify-me <message>` and the separate `/notify-me-cancel` command. Ships as `pi-notify-me`; co-located tests use shared discovery.
- `extensions/opencode-usage/` — OpenCode Go allowance meters and catalog-driven peak state (`index.ts` hooks the status slot, `parse.ts` parses the undocumented inference-gateway usage response, `peak.ts` derives peak windows from the model catalog's pricing multipliers). Registers `/opencode-usage-refresh` (which paints usage for any selected model) and, while an `opencode-go` model is selected, shows `opencode-go: <rolling>% / <weekly>% / <monthly>%` (each to one decimal place); models with recurring weekday/hour multipliers also get ` · peak · <countdown> left` (or `off-peak`), repainted by one self-rescheduling timer. Unit-tested in `parse.test.ts`, `peak.test.ts`, and `index.test.ts` (lifecycle with a fake API, fetch, and clock).
- `extensions/<name>/README.md` — Per-extension documentation (behavior, configuration, caveats). The main README is an index and links each one.
- `docs/retired-tooling.md` — Removed orchestration layers and extensions kept as a short migration pointer.
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `skills/` — Pi skills (`<name>/SKILL.md` with YAML frontmatter), packaged via the `pi` field and the `pi-skills` flake output
- `tests/run.mjs` — discovery-based gate runner; the recognized roots are the whole manifest: `extensions/**/*.test.ts` plus `tests/gates/**/*.test.mjs`
- `tests/gates/` — ownerless contract tests (no owning module), run by every gate execution
- `nix/` — Flake devshell and package build config

`package.json` `"pi"` field declares only the `prompts` and `skills` directories; extensions ship exclusively as Nix flake outputs and are intentionally omitted from `pi install`. `tsconfig.json` includes `extensions/**/*.ts`. The retired acpx `flows/` runtime is gone; orchestration lives in the imported skill under `skills/`.

## Agent skills

### Issue tracker

For issue operations and code-review spec discovery, read [the GitHub tracker workflow](docs/agents/issue-tracker.md), including pagination and non-issue spec sources.

### Triage labels

For issue classification and triage states, read [the label vocabulary](docs/agents/labels.md).

### Domain docs

Before exploring the codebase, read [the single-context domain-doc rules](docs/agents/domain.md).

## Key Conventions

- **Biome** for formatting and linting — `biome.json` configures 2-space indentation only; lint rules use defaults
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void`
- **Every extension must have a flake output** — each directory under `extensions/` needs a `pi-<name>` package in `nix/modules/pi-package.nix`, wired into both `packages` and `checks`. Tests need no Nix entry: a co-located `extensions/<name>/<name>.test.ts` runs via the discovery-based `node-tests` check, which invokes `tests/run.mjs`.
- **Test placement is two-rule discovery** — unit tests live beside their extension module; ownerless repository contracts live under `tests/gates/*.test.mjs`. A test file at a recognized root runs without any registration edit; nothing elsewhere runs.
- **Every published skill needs a gate entry** — `tests/gates/skills-distribution.test.mjs` holds the `packagedSkills` map (skill → bundled references) and the `externalSkills` deny list. A skill missing from the map still ships, but nothing checks its packaging, reference links, or discovery.
- **Every extension documents itself** — each `extensions/<name>/` carries a `README.md` with its behavior, configuration, and caveats; the main `README.md` stays an index whose table links each one. `tests/gates/readme-index.test.mjs` fails when an extension README is missing or unlinked, or when any relative link in the index, the extension READMEs, or `docs/retired-tooling.md` dangles. Move depth beside the code instead of growing the first page.
- **Removing an extension mirrors adding one** — delete the directory and every artifact class that references it: the `pi-<name>` derivation and its `packages`/`checks` entries in `nix/modules/pi-package.nix`; any `tsconfig.json` `include`/`exclude` entry; the README extensions-table row; and this file's Repo Layout bullet. Its co-located test and its `README.md` disappear with the directory — discovery and the index gate need no list edit. Dependencies only that extension imported come out of `package.json`, which invalidates `package-lock.json` and the `npmDepsHash` (see the lockfile note above).
- **Notify-me changes**: preserve final `agent_settled` semantics (Pi >=1.1.0), memory-only session arming, and independent dispatched jobs. Read [notify-me documentation](extensions/notify-me/README.md) for configuration, privacy, and retry contracts; [SDK evidence](docs/notify-me-sdk-compatibility.md) for lifecycle/preflight ordering. Tests use temporary configuration and fake network/clocks, never personal credentials or live Discord.
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **forward order**; first match wins. Actions: `allow`, `ask`, `deny`. Registers commands `permission-list-always-allow`, `permission-reset`, and `permission-yolo`. Resets always-allowed state on `session_start`. `/permission-yolo` (bare toggle / `on` / `off`) enables a session-scoped mode that bypasses all permission checks — including `deny` rules and prompts — with a persistent status-bar warning; it is an explicit typed opt-in (no dialog) and resets on `session_start` and via `permission-reset`. A `--yolo` CLI flag (registered via `pi.registerFlag`) pins YOLO mode on for the entire process run — including headless runs (`-p`, `--mode json`) where there is no UI to prompt; the pin survives `session_start` and `/permission-reset` and cannot be turned off mid-session. While either confirmation prompt is open it emits Herdr's `herdr:blocked` event pair (`{ active: true, label }` / `{ active: false }`) so the pane reports blocked; this is a no-op outside a Herdr TUI session. The extension plays no audio.
- **Permission extension**: when `PI_SANDBOX=true`, `ask` rules and unmatched commands are allowed instead of prompting (deny rules still block)
`.pi/settings.json` is gitignored and controls what pi loads locally.
