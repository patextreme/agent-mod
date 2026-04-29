# Agent Mod

Extensions, prompt templates, and chain definitions for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers all extensions and prompts declared in [`package.json`](./package.json). Chain definitions in `.pi/chains/` are loaded automatically at project scope when you run pi in a directory containing this repo as `.pi/`.

## Contents

### Extensions

| Extension | Description |
|-----------|-------------|
| [Permission](./extensions/permission/index.ts) | Intercepts `bash` tool calls and applies regex-based permission rules |
| [Chain](./extensions/chain/src/index.ts) | Loads and executes multi-step prompt chains from `.pi/chains/` definitions |
| [TPS](./extensions/tps/index.ts) | Tracks tokens-per-second, TTFT, stalls, and cost per LLM turn; persists telemetry to session; provides `/tps-export` command |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`commit-create-commit`](./prompts/commit-create-commit.md) | Create a git commit with an agreed-upon message |
| [`commit-create-commit-signoff`](./prompts/commit-create-commit-signoff.md) | Create a git commit with DCO sign-off |
| [`commit-generate-message`](./prompts/commit-generate-message.md) | Generate a commit message from staged changes |
| [`commit-generate-message-conventional`](./prompts/commit-generate-message-conventional.md) | Generate a conventional commit message |
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |
| [`review`](./prompts/review.md) | Review code changes and provide actionable feedback |

### Chain Definitions

| Chain | Description |
|-------|-------------|
| [`backlog-execute`](./.pi/chains/backlog-execute.yaml) | Execute a backlog task following the full task execution workflow, with handoff to `backlog-verify` |
| [`backlog-verify`](./.pi/chains/backlog-verify.yaml) | Verify completed backlog tasks |
| [`backlog-finalize`](./.pi/chains/backlog-finalize.yaml) | Finalize completed backlog tasks |
| [`backlog-groom`](./.pi/chains/backlog-groom.yaml) | Groom backlog items |
| [`greeting`](./.pi/chains/greeting.yaml) | Example chain demonstrating loop, $ARGUMENTS substitution, and exit prompts |

Chains are loaded from `.pi/chains/` (local, project-scoped) and `~/.pi/chains/` (global). When a chain is registered, it becomes the `chain-<name>` command in pi.

## Permission Extension

Intercepts every `bash` tool call and applies regex-based permission rules in **forward order** — the first matching rule wins.

**Actions:**
- `allow` — proceed without prompting
- `ask` — prompt the user for confirmation (with a "Always allow" option)
- `deny` — block immediately with a reason

**Default rules:**
- `git commit`, `git push`, `git rebase`, `gh ...` (non-read commands) — ask
- `gh repo view`, `gh repo list`, `gh issue view`, `gh issue list`, `gh pr view`, `gh pr list`, `gh pr checks`, `gh pr diff`, `gh release view`, `gh release list`, `gh workflow view`, `gh workflow list`, `gh run view`, `gh run list`, `gh run watch` — allow
- Unmatched commands outside sandbox — ask
- Unmatched commands inside sandbox (`PI_SANDBOX=true`) — allow automatically

**Commands:**
- `/permission-list-always-allow` — show all patterns the user chose "Always allow" for
- `/permission-reset` — clear all "Always allow" choices

The always-allow state resets on each new session.

## Chain Extension

Loads chain definitions from `.pi/chains/` (YAML or JSON) and registers each as a `chain-<name>` command. Chain files use YAML frontmatter-like structure — see the [schema](./extensions/chain/src/schema.ts) for details.

**Features:**
- **Multi-step chains** — sequential prompt steps with `$ARGUMENTS` substitution
- **Exit prompts** — `type: exitPrompt` steps that evaluate a condition and break the loop when the agent calls `chain_exit`
- **Loop support** — repeat the step sequence N times (`loop` field)
- **Chain handoff** — after completion, transfer execution to another chain (`handoffTarget`)
- **Conditional handoff** — evaluate `handoffExitPrompt` to skip handoff
- **Priority-based loading** — same-stem files: `.yaml` > `.yml` > `.json` within a directory; local `.pi/chains/` shadows global `~/.pi/chains/`
- **`chain_exit` tool** — an agent-callable tool injected during chain execution to exit early

The chain extension registers the `chain_exit` tool (available only during chain execution) and provides status bar updates showing the current chain, step, and loop.

## TPS Extension

Captures structured telemetry at every LLM turn: tokens, timing, TPS, and cost.

**Tracks:**
- Tokens per second (real-time via token-by-token updates)
- Time to first token (TTFT)
- Total wall-clock time and actual generation time
- Inference stall detection (gaps > 500ms between token updates, e.g. GPU queuing pauses)
- Model, provider, and per-message token usage including cache hits and cost

**Displays:** A compact notification bar entry after each turn, e.g.:

> `TPS 42.3 tok/s · TTFT 1.2s · 8.4s · out 356 · in 1,280`

**Command:**
- `/tps-export [--full] [customType]` — export telemetry as JSONL. Defaults to current branch; `--full` exports the entire session tree. Optionally filter by custom entry type. Structural entries (model changes, branch points) are always included so the exported tree is self-contained.

## Development

```bash
npm install               # install deps
npm run format            # biome format --write .
npm run lint              # biome lint .
npm run typecheck         # tsc --noEmit
```

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

## License

MIT
