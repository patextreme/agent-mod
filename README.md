# Agent Mod

Extensions and prompt templates for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Pi is a terminal coding agent. This package augments it with:

- **Guardrails** — a permission extension that intercepts shell commands and asks before running anything destructive (`git push`, `git rebase`, unknown `gh` calls, …), while auto-allowing safe read-only commands.
- **Usage visibility** — an ollama-usage extension that shows Ollama Cloud session and weekly usage in the status bar.

Install it once and every Pi session in the project gets permission prompts and Ollama Cloud usage in its status bar automatically.

## Requirements

- Pi `^0.79.6` (declared as a peer dependency in [`package.json`](./package.json)).

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers all extensions, prompts, and skills declared in [`package.json`](./package.json).

## Contents

### Extensions

| Extension | Description |
|-----------|-------------|
| [Permission](./extensions/permission/index.ts) | Intercepts `bash` tool calls and applies regex-based permission rules; plays a bell on prompts and when the agent finishes; opt-in session-scoped `/permission-yolo` full bypass |
| [Ollama Usage](./extensions/ollama-usage/index.ts) | Shows Ollama Cloud session/weekly usage in the status bar; refreshes on ollama-cloud model selection and via `/ollama-usage-refresh` |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`commit-create-commit`](./prompts/commit-create-commit.md) | Create a git commit with an agreed-upon message |
| [`commit-create-commit-signoff`](./prompts/commit-create-commit-signoff.md) | Create a git commit with DCO sign-off |
| [`commit-generate-message`](./prompts/commit-generate-message.md) | Generate a commit message from staged changes |
| [`commit-generate-message-conventional`](./prompts/commit-generate-message-conventional.md) | Generate a conventional commit message |
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |
| [`review`](./prompts/review.md) | Review code changes and provide actionable feedback |

### Skills

| Skill | Description |
|-------|-------------|
| [`openspec-review`](./skills/openspec-review/SKILL.md) | Review an OpenSpec change for semantic soundness before implementation |

## Permission Extension

Intercepts every `bash` tool call and applies regex-based permission rules in **forward order** — the first matching rule wins.

**Actions:**
- `allow` — proceed without prompting
- `ask` — prompt the user for confirmation (with a "Always allow" option)
- `deny` — block immediately with a reason

**Built-in rules** (see [`rules.ts`](./extensions/permission/rules.ts) for the exact regexes):
- `git push`, `git rebase` — ask
- Read-only `gh` subcommands — allow: `gh search`, `gh repo view/list`, `gh issue view/list`, `gh pr view/list/checks/diff`, `gh release view/list`, `gh workflow view/list`, `gh run view/list/watch`
- `gh api` GET requests — allow, both explicit (`--method GET` / `-X GET`) and implicit (no `--method`/`-X` and no body-adding flags `-f`/`-F`/`--field`/`--raw-field`)
- Any other `gh ...` command — ask
- Commands that match **no** rule: ask outside a sandbox, auto-allow when `PI_SANDBOX=true`

There is no explicit `git commit` rule; commits fall through to the unmatched-command path (ask outside sandbox).

**Commands:**
- `/permission-list-always-allow` — show all patterns the user chose "Always allow" for
- `/permission-reset` — clear all "Always allow" choices and disable YOLO mode

The always-allow state resets on each new session.

**YOLO mode:**
- `/permission-yolo` — toggle session-scoped YOLO mode. Bare invocation toggles; `on`/`off` set it explicitly. While on, **every** `bash` command is allowed without consulting rules or prompting — including `ask`/`deny` rules and the no-match prompt.
- A persistent yellow `⚠️ YOLO MODE ON` warning shows in the status bar while enabled.
- YOLO mode is a deliberate, explicit opt-in: the typed command itself is the confirmation (no dialog). It resets to off on each new session, and `/permission-reset` also disables it.
- `--yolo` — CLI flag pinning YOLO mode on for the entire process run, including headless runs (`-p`, `--mode json`). The pin survives `session_start` and `/permission-reset` and cannot be turned off mid-session; `/permission-yolo off` while pinned reports that the mode is pinned instead of disabling it.

A bell (`extensions/permission/sounds/message.oga`, played via `pw-play`) rings on each permission prompt and when the agent finishes a run (suppressed if you aborted it), so you don't have to watch the screen.

## Ollama Usage Extension

Shows Ollama Cloud session and weekly usage in the pi status bar as `ollama: 2.6% / 0.8%` (session / weekly).

- Polls ollama.com's undocumented `GET /api/usage` endpoint (the one backing the ollama.com dashboard). It may change or disappear without notice.
- Refreshes whenever an ollama-cloud model is selected — `/model`, Ctrl+P cycling, and session restore — and via `/ollama-usage-refresh`.
- Switching to a non-ollama-cloud model clears the slot.
- Reuses pi's resolved ollama-cloud provider key, so no separate configuration is needed beyond the existing ollama-cloud entry in `models.json`.
- Failure paths are non-throwing: a failed fetch renders the dim placeholder `ollama: ? / ?`, and a missing provider key silently clears the slot.

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # tsx --test (permission and ollama-usage suites)
nix flake check        # nix build checks (biome, tsc, tests, package builds)
```

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## License

MIT — see [LICENSE](./LICENSE).