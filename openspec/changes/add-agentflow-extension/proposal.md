## Why

Pi sessions are single-course conversations. There is no way to run a *repeatable, multi-step workflow* — a sequence of isolated sub-agents, each with its own model, tools, and system prompt, orchestrated by a script — and still have the result come back to the main session. The SDK exposes `createAgentSession()` for spawning isolated sub-sessions, but there is no ergonomic, scriptable layer on top of it. AgentFlow closes that gap: an imperative TS/JS script-"flow" drives sub-agents, and the user invokes it with `/af:<name>`.

## What Changes

- Add a new **AgentFlow extension** (`extensions/agentflow/`) to the agent-mod package.
- Add the `/af:<name>` command family that discovers and executes a flow script from `.pi/agentflow/<name>.ts` (project, trusted) or `~/.pi/agentflow/<name>.ts` (global).
- Introduce an injected global `af` object as the sole scripting surface: `af.createAgent(config)`, `af.log(...)`, `af.result(value)`, `af.cwd`.
- Add a flow-agent handle (`sendPrompt`/`sendSteer`/`sendFollowUp`, `result`, `sessionFile`, `abort`, `dispose`) wrapping a single `createAgentSession()` sub-session.
- Run the whole flow as a **blocking, full-screen orchestrator** via `ctx.ui.custom()`: a live FleetView of `main` + each running flow-agent with tap-in (view live conversation, steer, stop) and streamed `af.log` progress.
- Deliver `af.result(value)` back to the main session as a custom message the orchestrating LLM can see.
- Make **TypeScript first-class**: ship `agentflow.d.ts` type declarations, load `.ts` via jiti, and give scripts genuine `tsc` type-checking. `.js` remains supported (syntax-validated only).
- Gate script execution on project trust; always run syntax validation before execution.
- Ship a **package skill** (read by the main-session LLM to author flows) and a starter `reviewcode.ts` example.

## Capabilities

### New Capabilities
- `agentflow-runtime`: script discovery, loading (TS via jiti), execution, the `af` injected API surface, flow-agent lifecycle, result delivery to the main session, and trust-gating.
- `agentflow-orchestrator-ui`: the blocking modal `ctx.ui.custom()` Orchestrator — live FleetView of main + running flow-agents, streamed `af.log`, and tap-in (view live conversation, steer, stop).
- `agentflow-authoring`: type safety (`agentflow.d.ts` + `.ts` first-class + load-time validation), the package skill for on-the-fly authoring, and the example script.

### Modified Capabilities
- *None — no existing specs.*

## Impact

- **New code**: `extensions/agentflow/` (entry `index.ts`, `agentflow.d.ts`, authoring skill, `reviewcode.ts` example, supporting modules).
- **Dependency**: adds `jiti` (TS loading) to the package's runtime dependencies.
- **Package wiring**: `package.json` `pi.extensions` picks up the new extension directory; `tsconfig.json` includes the new `.ts` files.
- **Docs**: `README.md` extension table and contents list updated.
- **No breaking changes**: existing extensions (`permission`, `tps`, `crof`) and prompts are untouched.