# Agent Mod

Extensions and prompt templates for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Pi is a terminal coding agent. This package augments it with:

- **Guardrails** — a permission extension that intercepts shell commands and asks before running anything destructive (`git push`, `git rebase`, unknown `gh` calls, …), while auto-allowing safe read-only commands.
- **Usage visibility** — an ollama-usage extension that shows Ollama Cloud session and weekly usage in the status bar.

Install it once and every Pi session in the project gets permission prompts and Ollama Cloud usage in its status bar automatically.

## Requirements

- Pi `^0.99.1` (declared as a peer dependency in [`package.json`](./package.json)).

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

## OpenSpec grooming flow

[`flows/openspec-groom.flow.ts`](./flows/openspec-groom.flow.ts) grooms an **existing active local** change. From this checkout (after `npm install`):

```bash
acpx flow run ./flows/openspec-groom.flow.ts --input-json '{"changeId":"example-change"}'
```

From another local workspace, pass the absolute flow path. Only `changeId` is accepted; archived, missing, store-backed, symlinked, and escaping targets are rejected before edits. OpenSpec must provide `list` and `status --json` with schema-resolved `existingOutputPaths`. The flow runs targeted `openspec validate <id> --type change --strict --json --no-interactive` before review and after each update. Invalid artifacts enter repair; command/JSON failures terminate without retries. Repairs can revise only existing schema planning artifacts, never create missing ones.

### Prerequisites and skill discovery

Requires acpx **0.19.4**, OpenSpec, authenticated Pi, and a working `pi-acp` adapter. Configure acpx's `pi` profile (not just its default agent) in `~/.acpx/config.json`, for example `{"agents":{"pi":{"argv":["pi-acp"]}}}`. Every agent/decision invocation uses an isolated new Pi session, including repeated graph visits. Agent timeouts remain acpx defaults; do not set a global timeout shorter than the intended steering wait.

Pi ACP passes prompts to Pi's RPC skill expansion. Review uses `/skill:openspec-review <id>` with **only the change ID** as run-specific input. Update uses `/skill:openspec-update-change` with current-cycle resolutions, complete steering, and the resolved artifact allowlist. The required update policy lives in this checkout's [project skill](./.pi/skills/openspec-update-change/SKILL.md), not the published `skills/` directory. Ordinary updates still require per-artifact confirmation.

To avoid a same-named global/package skill silently shadowing this policy, pin both skill files in the Pi process used by the adapter. For example create an executable wrapper outside the target change, substituting absolute paths:

```sh
#!/bin/sh
exec /absolute/path/to/pi --no-skills \
  --skill /absolute/path/to/agent-mod/skills/openspec-review/SKILL.md \
  --skill /absolute/path/to/agent-mod/.pi/skills/openspec-update-change/SKILL.md "$@"
```

Set `PI_ACP_PI_COMMAND=/absolute/path/to/wrapper` when running the flow (supported by pi-acp 0.0.34). Verify Pi's loaded-skill diagnostics with that wrapper before use. Without a wrapper, ensure the project skill is trusted/discovered and no same-named skill wins discovery. Model-free repository tests exercise Pi's native `AgentSession.prompt` skill expansion with an explicitly pinned project skill, including a same-name global collision, ordinary confirmations, and preservation of complete multiline grooming authorization. Fake-agent tests additionally check flow routing and sessions; neither test suite proves a live model will obey the policy.

**Tool permissions are separate.** Configure acpx/adapter and Pi permission-extension approvals explicitly for the intended read/edit commands; flow authorization does not approve tools, bypass deny rules, or enable YOLO. Unattended updates need an appropriate separately configured permission policy. If you require no provider retries either, disable Pi's `retry.enabled` separately; the flow itself never retries failed phases.

### Completion, steering, and outcomes

Success means strict structural validation passes and a conclusive review has **no Critical findings**. Major findings, blockers, and readiness labels alone do not trigger repairs or prevent success; grooming success is **not implementation readiness**. Assessments escalate architectural, design, product, high-stakes, and materially different alternatives, for structural repairs as well as Critical findings.

When any issue needs steering, stdin and stderr must be TTYs. The flow displays every escalated issue and recommendation and requires a nonblank answer for each before dispatching one coordinated update (including autonomous fixes). Steering has a **seven-day** deadline, supports cancellation, and closes readline on every exit. EOF or no terminal returns `needs_human`; timeout returns `failed` with its reason. No ACP phase runs while steering reads input.

There are at most **ten updater dispatches**, shared by structural and semantic repairs. Failed updates count, stop immediately, and may leave partial edits. Validation and review still run after update ten, so final convergence can succeed. Repeated Critical findings consume the same budget without a separate early-stop heuristic.

The flow emits one structured result and a concise stderr summary. Examples (the `remaining` field contains the current review/errors):

```json
{"changeId":"example-change","outcome":"success","updateAttempts":2,"summary":"Validation passes; no Critical findings. This is not implementation readiness.","remaining":"Major findings remain..."}
{"changeId":"example-change","outcome":"limit_reached","updateAttempts":10,"summary":"Ten update attempts consumed; unresolved errors or Critical findings remain.","remaining":"Critical findings remain..."}
```

Only `success` exits zero. Other outcomes are `limit_reached`, `needs_human`, `cancelled`, and `failed` (including inconclusive review/assessment, missing artifacts, malformed output, and agent/command errors). Failure routes throw after emitting their result so acpx really exits nonzero. Process-wide termination can interrupt output; acpx's persisted run state remains the diagnostic source.

acpx retains run history and transcripts under `~/.acpx/flows/runs/`. There are **no additional report files, commits, stashes, rollback, or resume/checkpoint support**. Existing dirty artifacts are the starting state; earlier edits are preserved on failure. Restarting explicitly starts a new flow and budget. The allowlist and authorization constrain prompts, not an OS sandbox; use separate isolation if needed.

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # tsx --test (extensions, docs, and flow suites)
nix flake check        # nix build checks (biome, tsc, tests, package builds)
```

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## License

MIT — see [LICENSE](./LICENSE).