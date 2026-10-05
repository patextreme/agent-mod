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

## Nix Packages

The flake also exposes [`pi-acp`](./nix/packages/pi-acp/README.md), an ACP stdio
adapter for Pi, ported from Ptah with its MCP-support patch:

```bash
nix build .#pi-acp
./result/bin/pi-acp
```

Pi must be installed separately and available on `PATH`, or selected with
`PI_ACP_PI_COMMAND`. This is a standalone Nix package, not part of `pi install`,
and is not added to the development shell. `nix flake check` builds it and runs
its upstream and patch tests.

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
| [`acpx-flow`](./skills/acpx-flow/SKILL.md) | Create, modify, and debug acpx flows using the official capability documentation |
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

### Subagent permissions

Parent-only permission checks are **opt-in, per-type configuration** in
`@tintinweb/pi-subagents`, not a new runtime guarantee from this package.
This guidance was checked against the installed **0.19.0** documentation,
frontmatter parser, discovery, and extension-selection implementation. Check
compatibility and extension identity again for other versions/installations.
Installing this package does not create or customize agent definitions.

Merge this fragment into each intended child type's **existing** frontmatter:

```yaml
extensions: true
exclude_extensions: permission
```

**Security warning:** Excluded children bypass this extension's bash approval
and deny policy, including both `ask` and `deny` enforcement, regardless of
parent YOLO, approvals, or `/permission-reset`. The unchanged parent extension
continues checking parent bash; other loaded extensions may independently veto
child execution. Approval to delegate is not approval of individual child
commands. Read-only tool menus and worktree isolation do not sandbox arbitrary
bash. Exclusion prevents this extension's hooks/tools from binding, but extension
factories can still execute during loading: it is not containment or an OS
sandbox. Delegate trusted tasks; use real sandboxing where unrestricted
execution is unacceptable.

Keep any deliberate `extensions` allowlist instead of replacing it with `true`.
Append `permission` to existing exclusions rather than overwriting them; CSV
strings and YAML lists (for example, `[telemetry, permission]`) are supported.
Exclusions win over inclusion and use case-insensitive plain canonical names,
not paths or wildcards. The conventional `permission/index.ts` entry (including
`extensions/permission/index.ts`) matches `permission`, not this package's name.
Check the actual discovered entry path if your installation differs. Avoid
`extensions: false` for this purpose: it removes unrelated extensions too.

For a built-in, use `/agents` → **Agent types** → select type → **Eject**, choose
Project or Personal, then edit the exported definition. Preserve its full prompt
body, tools, model, and other settings; a minimal same-name override replaces,
not merges with, the original. For an existing override, edit the winning file.
Discovery precedence, highest first, is:

1. Project `.pi/agents/<name>.md`
2. Project `.agents/agents/<name>.md`
3. Global `$PI_CODING_AGENT_DIR/agents/<name>.md` (default
   `~/.pi/agent/agents/<name>.md`)

Frontmatter `name` determines the dispatch type when present, otherwise the
filename does. Same-name project definitions override global ones.

Inventory every selected type in the intended delegation paths: nested children
use their own definitions, not their caller's exclusion. Workflows select
`agentType`, defaulting to `general-purpose`. Include configured fallback types
(the default top-level fallback is `general-purpose`); nested unknown, disabled,
or out-of-allowlist types are rejected rather than falling back. Excluding one
type is not a global setting or automatic inheritance. Future types need an
explicit decision too.

#### Operator smoke test and rollback

Manual adoption and testing are separate operator rollout steps; this repository
does not deploy them. Use a disposable workspace with the intended project
agent definitions and extension discovery; run Pi from that configuration root.
Restart Pi to rediscover configuration and spawn **fresh** children;
do not resume existing ones to test a frontmatter change.

1. Inspect each winning definition via `/agents` → **Agent types** → select type
   → **Edit** (cancel without changes when only inspecting). Check its source
   location, exclusions, extension allowlist, and bash availability. Verify the
   installed pi-subagents documentation/parser supports `exclude_extensions`,
   and its `src/agent-runner.ts` canonical-name logic matches the discovered
   permission entry. Check for typos or path/wildcard exclusions. Investigate
   any surfaced `extension-error:exclude_extensions` unmatched-name diagnostics.
   In the checked 0.19.0 UI, these activity events are not reliably displayed or
   retained: absence of visible warnings is **not** evidence of a match. File
   inspection alone also does not enumerate a live child's loaded extensions;
   use the behavioral controls below before relying on the configuration.
2. Start without `--yolo`, with `PI_SANDBOX` unset or `false` at process startup,
   and run `/permission-yolo off`. A CLI-pinned YOLO mode cannot be disabled by
   that command or reset: restart without the flag. Ensure the parent still
   loads the permission extension.
3. Ask the parent to execute exactly this harmless bash command:

   ```bash
   printf 'permission-scope-check\n'
   ```

   It matches no current permission rule. Expect the parent's unmatched-command
   confirmation and approve it. Do not substitute destructive or remote commands.
4. Spawn a fresh, bash-capable configured child and request the exact same
   command. Inspect actual successful bash output (`permission-scope-check`),
   not merely a claim of success. Expect no confirmation/headless block from
   this extension; unrelated tool restrictions or extension vetoes can still
   prevent execution.
5. As a rollback control, remove only `permission` from that type's exclusions,
   preserve its extension inclusion and other settings, restart, and spawn a
   fresh child. With permission discoverable/included and the same startup
   conditions, expect `No permission rule matches command - no UI for
   confirmation`. Restore the exclusion and repeat with another fresh child
   if continuing the rollout. If the parent never prompts, the rollback child
   still succeeds, or bash is unavailable, the test is inconclusive: investigate
   effective configuration and name matching before relying on exclusion.

To roll back permanently, remove only `permission` from every affected type's
exclusions, preserving other settings, and restart with fresh children. Existing
child sessions retain their bound extension set; editing frontmatter or resetting
the parent does not retrofit them. Restored children return to their own ordinary
local/headless permission policy, not inherited parent approvals or YOLO.

## Ollama Usage Extension

Shows Ollama Cloud session and weekly usage in the pi status bar as `ollama: 2.6% / 0.8%` (session / weekly).

- Polls ollama.com's undocumented `GET /api/usage` endpoint (the one backing the ollama.com dashboard). It may change or disappear without notice.
- Refreshes whenever an ollama-cloud model is selected — `/model`, Ctrl+P cycling, and session restore — and via `/ollama-usage-refresh`.
- Switching to a non-ollama-cloud model clears the slot.
- Reuses pi's resolved ollama-cloud provider key, so no separate configuration is needed beyond the existing ollama-cloud entry in `models.json`.
- Failure paths are non-throwing: a failed fetch renders the dim placeholder `ollama: ? / ?`, and a missing provider key silently clears the slot.

## OpenSpec grooming flow

[`flows/openspec-groom/index.ts`](./flows/openspec-groom/index.ts) grooms an **existing active local** change. From this checkout (after `npm install`):

```bash
acpx flow run ./flows/openspec-groom/index.ts --input-json '{"changeId":"example-change"}'
```

From another local workspace, pass the absolute flow path. Only `changeId` is accepted; archived, missing, store-backed, symlinked, and escaping targets are rejected before edits. OpenSpec must provide `list` and `status --json` with schema-resolved `existingOutputPaths`. The flow runs targeted `openspec validate <id> --type change --strict --json --no-interactive` before review and after each update. Invalid artifacts enter repair; command/JSON failures terminate without retries. Repairs can revise only existing schema planning artifacts, never create missing ones.

### Prerequisites and skill discovery

Requires acpx **0.19.4**, OpenSpec, authenticated Pi, and a working `pi-acp` adapter. Configure acpx's `pi` profile (not just its default agent) in `~/.acpx/config.json`, for example `{"agents":{"pi":{"argv":["pi-acp"]}}}`. Every agent/decision invocation uses an isolated new Pi session, including repeated graph visits. Agent timeouts remain acpx defaults; do not set a global timeout shorter than the intended steering wait.

Pi ACP passes prompts to Pi's RPC skill expansion. Review uses `/skill:openspec-review <id>` with **only the change ID** as run-specific input. Updates instead receive a standalone flow-owned prompt from [`flows/openspec-groom/helpers.ts`](./flows/openspec-groom/helpers.ts), with current-cycle assessed structural/Critical resolutions, complete steering, and the resolved existing-artifact allowlist. It authorizes those planning repairs together without per-artifact confirmations, never invokes the built-in update skill, and stops on invalid scope, missing artifacts, or newly discovered consequential decisions. The generated `openspec-update-change` skill remains unchanged; ordinary invocations still require confirmation for every artifact revision.

Ensure the review skill is discovered. To avoid a same-named global/package skill shadowing it, optionally pin only the review skill in the Pi process used by the adapter. For example create an executable wrapper outside the target change, substituting absolute paths:

```sh
#!/bin/sh
exec /absolute/path/to/pi --no-skills \
  --skill /absolute/path/to/agent-mod/skills/openspec-review/SKILL.md "$@"
```

Set `PI_ACP_PI_COMMAND=/absolute/path/to/wrapper` when running the flow (supported by pi-acp 0.0.34). Verify Pi's loaded-skill diagnostics with that wrapper before use. Without a wrapper, ensure the review skill is trusted/discovered and no same-named skill wins discovery. No update-skill discovery or pinning is required. Model-free tests exercise native review-skill expansion, direct updater prompt passthrough with complete multiline authorization, and unchanged ordinary update confirmations. Fake-agent tests additionally check flow routing and fresh sessions; neither test suite proves a live model will obey the policy.

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

## OpenSpec implementation flow

[`flows/openspec-implement/index.ts`](./flows/openspec-implement/index.ts) implements an approved **active repo-local** change:

```bash
acpx flow run ./flows/openspec-implement/index.ts --input-json '{"changeId":"example-change"}'
```

From another workspace use the absolute entrypoint path. Only `changeId` is accepted; invalid, archived, missing, store-backed, symlinked and escaping targets are rejected before implementation. Use the same acpx/Pi/adapter prerequisites and explicit `pi` profile described above, with the `openspec-apply-change` skill discovered in the adapter's Pi process. Every apply, repair, assessment and decision invocation gets a fresh isolated session at the selected workspace. This is session isolation, not filesystem isolation.

```mermaid
flowchart TD
    Start[Validate local changeId] --> Apply[Initial apply and gates]
    Apply --> Snapshot[Refresh apply task snapshot]
    Snapshot --> Judge{Task-and-gate judge}
    Judge -->|completed| Success[Success]
    Judge -->|repairable_pause or escalation_required| Budget{Ten repairs used?}
    Budget -->|yes| Limit[limit_reached]
    Budget -->|no, repairable| Repair[Repair and gates]
    Budget -->|no, consequential| Steering[Human steering]
    Steering -->|complete scoped answers| Repair
    Steering -->|cancelled or unavailable| Stop[Unsuccessful exit]
    Repair --> Snapshot
```

### Implementer contract

Apply and repair explicitly select the change, read current status/apply instructions and every context file, preserve CLI-controlled blocked/ready/all-done state, and honor project context and compatible guidance. A blocked state is not permission to create missing planning artifacts. The implementer attempts all remaining tasks. Multiple substantive groups are delegated with task identities, scoped ownership and dependencies; only independent groups run concurrently. A trivial single substantive group need not delegate. The parent owns checklist consolidation, marks completed work promptly, waits for all delegates, and runs final applicable gates after consolidation.

The implementer returns a JSON report with `summary`, `completedTasks`, `remainingTasks`, `blockers`, `gates`, `noApplicableGates`, and `delegatedGroups`. Each blocker includes unique `id`, `issue`, `recommendation`, boolean `escalation`, and requested authorization `scope`. Each gate includes its concrete `command`, integer `exitCode`, boolean `afterEdits`, and numeric `attempt` (initial apply is 0). `delegatedGroups` records task IDs, ownership and results. Empty arrays are allowed; `noApplicableGates` is normally null and otherwise must explain why the current edit scope has no applicable project gates.

Success requires a refreshed task snapshot showing every task complete, no remaining work/blockers, and applicable current gates passing **after the last relevant edit** on the current attempt. Initially complete checkboxes still require gates. Repairs can correct code and rerun gates even if checkboxes already read done. Missing, stale or failing evidence cannot support completion; malformed reports fail rather than authorize unsafe steering. The read-only three-choice judge uses the snapshot, report, current project instructions and scope to assess gate applicability. Deterministic checks reject unsupported completion claims. Reported evidence is not independent execution proof: success means **task-and-gate completion only**, not an independent implementation verification review or readiness to archive. The flow does not invoke the verify skill.

### Repairs, authority and exits

An initial apply does not consume the budget. Up to **ten repair dispatches** are allowed, including failed dispatches. Each normal return refreshes tasks and is judged, including repair ten: it may succeed; either pause category after that exits `limit_reached`, without collecting more steering or dispatching repair eleven. Normal test failures/blocker reports are judge inputs. Invocation errors, timeouts, command failures and unusable decision results terminate without silent invocation retries.

Repairs within approved design can proceed autonomously. Ambiguity, design changes, destructive actions and missing external access require human guidance; mixed blockers escalate before any further repair. The outer flow owns interaction: inner agents return pauses rather than waiting for a human. Validated issues show recommendations and requested scope. Scoped answers accumulate with their associated issues across fresh repair sessions. Plan edits require an answer explicitly authorizing those plan edits; consent never expands to unrelated/destructive actions or access. stdin and stderr must be TTYs for steering; the shared seven-day deadline and cancellation rules apply. No terminal/EOF returns `needs_human`; cancellation returns `cancelled`; malformed steering and timeout return `failed`.

Tool permissions remain separate: flow prompts do not approve tools, bypass deny rules or enable YOLO, and are not an OS sandbox. Apply and repair invocations use 90-minute timeouts; assessment and judge invocations retain acpx defaults. Do not set a global timeout shorter than the desired steering wait. Provider retry settings are separately controlled by Pi.

Terminal results contain `changeId`, `outcome`, `repairAttempts`, `summary`, and `remaining` tasks/blockers, plus a concise stderr line. Only `success` exits zero; `limit_reached`, `needs_human`, `cancelled`, and `failed` deliberately exit nonzero after reporting. acpx retains transcripts/run history; no additional report files, automatic commits, stashes, archive, rollback or resume are performed. Existing working-tree edits are preserved even on failure. An explicit restart uses the current tree and a fresh zero-repair budget, not a prior-run checkpoint.

## OpenSpec verification flow

[`flows/openspec-verify/index.ts`](./flows/openspec-verify/index.ts) independently verifies an explicitly selected, **completed active repo-local** change and performs bounded repairs:

```bash
acpx flow run ./flows/openspec-verify/index.ts --input-json '{"changeId":"example-change"}'
```

From another local workspace, use the absolute entrypoint path. Only `changeId` is accepted; archived, missing, store-backed, symlinked and escaping targets are rejected. The initial refreshed OpenSpec apply snapshot must be unblocked with usable tasks and every task complete; incomplete-entry diagnostics direct the caller to `openspec-implement`, not to verifier repair. Requires the same acpx **0.19.4**, OpenSpec, authenticated Pi and `pi-acp` prerequisites and explicit acpx `pi` profile described above.

### Native verification skill and isolation

The verifier invokes the existing [`openspec-verify-change`](./.pi/skills/openspec-verify-change/SKILL.md) skill through Pi's native `/skill:openspec-verify-change <id>` expansion, followed by flow-owned read-only policy and current context. The generated skill itself is unchanged, including its ordinary warning-tolerant archive wording; the flow applies its own stricter acceptance contract. Pin this checkout's skill in the adapter's Pi process so a same-named global/package skill cannot shadow it. Create an executable wrapper outside the target change, substituting absolute paths:

```sh
#!/bin/sh
exec /absolute/path/to/pi --no-skills \
  --skill /absolute/path/to/agent-mod/.pi/skills/openspec-verify-change/SKILL.md "$@"
```

Set `PI_ACP_PI_COMMAND=/absolute/path/to/wrapper` when running the flow (supported by pi-acp 0.0.34), and inspect the wrapper's loaded-skill diagnostics before use. `--no-skills` excludes default discovery while the explicit absolute `--skill` loads the intended file even in another workspace. No apply/update skill is needed for the flow-owned repair prompt. Model-free native-expansion tests in [`flows/openspec-verify/skill-expansion.test.ts`](./flows/openspec-verify/skill-expansion.test.ts) exercise the absolute pin against a same-name global collision and preserve the full flow policy/context and ordinary skill behavior; they do not prove model obedience.

Every verifier, classifier, assessor and repair invocation gets a **fresh session** in the selected workspace, including repeated cycles. Verifier, classifier and assessor are read-only; only the scoped repair agent may edit. Read-only policy and repair authorization are **prompt-level constraints, not OS isolation**. Tool permissions are separate: configure acpx/adapter and Pi permissions explicitly; these prompts do not approve tools, bypass deny rules or enable YOLO. Use separate filesystem/process isolation if required. Verifier and repair invocations use 90-minute timeouts; classifier and assessor invocations retain acpx defaults. Do not impose a global timeout shorter than the intended steering wait. Pi provider retry settings are separately controlled.

### Acceptance, repairs and outcomes

Success requires a **conclusive verification with no Critical or Warning findings and no missing verification evidence**, plus a refreshed completed task snapshot. Suggestions are allowed and do not trigger repairs. Genuinely schema/scope-inapplicable checks need explicit justification; required checks cannot be skipped or waived by steering. An archive-ready label, complete checkboxes alone or absence of an explicit issue list cannot substitute for current applicable gate and verification evidence. Unusable/inconclusive verification or classification fails rather than silently accepting the change.

The read-only classifier is a constrained decision node choosing `accepted`, `blocking` or `inconclusive`; deterministic guards reject unsupported acceptance. It does not plan repairs. A separate read-only ACP assessor prepares validated resolutions covering every current Critical/Warning finding, with finding IDs, repository paths, recommendations, intended scope and escalation reasons. Repairs within the approved design may proceed autonomously; ambiguous requirements, design changes, destructive actions and missing external access require scoped human steering. **All consequential issues in a mixed batch must receive steering before any repair is dispatched**, including the autonomous fixes in that batch. The outer flow owns interaction; inner agents return issues instead of waiting for user input. Planning edits need explicit scoped authorization, and answers never authorize unrelated/destructive actions or external access. stdin and stderr must be TTYs; the shared seven-day steering deadline and cancellation rules apply. No terminal/EOF yields `needs_human`; cancellation yields `cancelled`; timeout or malformed steering yields `failed`.

There are at most **ten repair dispatches**, including failed dispatches. Invocation failures terminate without silent flow retries and may leave partial edits. After every normally returned repair, tasks are refreshed and a fresh verifier/classifier runs, **including repair ten**: convergence can still succeed, but unresolved findings then yield `limit_reached` without repair eleven or more steering.

The flow emits one structured terminal result containing `changeId`, `outcome`, `repairAttempts`, `summary`, `remaining` findings and the full verification `report`, plus a concise stderr summary. Outcomes are `success`, `limit_reached`, `needs_human`, `cancelled` and `failed` (including invalid/incomplete targets, malformed output, inconclusive evidence and agent/command errors). **Only `success` exits zero**; other outcomes report their result and deliberately fail so acpx exits nonzero. Orderly acpx interruption (SIGINT) is observed on the active phase's abort signal: it emits `cancelled` once and includes an interrupted repair in the dispatch count, even when the runner bypasses graph routing. Forced process termination can prevent output; acpx retains run history/transcripts under `~/.acpx/flows/runs/`.

Existing dirty edits are the starting state and are preserved, including on failure. The flow never syncs specs, archives, commits, stashes or rolls back, and writes **no extra report file**. There is no resume/checkpoint support; an explicit restart uses the current working tree and a fresh repair budget. Verification success is not an automatic archive action.

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