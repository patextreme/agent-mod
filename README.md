# Agent Mod

Extensions, prompt templates, and skills for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Each extension documents its own behavior, configuration, and caveats in a README beside its code; this page covers what ships, how to install it, and how to work on the repository.

## Requirements

- Pi `^1.4.0` (declared as a peer dependency in [`package.json`](./package.json)); notify-me requires the final-settlement abort flag added in 1.1.0. See the [locked SDK compatibility evidence](./docs/notify-me-sdk-compatibility.md).

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers the prompt templates and skills declared in [`package.json`](./package.json). The extensions are not part of the `pi install` package; build them from the flake outputs instead (see [Nix Packages](#nix-packages)).

## Contents

### Extensions

Each extension is a Nix flake output named `pi-<name>` and is not installed by `pi install`.

| Extension | What it does |
|-----------|--------------|
| [Permission](./extensions/permission/README.md) | Intercepts `bash` tool calls, asks before destructive commands, reports blocked panes to Herdr, and offers an opt-in session-scoped `/permission-yolo` bypass |
| [OpenCode Usage](./extensions/opencode-usage/README.md) | Shows OpenCode Go rolling, weekly, and monthly allowance usage plus the catalog-driven peak/off-peak tag in the status bar |
| [Codex Alias](./extensions/codex-alias/README.md) | Registers `openai-codex-secondary` as an independently authenticated alias of the built-in `openai-codex` provider, so two Codex accounts share one agent directory |
| [Notify Me](./extensions/notify-me/README.md) | Arms a session-scoped, one-shot Discord reminder for final handback, with its configuration, privacy, and retry contracts |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |

### Skills

| Skill | Description |
|-------|-------------|
| [`pr-review-repair`](./skills/pr-review-repair/SKILL.md) | Coordinate three rounds of full two-axis PR review, then a bounded fix-and-verify loop that classifies new findings |

## Nix Packages

Extensions are distributed as flake outputs rather than through `pi install`:

```bash
nix build .#pi-permission
nix build .#pi-opencode-usage
nix build .#pi-codex-alias
nix build .#pi-notify-me
```

Each output is a directory containing the extension, ready to load with Pi's extension path option. The flake also exposes `pi-prompts` and `pi-skills`.

It additionally exposes [`pi-acp`](./nix/packages/pi-acp/README.md), an ACP stdio adapter for Pi, ported from Ptah with its MCP-support patch:

```bash
nix build .#pi-acp
./result/bin/pi-acp
```

Pi must be installed separately and available on `PATH`, or selected with `PI_ACP_PI_COMMAND`. This is a standalone Nix package, not part of `pi install`, and is not added to the development shell. `nix flake check` builds it and runs its upstream and patch tests.

## Skill toolkit

`pr-review-repair` needs an **enhanced Pi host**: stock Pi alone is not sufficient, and installation exposes instructions plus bundled references, not an orchestration runtime or credentials. Before invoking it, prepare:

- **Delegation** — `Agent` and `codemode` in the main session with `general-purpose` workers; the external `code-review` workers need nested Agent access for their two review axes.
- **External skill** — supply `code-review` yourself; it is not bundled. Resolve its real location and pass the absolute path plus repository/worktree context to delegates.
- **Delivery access** — Git and authenticated `gh` access to PRs, issues, checks, pushes, and comments, plus commit signing and DCO sign-off. Target-project policy stays controlling.

Invocation authorizes qualifying edits and publication — commits, normal pushes, and verified PR history comments — not merges or a tool-permission bypass. Read [the skill](./skills/pr-review-repair/SKILL.md) for prerequisites, the three-round discovery window, and the fix-and-verify loop; it ships the complete [MIT notice](./skills/LICENSE). Frontmatter, packaging, and discovery checks give static distribution assurance only — not live operational safety, model obedience, or stock-Pi runtime support.

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # node tests/run.mjs (discovery-based gate runner)
nix flake check        # nix build checks (biome, tsc, node-tests, package builds)
```

Gate tests are discovered by convention — there are no registration lists to update. The two placement rules: unit tests live beside their extension module (`extensions/<name>/<name>.test.ts`), and ownerless repository contracts live under `tests/gates/*.test.mjs`. A file at either recognized root runs in every gate execution, locally and in the hermetic `node-tests` Nix check; a file anywhere else does not run.

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## Retired tooling

The acpx flows, OpenSpec workflow skills, and the Ollama Usage extension are gone as breaking changes with no in-repo replacement; [`pr-review-repair`](./skills/pr-review-repair/SKILL.md) is the surviving skill. See [retired tooling](./docs/retired-tooling.md) for the removed names and the last revision that carries the extension.

## License

MIT — see [LICENSE](./LICENSE). The imported skill and its references bundle their own complete copy: [skills/LICENSE](./skills/LICENSE).
