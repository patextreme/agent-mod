# Agent Mod

Extensions, prompt templates, and skills for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Pi is a terminal coding agent. This package augments it with:

- **Guardrails** — a permission extension that intercepts shell commands and asks before running anything destructive (`git push`, `git rebase`, unknown `gh` calls, …), while auto-allowing safe read-only commands.
- **Usage visibility** — an ollama-usage extension that shows Ollama Cloud session and weekly usage in the status bar.
- **Factory skills** — explicit OpenSpec stages, single-issue PR delivery, review/repair, and human-confirmed cleanup; see the [toolkit prerequisites](#factory-skill-toolkit).

Extensions ship as Nix flake outputs, while prompt templates and skills install through `pi install`.

## Requirements

- Pi `^1.0.4` (declared as a peer dependency in [`package.json`](./package.json)).

## Installation

```bash
pi install git:github.com/patextreme/agent-mod
```

This registers the prompt templates and skills declared in [`package.json`](./package.json). The extensions are not part of the `pi install` package; build them from the flake outputs instead (see [Nix Packages](#nix-packages)).

## Nix Packages

Extensions are distributed as flake outputs rather than through `pi install`:

```bash
nix build .#pi-permission
nix build .#pi-ollama-usage
nix build .#pi-codex-alias
```

Each output is a directory containing the extension, ready to load with Pi's
extension path option.

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

These ship only as Nix flake outputs (`pi-permission`, `pi-ollama-usage`, `pi-codex-alias`) and are not installed by `pi install`.

| Extension | Description |
|-----------|-------------|
| [Permission](./extensions/permission/index.ts) | Intercepts `bash` tool calls and applies regex-based permission rules; plays a bell on prompts and when the agent finishes; opt-in session-scoped `/permission-yolo` full bypass |
| [Ollama Usage](./extensions/ollama-usage/index.ts) | Shows Ollama Cloud session/weekly usage in the status bar; refreshes on ollama-cloud model selection and via `/ollama-usage-refresh` |
| [Codex Alias](./extensions/codex-alias/index.ts) | Registers `openai-codex-secondary` as an independently authenticated alias of the built-in `openai-codex` provider, so two Codex accounts can share one agent directory |

### Prompt Templates

| Prompt | Description |
|--------|-------------|
| [`init`](./prompts/init.md) | Create or update `AGENTS.md` for a repository |

### Skills

| Skill | Description |
|-------|-------------|
| [`openspec-review`](./skills/openspec-review/SKILL.md) | Review an OpenSpec change for semantic soundness before implementation |
| [`openspec-propose-issue`](./skills/openspec-propose-issue/SKILL.md) | Propose the OpenSpec change for a settled GitHub issue on its `issue-<n>` branch, then commit, push, and link it |
| [`orc-openspec-groom`](./skills/orc-openspec-groom/SKILL.md) | Delegate semantic review and Critical-only planning repairs |
| [`orc-openspec-implement`](./skills/orc-openspec-implement/SKILL.md) | Implement whole task groups sequentially with independent checks |
| [`orc-openspec-verify`](./skills/orc-openspec-verify/SKILL.md) | Verify and repair until Critical and Warning findings are clear |
| [`orc-pr-review-repair`](./skills/orc-pr-review-repair/SKILL.md) | Coordinate fresh two-axis PR review, history-aware judgment, repair, and publication |
| [`orc-issue-to-pr`](./skills/orc-issue-to-pr/SKILL.md) | Deliver one explicitly selected GitHub issue to a reviewed PR |
| [`cleanup-merged-issues`](./skills/cleanup-merged-issues/SKILL.md) | Preview and explicitly confirm cleanup of safely matched merged issue work |

## Factory skill toolkit

Installation exposes instructions and bundled references, not an orchestration runtime or credentials. These skills require an **enhanced Pi host**, except the human-only proposal and cleanup skills, which need only their listed CLIs; stock Pi alone is not sufficient. Read the selected skill and prepare its prerequisites before invocation, for example:

```text
/skill:openspec-propose-issue <issue-number>
/skill:orc-openspec-groom <existing-change>
/skill:orc-openspec-implement <existing-change>
/skill:orc-openspec-verify <existing-change>
/skill:orc-pr-review-repair <PR-number-or-URL>
/skill:orc-issue-to-pr <issue-number-or-URL>
/skill:cleanup-merged-issues
```

### Prerequisites and retained conventions

| Applies to | Operator-managed prerequisite / convention |
|------------|--------------------------------------------|
| Orchestrators | `Agent` and `codemode` in the main session with `general-purpose` workers. The main session executes downstream `orc-*` coordination and delegates worker stages; `code-review` workers need nested Agent access for their two review axes. |
| Implementation / composition | `SubagentWorkflow` in the main session for sequential whole task-group dispatch and repair; it is unavailable in child Agent sessions. Issue-to-PR executes downstream orchestration skills in the main session and runs their stage workflows sequentially, not inside an outer workflow. Follow the host's explicit workflow opt-in and depth rules; loading a skill does not bypass them. Pause if required tooling or worker delegation depth is unavailable. |
| OpenSpec stages / OpenSpec issue route | OpenSpec CLI, an existing selected change, and unambiguous repository/store context. Discover registered stores with `openspec store list --json` and retain `--store <id>` on applicable commands when using a store. |
| Issue OpenSpec proposal (human-only) | The external `openspec-propose` procedure, OpenSpec CLI, authenticated `gh` issue-write access, and commit signing/DCO. Runs before `orc-issue-to-pr` on the issue's `issue-<n>` worktree; human-only invocation (`disable-model-invocation: true`). |
| Skill dependencies | `openspec-review` is **packaged here**. Supply `openspec-apply-change`, `openspec-verify-change`, `openspec-archive-change`, `openspec-sync-specs`, and `code-review` externally where required; the OpenSpec issue route additionally requires the archive/sync pair for finalization. Generated OpenSpec procedures and code-review are not bundled. Resolve their actual available-skill locations and pass absolute paths plus repository/worktree/change/store context to delegates, including new worktrees. |
| PR review / delivery | Git and authenticated `gh` access to PRs, issues, paginated comments/history, checks, pushes, and required records; configure the issue tracker and access required by the external `code-review` procedure. Configure commit signing and DCO sign-off for delivery; do not weaken target-project signing policy. |
| Issue-to-PR | Establishes the run's base before provisioning — request-supplied, user-confirmed, or derived from existing worktree/PR state — and keeps it sticky for the run; worktree basename and branch `issue-<n>`, PR base `<base>`, and the **exact** `openspec` routing label (other labels select direct edits). Reuse only verified matching worktree/PR state. Signed/DCO commits and normal pushes, never force pushes. |
| Target-project policy | Project instructions and mandatory checks/delivery gates remain controlling. Re-establish head-bound gates on the final delivered/reviewed head, including a **current-head Claude gate only if the project requires it**. Incompatible conventions or missing access are blockers, not permission to relax policy. |
| Cleanup | Git/gh evidence and a verified repository/remote; cleanup does not assume `origin`. Human-only invocation (`disable-model-invocation: true`) plus explicit confirmation **after the preview**; invocation alone approves no deletion or pruning. |

Package installation does not install the external skills or guarantee their availability. Delivery is reusable only in repositories compatible with the retained conventions. PR review/repair and issue-to-PR invocation authorize their qualifying edits/publication (commits, normal pushes, and verified PR history comments), not merges or a tool-permission bypass; read-only delegation is not an OS sandbox.

### Stage and lifecycle boundaries

- **Groom:** fresh complete semantic review with zero **Critical** findings; Major/Minor findings, readiness blockers, or a NEEDS REVISION label can remain. Grooming neither performs structural validation nor establishes implementation readiness. The issue orchestrator separately validates structure and assesses readiness before implementation.
- **Implement:** sequential whole task groups with task-scoped repository access; independent actual-diff/check validation precedes serialized task bookkeeping. Technical failures are repaired autonomously and independently re-verified; recurring findings without progress pause for input. Completion needs implemented tasks, integrated required checks, and refreshed apply status, not worker summaries alone. This does not replace the separate verification stage.
- **Verify:** fresh complete verification with zero **Critical and Warning** findings and applicable required evidence; Suggestions are report-only, and skipped optional scope is disclosed. Groom/verify have no arbitrary round cap but pause on blockers or stalled progress.
- **PR review/repair:** fresh Standards and Spec axes followed by separate history-aware judgment. Only evidenced material findings drive repair; verified start reservations consume a cumulative **ten-attempt** budget across continuations. Delivery/check/history evidence must match the reviewed head. After OpenSpec finalization it receives the archived change location and relevant main specs as requirements evidence: in-scope repairs keep the change archived, behavior-changing repairs check code, archived artifacts, and main specs together and rerun affected validation before final-head acceptance, and new intent requires user authorization.
- **Issue-to-PR:** one explicitly selected issue, **no queue selection**. The OpenSpec route needs an existing unambiguous change; it does not create one. After accepted verification it finalizes the change inside the same run — synchronized main specs and the complete archived change artifacts are included in the delivered PR — and completion additionally requires confirmed finalization. **Merge, worktree removal, and cleanup are separate requests**; issue-to-PR never invokes cleanup automatically.
- **Cleanup:** preview only safely matched `issue-<n>` branches/worktrees with exact merged PR/head evidence; preserve dirty, divergent, or uncertain work. Snapshot-bound approval and rechecks precede guarded local removal and restricted stale remote-tracking-ref pruning. **No remote branch/tag deletion** or general filesystem cleanup; prune-only work also needs separate confirmation.

Frontmatter, bundled-reference, package-content, and isolated discovery checks provide **static distribution assurance only**, not live operational safety, model obedience, external-prerequisite availability, or stock-Pi runtime support. They do not execute delivery or deletion. These prompt contracts replace the retired deterministic acpx flows and do not inherit their policies or guarantees.

The toolkit ships the complete [MIT notice](./skills/LICENSE) covering all twelve imported files; the pinned source commit and author-confirmed redistribution grant remain recorded in the [archived migration design](./openspec/changes/archive/2026-10-07-migrate-factory-skills/design.md). Skill-based finalization lands in `orc-issue-to-pr` per [#49](https://github.com/patextreme/agent-mod/issues/49), superseding the standalone-finalizer approach tracked in [#47](https://github.com/patextreme/agent-mod/issues/47); no packaged full-lifecycle orchestrator is shipped ([#48](https://github.com/patextreme/agent-mod/issues/48) closed without delivery). The retired acpx flows were removed by the [`retire-acpx-flows`](./openspec/changes/archive/2026-10-07-retire-acpx-flows/) change.

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

- Polls ollama.com's undocumented `GET /api/balance` endpoint (the account balance behind the ollama.com dashboard) and shows the consumed fraction of the session and weekly limits. It may change or disappear without notice.
- Refreshes whenever an ollama-cloud model is selected — `/model`, Ctrl+P cycling, and session restore — and via `/ollama-usage-refresh`.
- Switching to a non-ollama-cloud model clears the slot.
- Reuses pi's resolved ollama-cloud provider key, so no separate configuration is needed beyond the existing ollama-cloud entry in `models.json`.
- Failure paths are non-throwing: a failed fetch renders the dim placeholder `ollama: ? / ?`, and a missing provider key silently clears the slot.

## Codex Alias Extension

Registers `openai-codex-secondary` — "OpenAI Codex — Secondary" — as an independently authenticated alias of Pi's built-in `openai-codex` provider, so two OpenAI Codex subscription accounts (personal and secondary) can be used from one Pi agent directory and selected through `/model` as `openai-codex/<model>` and `openai-codex-secondary/<model>`. This is manual account selection, not subscription pooling or rate-limit failover.

The extension reuses the built-in provider's OAuth login, token refresh, streaming implementation, and model catalog. Only the provider id, the display name, and the `auth.json` credential key differ; the built-in `openai-codex` provider is left unchanged.

**Setup:**
1. Load the extension (`pi -e <path-to-pi-codex-alias>` or through your Pi config).
2. `/login` → choose **OpenAI Codex (legacy)** for the personal account — the built-in provider's display name; its OAuth flow is labeled "OpenAI (ChatGPT Plus/Pro)".
3. `/login` → choose **OpenAI Codex — Secondary** for the secondary account. Sign out of ChatGPT in the browser first, or use a private window: the browser reuses the existing ChatGPT session, so otherwise both entries end up holding the same account.
4. Choose the account per model through `/model`.

Credentials are stored under separate `auth.json` keys (`openai-codex` and `openai-codex-secondary`), and refresh runs per provider id under Pi's credential lock, so refreshing or logging out of one account does not modify the other. The alias exposes OAuth only — it never falls back to an ambient `OPENAI_API_KEY`.

**Catalog inheritance.** The alias re-reads the built-in Codex catalog on every call, so it follows the models bundled with the running Pi. It does **not** inherit a `models.json` override keyed by `openai-codex`; override `openai-codex-secondary` separately if you need a per-account base URL or headers.

**Cross-provider sessions.** Pi's Responses converter keeps reasoning and tool-call ids intact only when provider, API, and model all match. `openai-codex-secondary` is not in Pi's Codex tool-call provider allowlist (`CODEX_TOOL_CALL_PROVIDERS` is `openai`, `openai-codex`, `opencode`), so switching accounts mid-conversation is treated like switching vendors: encrypted reasoning is replaced with plain text and tool-call ids are normalized consistently, keeping each `function_call` paired with its `function_call_output`. Staying on one provider preserves full fidelity. This is the documented low-risk behavior; a real request after a switch has not been sent.

**Supported Pi versions.** Requires a Pi that bundles the `openai-codex` provider with OAuth (`^0.99.1` in this repo). If the provider or its OAuth flow is unavailable, the extension fails fast with a clear error instead of registering a broken provider.

## Retired OpenSpec flows

The five acpx flow entrypoints — `openspec-groom`, `openspec-implement`, `openspec-verify`, `openspec-finalize` and `openspec-all` — plus the `acpx-flow` authoring skill were removed as a breaking change by the [`retire-acpx-flows`](./openspec/changes/archive/2026-10-07-retire-acpx-flows/) change. Use the migrated skill toolkit above instead; its stage skills define their own acceptance, repair and human-input contracts and do not preserve acpx's deterministic guards, budgets, structured CLI results or persisted run traces.

| Task | Use |
|------|-----|
| Propose an OpenSpec change for a settled issue | `/skill:openspec-propose-issue <issue-number>` |
| Groom an existing change | `/skill:orc-openspec-groom <existing-change>` |
| Implement an existing change | `/skill:orc-openspec-implement <existing-change>` |
| Verify an implemented change | `/skill:orc-openspec-verify <existing-change>` |
| Deliver one issue to a reviewed PR | `/skill:orc-issue-to-pr <issue-number-or-URL>` |
| Review or repair a PR | `/skill:orc-pr-review-repair <PR-number-or-URL>` |
| Clean up merged issue work | `/skill:cleanup-merged-issues` |

Finalization is skill-based: on the OpenSpec route, `orc-issue-to-pr` synchronizes main specs and archives the verified change through the built-in `openspec-archive-change` and `openspec-sync-specs` procedures per [#49](https://github.com/patextreme/agent-mod/issues/49), superseding the standalone-finalizer approach tracked by [#47](https://github.com/patextreme/agent-mod/issues/47) (closed as not planned). No packaged full-lifecycle orchestrator is shipped: pipeline tracking [#48](https://github.com/patextreme/agent-mod/issues/48) and its composition PR [#54](https://github.com/patextreme/agent-mod/pull/54) closed without delivering one, so invoke the stage skills explicitly. `orc-issue-to-pr` finalization is bound to single-issue delivery — it is not a general sync/archive pipeline, and ordinary external sync/archive skills remain separate requests rather than parity with the retired acpx finalizer.

This retirement removed only the flow runtime and its dependency. [`pi-acp`](./nix/packages/pi-acp/README.md) above remains the supported ACP integration, and historical acpx planning stays preserved under `openspec/changes/archive/`.

## Development

```bash
npm install            # install deps
npm run format         # biome format --write .
npm run lint           # biome lint .
npm run check          # biome check . (lint + format check combined)
npm run typecheck      # tsc --noEmit
npm test               # node tests/run.mjs (discovery-based gate runner)
npm run test:semantic  # materialize manual semantic-suite fixtures (never a gate)
nix flake check        # nix build checks (biome, tsc, node-tests, package builds)
```

Gate tests are discovered by convention — there are no registration lists to
update. The two placement rules: unit tests live beside their extension module
(`extensions/<name>/<name>.test.ts`), and ownerless repository contracts live
under `tests/gates/*.test.mjs`. A file at either recognized root runs in every
gate execution, locally and in the hermetic `node-tests` Nix check; a file
anywhere else does not run. Semantic suites under `tests/semantic/` never run
as gates: `test:semantic` only materializes fixtures for the manual procedure,
and run evidence stays in the operator workspace, never committed (see
[ADR-0001](./docs/adr/0001-semantic-evidence-stays-local.md)).

Requires `biome`, `node`, and `typescript` in PATH. Use `nix develop` (provides all tooling) or install globally.

Before committing changes that touch `package*.json` or `nix/`, also run `nix flake check` — it mirrors the JS checks and catches stale `npmDepsHash` values after dependency changes.

## License

MIT — see [LICENSE](./LICENSE). Imported factory skills and references bundle their own complete copy: [skills/LICENSE](./skills/LICENSE).
