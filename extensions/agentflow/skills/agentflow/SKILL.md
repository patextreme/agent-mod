---
name: agentflow
description: Author and modify AgentFlow orchestration scripts for pi. Use when the user wants to create, edit, or run a flow that spawns isolated sub-agents (e.g. reviewcode, multi-step workflows). Covers the injected `af` surface (createAgent, sendMessage, log, result, cwd, bash), authoring conventions, the validation workflow, and the worked example.
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

A flow gets exactly one injected global: `af`. It may import other files with
relative specifiers (see [Imports](#imports)); `af` itself is the only
injected global.

### `af.Type`

The TypeBox `Type` namespace (see [Structured results](#structured-results-resultSchema--submit_result)). Flows cannot import `typebox` (bare module
specifiers are rejected), so `af.Type` is the way to construct a schema value
that shares the SDK's schema-instance identity.

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
schema-instance identity). Bare module specifiers like `typebox` are rejected
by the flow import policy, so `af.Type` is the way to construct a schema
value:

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

### `af.bash(cmd, opts?)` → `Promise<{ stdout, stderr, code }>`

Runs a shell command and resolves its captured output. A non-zero exit code is
**data, not an exception** — branch on `code`. See
[Running shell commands](#running-shell-commands-afbash) for the full contract
(timeout, cancellation, conventions).

```ts
const test = await af.bash("npm test");
if (test.code !== 0) af.log(`tests failed:\n${test.stdout}`);
```

## Running shell commands: `af.bash`

`af.bash(cmd, opts?)` runs a command through the same shell resolution as pi's
own bash tool (`/bin/bash` → `bash` on PATH → `sh -c`; Git Bash on Windows) and
resolves a structured result — no LLM in the loop, so it is fast,
deterministic, and cheap. It is the channel for orchestration logic a flow
needs directly: check `git status` before reviewing, run `npm test` between
agent rounds, verify a fix exists on disk, clean up after itself.

```ts
const r = await af.bash("npm test", { cwd: "packages/core", timeoutMs: 60_000 });
// r: { stdout: string; stderr: string; code: number }
```

### Contract & conventions

- **Non-zero exit is data, not an exception.** `code` is the exit code; branch on
  it. `af.bash` only rejects on cancellation or timeout (below).
- **`cwd` defaults to `af.cwd`** and is overridable via `opts.cwd`.
- **`opts.timeoutMs` is opt-in.** Omit it for no timeout. When it elapses, the
  call rejects with a `BashTimeoutError` carrying the partially-collected
  `stdout`/`stderr`, and the child's process group is killed. A value import
  of the declaration file is rejected, so discriminate by name (or use the
  `af.isBashTimeoutError` type guard):

  ```ts
  try {
    await af.bash("npm test", { timeoutMs: 30_000 });
  } catch (err) {
    if (err.name === "BashTimeoutError") {
      // err.stdout / err.stderr hold what was captured before the timeout
    }
  }
  ```

- **Kill-on-cancel.** If the whole run is cancelled, every in-flight `af.bash`
  child is killed together with its process group (grandchildren included) and
  the pending call rejects with the flow's cancellation error — so the script
  unwinds consistently with `sendMessage` and `createAgent`.
- **Stdin is ignored**, so a command that reads stdin (e.g. `read x`) fails fast
  instead of hanging.
- **Ungated by the permission extension.** `af.bash` is static script code, not
  an LLM-proposed command; the flow's trust gate (project scripts require trust)
  is the security boundary. Same posture as sub-agent bash.
- **Output is buffered unbounded** (no cap). For huge output, redirect to a file
  inside the command and read what you need:

  ```ts
  await af.bash("npm test > /tmp/out.log 2>&1");
  const tail = await af.bash("tail -n 200 /tmp/out.log");
  ```

- **Concurrent calls are allowed** and run independently — use `Promise.all`.
- **Failure visibility.** Output is not streamed; on a non-zero exit the runner
  emits a single one-line notice (`af.bash: "<cmd>" exited <code>`) to the fleet
  log, so failures are visible without full streaming.

### Orchestration pattern: gate a sub-agent on a command

Combine deterministic commands with an LLM step — run a command, branch on its
exit code, and only spend a sub-agent turn when there is something to do:

```ts
// Only review when there are uncommitted changes.
const status = await af.bash("git status --porcelain");
if (status.code === 0 && status.stdout.trim() !== "") {
  const diff = await af.bash("git diff");
  const reviewer = await af.createAgent({
    name: "reviewer",
    systemPrompt: "You are a concise code reviewer.",
  });
  const review = await reviewer.sendMessage(`Review this diff:\n\n${diff.stdout}`);
  reviewer.dispose();
  af.result(review);
} else {
  af.result("Nothing to review.");
}
```

Use `af.bash` for anything the flow can decide deterministically (file checks,
test runs, git state, build gates), and reserve `createAgent` for the steps that
genuinely need reasoning.

## Imports

Flow scripts may import other files — helpers, shared shapes, types — subject
to a **relative-only** import policy:

- **Allowed**: specifiers starting with `./` or `../`, resolving to `.ts` or
  `.js` files anywhere on disk (escaping the flow directory is fine). Both
  `import ... from "./x.ts"` and CommonJS `require("./x.ts")` work, and
  `import type` / `export type` are permitted for type-only edges.
- **Rejected at validation time** (before any sub-agent spawns): bare module
  specifiers (`"zod"`, `"typebox"`), `node:` builtins (`"node:fs"`), dynamic
  `import()` expressions, missing import targets, and value imports of `.d.ts`
  files (import those with `import type` only).
- The whole import graph is validated: every imported file must exist and
  parse, and (for `.ts`) type errors in *imported* files fail validation too,
  reported with the file's path.
- Prefer explicit extensions (`"./helper.ts"`) in specifiers.

```ts
import { summarize } from "./summarize.ts";
import type { Finding } from "./types.ts";

const finding: Finding = { ok: true };
af.log(summarize(finding));
```

### Local declarations: `/af-init`

External editors cannot see the injected `af` global on their own. Run
`/af-init` in the project to write a self-contained copy of the `af`
declarations to `.pi/agentflow/agentflow.d.ts` (created if missing,
overwritten on re-run — re-run it after an extension upgrade to re-sync).
Scripts can then `import type` from it, and editors type `af` through the
file's `declare global`:

```ts
import type { AgentFlow, FlowAgent } from "./agentflow.d.ts";

const agent: FlowAgent<{ ok: boolean }> | undefined = undefined;
const typed: AgentFlow = af;
```

The local copy has no module imports (the `typebox` dependency is replaced by
structural stand-ins), so it type-checks in any project. In-pi validation
keeps using the shipped declarations with full typebox fidelity; the local
copy is looser only on `resultSchema`/`af.Type` typing.

## Authoring conventions

- **Relative imports only**: use `./`/`../` specifiers (see
  [Imports](#imports)); use only `af` and plain JS/TS otherwise.
- `await` your steps; the script body runs as an async module.
- Use `top-level await` freely.
- Prefer TypeScript (`.ts`) — it is type-checked (including its import graph)
  before execution.

## Validation workflow

Before a flow runs, AgentFlow:
1. **Walks the static import graph** (both `.ts` and `.js`): enforces the
   relative-only import policy, verifies every imported file exists and parses,
   and rejects dynamic `import()` — all before any sub-agent is spawned.
2. **Type-checks** `.ts` files (entry and every imported file) against the `af`
   declarations — the shipped ones, or the project's local
   `.pi/agentflow/agentflow.d.ts` when the graph imports it — and aborts on
   type errors.

To validate a draft script **while authoring** — before it is ever executed — use
the `agentflow_validate` tool (call it with the flow name), or for a human run
`/af-validate <name>`. Both run the exact same checks as `/af` (resolve →
import graph → syntax → type) and report located `message`/`line`/`col` errors
(errors in imported files also carry the file's path), so a script that
validates clean is a script that will run clean. An invalid script is reported
as normal validation output, never a tool/command failure:

```
agentflow_validate { "name": "myflow" }
```

## Worked example

See `extensions/agentflow/examples/reviewcode.ts` (basic sequential, reused
handles), `extensions/agentflow/examples/fanout.ts` (structured results with
loop/fan-out), `extensions/agentflow/examples/fresh-context.ts` (a new agent
per iteration for fresh, isolated context), and
`extensions/agentflow/examples/bash.ts` (command-driven orchestration with
`af.bash`).
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