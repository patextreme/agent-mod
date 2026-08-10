## Why

The orchestrating LLM authors AgentFlow flow scripts (`.ts` in `.pi/agentflow/`), but the only way it learns a script is broken is by *running* it — `/af` runs syntax + type validation just before spawning sub-agents, so an authoring mistake surfaces as a failed run rather than during editing. The LLM needs a way to validate a flow script *on demand, while authoring*, before it is ever executed.

## What Changes

- Add an **`agentflow_validate` tool** (registered via `pi.registerTool`, always-on) that the main-session LLM can call to validate a flow script by name/path and get a structured report back as normal tool content.
- Add a **`/af-validate <name>` slash command** (no trust gate, `notify`-based output) so a human can pre-check a flow script the same way.
- Introduce a shared **`validateFlowFile()`** module that reuses the existing discovery checks — resolvability, syntax (jiti), and type-check against `agentflow.d.ts` — and returns a structured report (`ok` + `errors` with `message`/`line`/`col`).
- **Do not throw** on an invalid script: an invalid script is reported as normal content (the error list), not as a tool failure.
- Update the **agentflow authoring skill**, the **`agentflow-authoring` spec**, and the **README** to document `agentflow_validate` as the authoring-time validation mechanism.
- Add unit tests for `validateFlowFile` (valid / syntax-error / type-error).

## Capabilities

### New Capabilities
- `agentflow-validation`: on-demand validation of a flow script by name/path — the `agentflow_validate` tool, the `/af-validate` command, and the shared `validateFlowFile()` report.

### Modified Capabilities
- `agentflow-authoring`: the authoring skill requirement changes so the shipped skill documents `agentflow_validate` as the primary authoring-time check (replacing the manual `tsc --noEmit` instruction).

## Impact

- **New code**: `extensions/agentflow/validate.ts` (shared `validateFlowFile()` + report type).
- **Modified code**: `extensions/agentflow/index.ts` (register `agentflow_validate` tool + `/af-validate` command); `extensions/agentflow/skills/agentflow/SKILL.md` (validation workflow section); `README.md`.
- **Specs**: new delta `openspec/changes/agentflow-validate-script/specs/agentflow-validation/spec.md` and `specs/agentflow-authoring/spec.md`.
- **Tests**: new `extensions/agentflow/validate.test.ts`.
- **No breaking changes**: existing `/af` run path, `submit_result`, and the low-level `discovery.ts` functions are untouched. No new dependencies.