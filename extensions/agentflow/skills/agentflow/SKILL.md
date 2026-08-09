---
name: agentflow
description: Author and modify AgentFlow orchestration scripts for pi. Use when the user wants to create, edit, or run a flow that spawns isolated sub-agents (e.g. reviewcode, multi-step workflows). Covers the injected `af` surface (createAgent, sendMessage, log, result, cwd), authoring conventions, the validation workflow, and the worked example.
---

# AgentFlow — Authoring Guide

AgentFlow turns an imperative TypeScript (or JavaScript) script into a repeatable
multi-step workflow. The script ("flow") spawns *isolated sub-agent sessions* via
the SDK, drives them step by step, and delivers a result back to the main session.

## How a flow is invoked

- Flows live at `.pi/agentflow/<name>.ts` (project) or `~/.pi/agentflow/<name>.ts`
  (global), with `.js` fallbacks.
- Invoke with `/af <name>` (e.g. `/af reviewcode`), or `/af:<name>` (e.g.
  `/af:reviewcode`) for any flow already on disk at session start.
- Project scripts only run when the project is **trusted**.
- The flow runs under a **blocking full-screen Orchestrator** (TUI) that shows the
  main session + every running sub-agent. In non-TUI modes it runs without the UI.

## The `af` surface

A flow gets exactly one injected global: `af`. It has no other imports or globals.

### `af.createAgent(config)` → `Promise<FlowAgent>`

Spawns an isolated sub-agent session. Config:

```ts
{
  name: "reviewer",           // required, shown in the Orchestrator
  model?: "provider/modelId", // default: inherit the main session's model
  tools?: string[],           // default: inherit the main session's tools
  systemPrompt?: string,      // default: inherit the main session's system prompt
  cwd?: string,               // default: the flow's working directory
  contextFiles?: string[],    // file contents appended to the system prompt
  persist?: boolean,          // true → save a session file; default false (in-memory)
}
```

### Drive the returned handle

```ts
const agent = await af.createAgent({ name: "reviewer" });
const answer = await agent.sendMessage("Do the thing."); // blocks, returns final text
answer;            // last step's final assistant text
agent.result;      // same as above
agent.sessionFile; // set only when persist: true
await agent.abort(); // cancel mid-run
agent.dispose();    // release the sub-session
```

Sequential `sendMessage` calls on the same handle **share one conversation**, so
task B sees task A's context. Messages are always delivered **in order**: if the
agent is already streaming a previous step, the message is queued and delivered
after the current work settles — `sendMessage` never fails on a busy agent.
Parallelism is ordinary JS:

```ts
const [a, b] = await Promise.all([
  x.sendMessage("Task A"),
  y.sendMessage("Task B"),
]);
```

### `af.log(...parts)`

Streams a progress line into the Orchestrator. **Not** sent to the LLM context.

### `af.result(value)`

Records the flow outcome. On completion it is injected into the main session as a
custom message (`customType: "agentflow"`, `display: true`) visible to the
orchestrating LLM. If you never call it, completion is still signalled without a
result.

### `af.cwd`

The working directory the flow runs in (a string).

## Authoring conventions

- **Self-contained**: no `import`/`require`; use only `af` and plain JS/TS.
- `await` your steps; the script body runs inside an async function.
- Use `top-level await` freely (the runtime wraps the body in an async IIFE).
- Prefer TypeScript (`.ts`) — it is type-checked before execution.

## Validation workflow

Before a `.ts` flow runs, AgentFlow:
1. **Syntax-validates** the source (both `.ts` and `.js`) and aborts on a syntax
   error before any sub-agent is spawned.
2. **Type-checks** `.ts` files against `agentflow.d.ts` (best-effort when the
   TypeScript compiler is available) and aborts on type errors.

To validate while authoring, include the declarations and run `tsc --noEmit`:

```bash
tsc --noEmit --strict /path/to/.pi/agentflow/myflow.ts \
  --types /path/to/extensions/agentflow/agentflow.d.ts
```

## Worked example

See `extensions/agentflow/examples/reviewcode.ts`. Copy it to `.pi/agentflow/`
and run `/af reviewcode`:

```ts
const reviewer = await af.createAgent({
  name: "reviewer",
  systemPrompt: "You are a senior code reviewer. Be concise and concrete.",
});
const styleCoach = await af.createAgent({
  name: "style",
  systemPrompt: "You focus on style, naming, and maintainability.",
});

af.log("Asking reviewer to review src/core.ts");
const review = await reviewer.sendMessage(
  "Review src/core.ts for correctness.",
);
af.log("Asking style coach to assess the same file");
const style = await styleCoach.sendMessage(
  "Assess the style of src/core.ts.",
);

af.result(`## Code Review\n\n### Correctness\n${review}\n\n### Style\n${style}`);
```