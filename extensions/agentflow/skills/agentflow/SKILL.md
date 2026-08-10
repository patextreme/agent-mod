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
- In TUI mode the flow runs **alongside the editor** under a live fleet
  widget below it: `main` + each running sub-agent, streamed `af.log` lines,
  tap-in (view live conversation, steer, stop), and whole-run cancel. Only
  one flow runs at a time. In non-TUI modes it runs without the UI.

### The fleet widget (TUI)

The widget below the editor is always visible for the duration of a run —
there is nothing to re-open. Keys only act when the prompt editor is
**focused and empty**, so normal typing is untouched:

- `↓` or `←` at an empty prompt activates list navigation; any other key
  deactivates it and flows into the editor.
- `↑`/`↓` move the selection; `enter` opens the selection; `esc` leaves.
- `enter` on an agent opens its live conversation overlay; on `main` it opens
  the run's `af.log` stream.
- `s` steers the selected agent (opens the composer directly).
- `x` is two-press: on an agent it **stops** it (aborts and rejects any
  further messages for this run, so the flow unwinds instead of reviving
  it); on `main` it **cancels the whole run** (every agent stops and the
  flow script unwinds at its next `af` call).
- Steering messages queue between turns — the viewer shows them as
  `[Steering · queued]` until they are delivered.

## The `af` surface

A flow gets exactly one injected global: `af`. It has no other imports or globals.

### `af.Type`

The TypeBox `Type` namespace (see [Structured results](#structured-results-resultSchema--submit_result)). Used to build `resultSchema` values since scripts cannot `import`.

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
  resultSchema?: TSchema,     // TypeBox schema → injects the submit_result tool
}
```

### Drive the returned handle

```ts
const agent = await af.createAgent({ name: "reviewer" });
const answer = await agent.sendMessage("Do the thing."); // blocks, returns final text
answer;            // last step's final assistant text
agent.result;      // same as above
agent.sessionFile; // set only when persist: true
agent.submittedResult(); // schema-typed value the agent submitted (see below)
agent.clearResult(); // explicit reset of the submitted value
await agent.abort(); // cancel mid-run
agent.dispose();    // release the sub-session
```

Sequential `sendMessage` calls on the same handle **share one conversation**, so
task B sees task A's context. Messages are always delivered **in order**: if the
agent is already streaming a previous step, the message is queued and delivered
after the current work settles — `sendMessage` never fails on a busy agent.

`sendMessage` **rejects** when the agent was stopped from the fleet UI or the
whole run was cancelled — a stopped agent is stopped for the rest of the run
and the flow unwinds (wrap the call in `try/catch` if a step may survive a
stop). Parallelism is ordinary JS:

```ts
const [a, b] = await Promise.all([
  x.sendMessage("Task A"),
  y.sendMessage("Task B"),
]);
```

## Structured results: `resultSchema` + `submit_result`

Give an agent a **schema-validated result channel** by passing a TypeBox
`resultSchema` to `af.createAgent`. When present, the sub-agent gets a
`submit_result` tool to hand a typed value back to the flow; when absent, no
tool is injected and `submittedResult()` is always `undefined`.

The schema is a TypeBox `TSchema` built with the `af.Type` namespace (the same
`typebox` version the SDK uses, `1.3.7`, so the schema shares the SDK's
schema-instance identity). Flow scripts cannot `import`, so `af.Type` is the
way to construct a schema value:

```ts
const packet = await af.createAgent<{
  findings: string[];
  confidence: number;
}>({
  name: "packet",
  resultSchema: af.Type.Object({
    findings: af.Type.Array(af.Type.String()),
    confidence: af.Type.Number(),
  }),
});
```

### Reading and clearing a submitted result

```ts
const _text = await packet.sendMessage("Review src/core.ts and submit your findings.");
const findings = packet.submittedResult(); // { findings: string[]; confidence: number } | undefined

packet.clearResult(); // explicitly reset for the next iteration
```

- `submittedResult()` returns a **deep copy** of the most recent value the agent
  submitted, typed as the flow's generic — mutating the returned object never
  affects the handle's stored value.
- `clearResult()` resets the stored value to `undefined`. There is **no
  automatic reset** on `sendMessage` or steering; the flow owns freshness.
- `submit_result` overwrites the previous value (last-write-wins). A malformed
  value is rejected by schema validation so the agent sees the error and retries.
- `sendMessage` still resolves with the final assistant text; the submitted
  result is a separate, structured channel.

### Orchestration patterns

**Loop control** — iterate until the agent submits an accept verdict, clearing
per turn so a stale value is never mistaken for this iteration's answer:

```ts
const checker = await af.createAgent<{
  ok: boolean;
  notes: string;
}>({
  name: "checker",
  resultSchema: af.Type.Object({ ok: af.Type.Boolean(), notes: af.Type.String() }),
});

let round = 0;
while (round < 5) {
  checker.clearResult(); // freshness: this round's verdict only
  await checker.sendMessage(`Round ${round + 1}: verify the fix and submit { ok, notes }.`);
  const verdict = checker.submittedResult();
  if (verdict?.ok) {
    af.log(`Accepted after round ${round + 1}: ${verdict.notes}`);
    break;
  }
  round++;
}
```

**Fan-out over a submitted array** — have a planner submit a list of items, then
fan each item out to parallel workers that themselves submit structured results:

```ts
const planner = await af.createAgent<{ steps: string[] }>({
  name: "planner",
  resultSchema: af.Type.Object({ steps: af.Type.Array(af.Type.String()) }),
});
await planner.sendMessage("Break the task into steps and submit { steps }.");
const steps = planner.submittedResult()?.steps ?? [];

const workers = await Promise.all(
  steps.map(async (step) => {
    const w = await af.createAgent<{ output: string }>({
      name: `worker:${step.slice(0, 12)}`,
      resultSchema: af.Type.Object({ output: af.Type.String() }),
    });
    await w.sendMessage(`Execute this step and submit { output }: ${step}`);
    return w.submittedResult()?.output ?? "";
  }),
);
af.result(workers.join("\n\n"));
```

When a loop must **not** carry context between rounds (independent samples,
retries, unbiased votes), create a **new agent per iteration** instead of
reusing one handle — each round starts cold and fully isolated, so no
`clearResult()` is needed and no prior turn can color the answer:

```ts
for (let round = 0; round < 3; round++) {
  const judge = await af.createAgent<{ accepts: boolean }>({
    name: `judge:${round + 1}`, // fresh handle every turn
    systemPrompt: "Judge only this turn; ignore prior context.",
    resultSchema: af.Type.Object({ accepts: af.Type.Boolean() }),
  });
  await judge.sendMessage(`Round ${round + 1}: review and submit { accepts }.`);
  const verdict = judge.submittedResult();
  judge.dispose(); // discard — handle is single-use
}
```

**Fresh-agent-per-turn** (above) vs **reuse-one-handle** (loop-control): reuse
keeps conversation history across rounds and pairs with `clearResult()` for
result freshness; a new agent per turn loses all prior context in exchange for
clean isolation. The fan-out pattern also runs each worker for a single turn,
so no `clearResult()` is needed there either.

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

To validate a draft script **while authoring** — before it is ever executed — use
the `agentflow_validate` tool (call it with the flow name), or for a human run
`/af-validate <name>`. Both run the exact same checks as `/af` (resolve →
syntax → type) and report located `message`/`line`/`col` errors, so a script that
validates clean is a script that will run clean. An invalid script is reported as
normal validation output, never a tool/command failure:

```
agentflow_validate { "name": "myflow" }
```

## Worked example

See `extensions/agentflow/examples/reviewcode.ts` (basic sequential, reused
handles), `extensions/agentflow/examples/fanout.ts` (structured results with
loop/fan-out), and `extensions/agentflow/examples/fresh-context.ts` (a new
agent per iteration for fresh, isolated context).
Copy one to `.pi/agentflow/` and run `/af reviewcode` (or `/af fanout`):

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