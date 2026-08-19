# Agent Mod

Extensions and prompt templates for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Pi is a terminal coding agent. This package augments it with:

- **Guardrails** — a permission extension that intercepts shell commands and asks before running anything destructive (`git push`, `git rebase`, unknown `gh` calls, …), while auto-allowing safe read-only commands.
- **Observability** — a TPS extension that reports tokens/sec, time-to-first-token, stalls, and cost after every LLM turn.
- **Orchestration** — an AgentFlow extension that runs imperative TypeScript/JavaScript flow scripts which spawn and drive isolated sub-agents under a live full-screen orchestrator, and deliver a result back to the main session.

Install it once and every Pi session in the project gets permission prompts and per-turn performance telemetry automatically.

## Requirements

- Pi `^0.79.6` (declared as a peer dependency in [`package.json`](./package.json)).

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers all extensions and prompts declared in [`package.json`](./package.json).

## Contents

### Extensions

| Extension | Description |
|-----------|-------------|
| [Permission](./extensions/permission/index.ts) | Intercepts `bash` tool calls and applies regex-based permission rules; plays a bell on prompts and when the agent finishes; opt-in session-scoped `/permission-yolo` full bypass |
| [TPS](./extensions/tps/index.ts) | Tracks tokens-per-second, TTFT, stalls, and cost per LLM turn; persists telemetry to session for rehydration |
| [AgentFlow](./extensions/agentflow/index.ts) | Runs `/af <name>` flow scripts (`.pi/agentflow/`) that orchestrate isolated sub-agent sessions via an injected `af` API, under a blocking full-screen Orchestrator |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`commit-create-commit`](./prompts/commit-create-commit.md) | Create a git commit with an agreed-upon message |
| [`commit-create-commit-signoff`](./prompts/commit-create-commit-signoff.md) | Create a git commit with DCO sign-off |
| [`commit-generate-message`](./prompts/commit-generate-message.md) | Generate a commit message from staged changes |
| [`commit-generate-message-conventional`](./prompts/commit-generate-message-conventional.md) | Generate a conventional commit message |
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |
| [`openspec-review`](./prompts/openspec-review.md) | Review an OpenSpec change for semantic soundness before implementation |
| [`review`](./prompts/review.md) | Review code changes and provide actionable feedback |

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

**YOLO mode:**
- `/permission-yolo` — toggle session-scoped YOLO mode. Bare invocation toggles; `on`/`off` set it explicitly. While on, **every** `bash` command is allowed without consulting rules or prompting — including `ask`/`deny` rules and the no-match prompt.
- A persistent yellow `⚠️ YOLO MODE ON` warning shows in the status bar while enabled.
- YOLO mode is a deliberate, explicit opt-in: the typed command itself is the confirmation (no dialog). It resets to off on each new session, and `/permission-reset` also disables it.

A bell (`extensions/permission/sounds/message.oga`, played via `pw-play`) rings on each permission prompt and when the agent finishes a run (suppressed if you aborted it), so you don't have to watch the screen.

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

## AgentFlow Extension

Runs repeatable, multi-step workflows as imperative scripts that drive *isolated sub-agent sessions* and return a result to the main session.

**Invocation:** `/af <flow-name>` (or `/af:<flow-name>` for any flow already on
disk at session start) — resolves `.pi/agentflow/<name>.ts` (project, trusted)
then `~/.pi/agentflow/<name>.ts` (global), with `.js` fallbacks. Per-flow
`/af:<name>` shortcuts are registered for every discoverable flow on session
start, mirroring pi-taskflow; `/af <name>` remains the fallback for flows
created mid-session.

**Scripting surface:** a single injected `af` global — `af.createAgent(config)`, `sendMessage(text, opts?)` on the returned handle, `af.log(...)`, `af.result(value)`, and `af.cwd`. Scripts have no other imports or globals.

**UX:** in TUI mode the run appears as a blocking full-screen Orchestrator (live agent overview, streamed `af.log`, tap-in to view a running agent's conversation, steer, and stop). In non-TUI modes the flow runs without the UI and still delivers its result.

**Safety:** project scripts only run when the project is trusted; `.ts`/`.js` sources are syntax-validated before execution and `.ts` is type-checked against the shipped `agentflow.d.ts` declarations.

**Validate while authoring:** the always-on `agentflow_validate` tool (for the LLM) and `/af-validate <name>` command (for a human) run the same resolve → syntax → type-check as `/af` and report located errors, letting you check a draft flow before it is ever executed.

See the [`agentflow` skill](./extensions/agentflow/skills/agentflow/SKILL.md) and the [`reviewcode` example](./extensions/agentflow/examples/reviewcode.ts).

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # tsx --test (permission, crof, and agentflow suites)
nix flake check        # nix build checks (biome, tsc, tests, package builds)
```

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## License

MIT — see [LICENSE](./LICENSE).