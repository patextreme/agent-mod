# Design — AgentFlow Extension

## Context

See proposal.md for the motivation. The pi SDK exposes `createAgentSession()` for spawning isolated sub-agent sessions (model, tools, cwd, system prompt, persistence all overridable), and `ctx.ui.custom()` for modal full-screen UI with keyboard capture. The reference `@tintinweb/pi-subagents` package already proves the FleetView + live conversation viewer pattern. This design covers how AgentFlow composes those primitives into a scripted orchestration layer.

## Goals / Non-Goals

**Goals**
- Scriptable orchestration of isolated sub-agents via an imperative TS/JS flow.
- Blocking, observable UX: the whole run is a live, navigable full-screen orchestrator.
- Type-safe authoring (`.ts` first-class) with a skill so the main LLM can author flows on the fly.

**Non-Goals**
- Background/detached runs with completion notifications (deferred).
- Dry-run mode with stubbed sub-agents (deferred).
- Script imports of arbitrary modules (scripts are self-contained, `af`-only).
- Arbitrary-path execution via `/af:run <path>` (scripts must live in `.pi/agentflow/` or `~/.pi/agentflow/`).

## Decisions

### D1: One flow-agent handle wraps one `createAgentSession` sub-session
A flow-agent is a thin wrapper over a single sub-session. `sendPrompt` awaits `session.prompt(...)`, so sequential prompts share the sub-agent conversation (Task B sees Task A's context). Parallelism is natural JS (`Promise.all` over multiple handles).
- **Alternatives considered:** a fresh sub-agent per prompt (rejected — loses conversational context between steps; the user explicitly wants shared context).

### D2: Injected `af` global, not imports
The script is wrapped in an `AsyncFunction` with `af` injected as a parameter. Scripts have no other imports or injected globals.
- **Alternatives considered:** real module imports (rejected — worse authoring ergonomics, muddies packaging, and undercuts the "LLM authors a file" loop).

### D3: Blocking, full-screen modal Orchestrator
The whole run is wrapped in `ctx.ui.custom()`. The command handler doesn't resolve until the flow completes. `setWidget` alone can't capture keys, so tap-in requires the modal path.
- **Alternatives considered:** detached background run with a below-editor FleetView (rejected — breaks the blocking model the user chose; two code paths instead of one).

### D4: TypeScript first-class via jiti
`.ts` scripts load through jiti (already a pi dependency for extension loading); `agentflow.d.ts` declares the `af` surface; `tsc --noEmit` gives genuine type-checking. `.js` stays supported (syntax-validated only).
- **Alternatives considered:** `new Function` only (rejected — no scope for type safety); a full bundler (overkill; jiti is already present).

### D5: Result delivery as a custom message
`af.result(value)` → the extension calls `pi.sendMessage({ customType: "agentflow", content, display: true })` so the result is in the transcript and visible to the orchestrating LLM. `af.log` lines go to the Orchestrator UI only (not the LLM context).
- **Alternatives considered:** implicit script return value (rejected — explicit `af.result` is clearer); `af.log` to the LLM context (rejected — pollutes the main session context).

### D6: Trust-gated, project+global discovery
Project `.pi/agentflow/` (trusted) then global `~/.pi/agentflow/`, `.ts` before `.js`. Gated on `ctx.isProjectTrusted()`.

## Risks / Trade-offs

- **[Modal run blocks the main session]** → By design (blocking foreground); the user watches and taps into agents. The Orchestrator is skippable in non-TUI modes.
- **[Executing user-authored JS is a code-execution vector]** → Gated on project trust; scripts restricted to `.pi/agentflow/` (trust-gated by pi) and global `~/.pi/agentflow/`; syntax/type validation before execution.
- **[jiti as a runtime dependency]** → Adds a dependency to the package; mitigated by jiti already being a pi dependency, so it's low marginal cost.
- **[Stub-free validation means a bad script can throw mid-run]** → Load-time syntax + type validation catches structure errors up front; runtime errors surface through the Orchestrator with the failing step.

## Migration Plan

Greenfield addition — no migration. New extension directory under the existing `extensions/` layout; package wiring via `package.json` `pi.extensions` and `tsconfig.json`. Rollback is removing the extension directory and its package wiring.

## Open Questions

- None that change the specs or approach.