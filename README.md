# Agent Mod

Extensions, prompt templates, and chain definitions for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Pi is a terminal coding agent. This package augments it with three things:

- **Guardrails** — a permission extension that intercepts shell commands and asks before running anything destructive (`git push`, `git rebase`, unknown `gh` calls, …), while auto-allowing safe read-only commands.
- **Workflows** — a chain extension that turns multi-step agent prompts into single reusable commands (`chain-<name>`), including a complete backlog task lifecycle (execute → verify → finalize).
- **Observability** — a TPS extension that reports tokens/sec, time-to-first-token, stalls, and cost after every LLM turn.

Install it once and every Pi session in the project gets permission prompts, chain commands, and per-turn performance telemetry automatically.

## Requirements

- Pi `^0.79.6` (declared as a peer dependency in [`package.json`](./package.json)).
- The **backlog chains and prompts** assume a `backlog` MCP server is connected. The chain and prompt files call `mcp({ connect: "backlog" })` and use `task_view` / `task_edit` / `backlog://` resources. That server is **not** included in this package — install and configure it separately, or the backlog chains will stop and report the missing connection.

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers all extensions and prompts declared in [`package.json`](./package.json). Chain definitions in `.pi/chains/` are loaded automatically at project scope when you run pi in a directory containing this repo as `.pi/`.

## Contents

### Extensions

| Extension | Description |
|-----------|-------------|
| [Permission](./extensions/permission/index.ts) | Intercepts `bash` tool calls and applies regex-based permission rules; plays a bell on prompts and when the agent finishes |
| [Chain](./extensions/chain/src/index.ts) | Loads and executes multi-step prompt chains from `.pi/chains/` definitions |
| [TPS](./extensions/tps/index.ts) | Tracks tokens-per-second, TTFT, stalls, and cost per LLM turn; persists telemetry to session for rehydration |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`backlog-review`](./prompts/backlog-review.md) | Review a backlog task for technical correctness, completeness, and blocking issues before implementation |
| [`backlog-lesson`](./prompts/backlog-lesson.md) | Summarize key findings and research needs from an implementation session when approaching context limits |
| [`commit-create-commit`](./prompts/commit-create-commit.md) | Create a git commit with an agreed-upon message |
| [`commit-create-commit-signoff`](./prompts/commit-create-commit-signoff.md) | Create a git commit with DCO sign-off |
| [`commit-generate-message`](./prompts/commit-generate-message.md) | Generate a commit message from staged changes |
| [`commit-generate-message-conventional`](./prompts/commit-generate-message-conventional.md) | Generate a conventional commit message |
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |
| [`openspec-review`](./prompts/openspec-review.md) | Review an OpenSpec change for semantic soundness before implementation |
| [`review`](./prompts/review.md) | Review code changes and provide actionable feedback |

### Chain Definitions

Chains turn multi-step agent workflows into single commands. The backlog chains below implement a full task lifecycle, with the `-flow` chains orchestrating the others via `callChain` steps.

| Chain | Description |
|-------|-------------|
| [`backlog-execute`](./.pi/chains/backlog-execute.yaml) | Execute a backlog task following the full task execution workflow |
| [`backlog-verify`](./.pi/chains/backlog-verify.yaml) | Review the codebase against a task's definition (loops until clean) |
| [`backlog-finalize`](./.pi/chains/backlog-finalize.yaml) | Finalize a completed task's record (loops until clean) |
| [`backlog-groom`](./.pi/chains/backlog-groom.yaml) | Groom backlog items against the task creation guidelines |
| [`backlog-execute-flow`](./.pi/chains/backlog-execute-flow.yaml) | Orchestrate execute → verify → finalize via `callChain` steps |
| [`backlog-verify-flow`](./.pi/chains/backlog-verify-flow.yaml) | Orchestrate verify → finalize via `callChain` steps |
| [`greeting`](./.pi/chains/greeting.yaml) | Example chain demonstrating loop, `$ARGUMENTS` substitution, and exit prompts |

Chains are loaded from `.pi/chains/` (local, project-scoped) and `~/.pi/chains/` (global). When a chain is registered, it becomes the `chain-<name>` command in pi.

## Quick start

Run the example greeting chain — it loops up to 3 times and exits early once the agent decides the user's name is Alice:

```
> /chain-greeting Bob
```

To try the backlog workflow, make sure the `backlog` MCP server is connected, then:

```
> /chain-backlog-execute-flow task-42
```

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
- `/permission-reset` — clear all "Always allow" choices

The always-allow state resets on each new session.

A bell (`extensions/permission/sounds/message.oga`, played via `pw-play`) rings on each permission prompt and when the agent finishes a run (suppressed if you aborted it), so you don't have to watch the screen.

## Chain Extension

Loads chain definitions from `.pi/chains/` (**YAML or JSON** files) and registers each as a `chain-<name>` command. See the [schema](./extensions/chain/src/schema.ts) for the full file format.

**Features:**
- **Multi-step chains** — sequential prompt steps with `$ARGUMENTS` substitution
- **Exit prompts** — `type: exitPrompt` steps that evaluate a condition and break the loop when the agent calls `chain_exit`
- **Loop support** — repeat the step sequence N times (`loop` field)
- **Call chain steps** — `type: callChain` steps invoke another chain as a subroutine with context isolation and scoped exit state (nesting depth limit of 10)
- **Priority-based loading** — same-stem files: `.yaml` > `.yml` > `.json` within a directory; local `.pi/chains/` shadows global `~/.pi/chains/`
- **`chain_exit` tool** — an agent-callable tool injected during chain execution to exit early

The chain extension registers the `chain_exit` tool (available only during chain execution) and updates the status bar with the current chain, step, and loop.

## TPS Extension

Captures structured telemetry at every LLM turn: tokens, timing, TPS, and cost.

**Tracks:**
- Tokens per second (real-time via token-by-token updates)
- Time to first token (TTFT)
- Total wall-clock time and actual generation time
- Inference stall detection (gaps > 500ms between token updates, e.g. GPU queuing pauses)
- Model, provider, and per-message token usage including cache hits and cost

**Displays:** a compact notification bar entry after each turn, e.g.:

> `TPS 42.3 tok/s · TTFT 1.2s · 8.4s · out 356 · in 1,280`

Telemetry is persisted to the session JSONL so the last notification can be restored on resume.

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # tsx --test (permission rules suite)
nix flake check        # nix build checks (biome, tsc, tests, package builds)
```

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## License

MIT — see [LICENSE](./LICENSE).