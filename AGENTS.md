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

- `extensions/` — Pi extensions (TS). `permission.ts` is a single-file extension; `chain/` is a package-with-dependencies extension
- `prompts/` — Pi prompt templates (Markdown + YAML frontmatter). Naming convention: `category-name.md`
- `.pi/chains/` — Chain definitions (JSON or YAML). Each file defines a `chain-<name>` command
- `nix/` — Flake devshell config

`package.json` `"pi"` field declares which directories contain extensions and prompts. The chain extension has its own `package.json` (with `pi.extensions` manifest and `zod` dependency). `tsconfig.json` includes `extensions/**/*.ts` — this glob covers both `extensions/permission.ts` and `extensions/chain/src/*.ts`.

`.pi/settings.json` is gitignored and controls what pi loads locally (prevents auto-discovery from loading project extensions/prompts unconditionally).

## Key Conventions

- **Biome** for formatting and linting — configured via `biome.json` (2-space indentation)
- **No build step** — `tsc --noEmit` only type-checks, no output
- **Extensions** export a default function `(pi: ExtensionAPI) => void` and use `pi.on("tool_call", ...)` to intercept
- **Prompts** use `---` YAML frontmatter with a `description` field; `$ARGUMENTS` placeholder for user input
- **Permission extension**: rules processed in **reverse order** (later patterns override earlier ones). Actions: `allow`, `ask`, `deny`
- **Permission extension**: when `PI_SANDBOX=true`, unmatched commands are allowed instead of prompting the user
- **Chain extension**: package-with-dependencies style (`extensions/chain/`). Owns its `zod` dependency in its own `package.json`. Chain definitions live in `.pi/chains/` as `.json`, `.yaml`, or `.yml` files — add or modify chains without editing source code

## Chain Definitions

Chains are defined as JSON or YAML files in `.pi/chains/`. The filename stem (minus extension) becomes the command name: `chain-<name>`.

**JSON schema:**

```json
{
  "description": "Human-readable description shown in command list",
  "loop": 3,
  "steps": [
    {
      "prompt": "Instruction sent to the agent. Use $ARGUMENTS for user input."
    },
    {
      "type": "exitPrompt",
      "exitPrompt": "Description of when to stop looping"
    },
    {
      "prompt": "Follow-up instruction after exit check passes."
    }
  ],
  "handoffTarget": "next-chain",
  "handoffExitPrompt": "Condition to skip handoff"
}
```

**YAML equivalent:**

```yaml
description: Human-readable description shown in command list
loop: 3
steps:
  - prompt: Instruction sent to the agent. Use $ARGUMENTS for user input.
  - type: exitPrompt
    exitPrompt: Description of when to stop looping
  - prompt: Follow-up instruction after exit check passes.
handoffTarget: next-chain
handoffExitPrompt: Condition to skip handoff
```

**Fields:**
- `description` (required, string) — shown as the command description
- `loop` (optional, positive integer) — how many times to repeat the step sequence. Defaults to 1
- `steps` (required, non-empty array) — ordered list of steps in the chain. Each step is one of two types:
  - **Prompt step** (default): has a `prompt` field. When `type` is omitted, the step is treated as a prompt step.
    - `type` (optional, string) — must be `"prompt"` or omitted
    - `prompt` (required, string) — the message sent to the agent. `$ARGUMENTS` is replaced with the user's command arguments
  - **Exit prompt step**: evaluates whether the chain should terminate.
    - `type` (required, string) — must be `"exitPrompt"`
    - `exitPrompt` (required, string) — the condition description sent to the agent for evaluation. `$ARGUMENTS` is replaced with the user's command arguments. The agent is instructed to call `chain_exit` if the condition is met.
- `handoffTarget` (optional, string) — name of the target chain to hand off to after completing all steps/loops. If absent, the chain stops normally. The target must match an existing chain filename stem.
- `handoffExitPrompt` (optional, string) — condition to skip handoff. Requires `handoffTarget` to be present. Evaluated after chain completion; if the agent calls `chain_exit`, the handoff is skipped. `$ARGUMENTS` is replaced with the user's command arguments.

A step must have either `prompt` or `exitPrompt`, never both and never neither. Steps with both fields or neither field are rejected by schema validation with a descriptive error.

**Handoff:**

When a chain completes all its steps/loops, it can optionally hand off execution to another chain. This enables workflows that span multiple prompt chains (e.g. execute → verify → finalize).

`handoffTarget` specifies the name of the next chain. `handoffExitPrompt` optionally guards the handoff with a condition — if the condition evaluates as true (the agent calls `chain_exit`), the handoff is skipped and the workflow stops.

**Decision matrix:**

| `handoffTarget` | `handoffExitPrompt` | Behavior |
|---|---|---|
| absent | absent | Chain stops normally (default) |
| present | absent | Always hand off (unconditional) |
| present | present | Evaluate condition — exit skips handoff, no-exit hands off |
| absent | present | **Invalid** — schema rejects this combination |

**Decoupling from step-level `exitPrompt`:** Step-level `exitPrompt` only breaks the loop — it never prevents handoff. After the loop exits (whether via `exitPrompt` or natural completion), the handoff check runs independently. `handoffExitPrompt` is evaluated at the handoff boundary to conditionally skip the handoff.

**`chain_exit` interaction:** Both step-level `exitPrompt` and `handoffExitPrompt` use the same `chain_exit` tool. Step-level `exitPrompt` calls to `chain_exit` break the loop. `handoffExitPrompt` calls to `chain_exit` skip the handoff and stop the workflow.

**Context reset between chains:** The target chain starts with fresh conversation context. `$ARGUMENTS` is passed through to the handoff target unchanged.

**Cycles:** Cycles are intentionally allowed — `handoffExitPrompt` / `chain_exit` provide the termination mechanism. Chain authors are responsible for ensuring termination. User abort is the safety net for runaway chains.

**Status messages:** During execution, status shows the chain name: `chain: <name> <stepIdx>/<total> step <loopIdx>/<loopN> loop`. During handoff transition: `chain: <source> → <target>`.

**Example — Unconditional handoff:**

```yaml
# .pi/chains/backlog-execute.yaml
description: Execute backlog task
steps:
  - prompt: Start working on $ARGUMENTS. Research what needs to be done and propose a plan.
  - prompt: Go ahead
handoffTarget: backlog-verify
```

**Example — Conditional handoff:**

```yaml
# .pi/chains/smart-fix.yaml
description: Analyze and optionally fix
steps:
  - prompt: Analyze the problem described in $ARGUMENTS.
  - type: exitPrompt
    exitPrompt: The analysis is complete
  - prompt: Apply the fix.
handoffTarget: verify-fix
handoffExitPrompt: No code changes were needed for this problem
```

This reads: Run the analyze-fix loop. After all steps complete, evaluate `handoffExitPrompt`. If no code changes were needed → `chain_exit` called → workflow aborts, no handoff. Otherwise → hand off to `verify-fix`.

**Example — Multi-chain workflow:**

```yaml
# .pi/chains/backlog-execute.yaml
description: Execute backlog task
steps:
  - prompt: Start working on $ARGUMENTS. Research what needs to be done and propose a plan.
  - prompt: Go ahead
handoffTarget: backlog-verify
```

```yaml
# .pi/chains/backlog-verify.yaml
description: Review the codebase to see if it aligns with the task definition
loop: 20
steps:
  - prompt: Review the codebase for task $ARGUMENTS.
  - type: exitPrompt
    exitPrompt: There are no issues with severity >= 5
  - prompt: Fix the most severe remaining issue (severity >= 5).
handoffTarget: backlog-finalize
```

```yaml
# .pi/chains/backlog-finalize.yaml
description: Review the task record to see if it is properly finalized
loop: 20
steps:
  - prompt: Review the task record for $ARGUMENTS and check finalization.
  - type: exitPrompt
    exitPrompt: There are no issues with severity >= 5
  - prompt: Fix the most severe remaining finalization issue (severity >= 5).
```

Note: `backlog-verify` uses step-level `exitPrompt` to break the loop early, but has **no** `handoffExitPrompt` — so it always hands off to `backlog-finalize`. The step-level exit is purely a loop optimization, not a handoff gate. `backlog-finalize` has no `handoffTarget` — it is the terminal chain.

**Supported formats:** `.json`, `.yaml`, `.yml`

**Same-stem priority:** when multiple files share the same stem (e.g. `greeting.json` and `greeting.yaml`), the highest-priority file wins: `.yaml` > `.yml` > `.json`. A warning is emitted for any shadowed file.

**Adding a new chain:** create a `.json`, `.yaml`, or `.yml` file in `.pi/chains/` following the schema above. The chain becomes available as `/chain-<filename>` on next extension load. No source code changes needed.

**Malformed files** are skipped — each validation failure produces a descriptive warning identifying the field path, expected constraint, and received value. The extension and other chains continue working normally. On session start/reload, if any chain files have validation errors, the first warning is surfaced in the status bar.

Unknown fields (e.g. typos like `descritpion`) are rejected — only the documented fields are permitted.
