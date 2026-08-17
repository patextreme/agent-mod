---
name: agentflow
description: Author and modify AgentFlow orchestration scripts for pi. Use whenever the user wants to create, edit, debug, or run a flow that spawns isolated sub-agents (e.g. reviewcode, multi-step workflows), gate agent steps on shell commands, or check a flow with agentflow_validate / /af-validate before running /af. Covers the injected `af` surface (createAgent, sendMessage, log, result, cwd, bash, isBashTimeoutError), authoring conventions, the validation workflow, and examples.
---

# AgentFlow — Authoring Guide

AgentFlow turns an imperative TypeScript (or JavaScript) script into a repeatable
multi-step workflow. The script ("flow") spawns *isolated sub-agent sessions*,
drives them step by step, and delivers a result back to the main session.

A minimal flow (`.pi/agentflow/reviewcode.ts`, run with `/af reviewcode`):

```ts
const reviewer = await af.createAgent({
  name: "reviewer",
  systemPrompt: "You are a senior code reviewer. Be concise and concrete.",
});
const review = await reviewer.sendMessage("Review src/core.ts for correctness.");

af.result(`## Review\n\n${review}`);
```

Use top-level `await` freely — the script body runs as an async module. Prefer
`.ts`: it is type-checked before execution.

## Running a flow

- Flows live at `.pi/agentflow/<name>.ts` (project) or `~/.pi/agentflow/<name>.ts`
  (global), with `.js` fallbacks; project resolves first.
- Invoke with `/af <name>`, or `/af:<name>` for any flow already on disk at
  session start. Only one flow runs at a time.
- Project scripts only run when the project is **trusted**.
- In the TUI, the run lives under a fleet widget below the editor: live status
  of `main` + each agent, streamed `af.log` lines, and — activate with `↓`/`←`
  at an empty prompt — per-agent conversation view, steer, stop, and whole-run
  cancel. The widget shows its own key hints; non-TUI modes run without the UI.

## The `af` surface

A flow gets exactly one injected global, `af` (plus relative imports — see
[Imports](#imports)).

### `af.createAgent(config)` → `Promise<FlowAgent>`

Spawns an isolated sub-agent session:

```ts
{
  name: "reviewer",           // required, shown in the fleet widget
  model?: "provider/modelId", // default: inherit the main session's model
  tools?: string[],           // default: inherit the main session's tools
  systemPrompt?: string,      // default: inherit the main session's system prompt
  cwd?: string,               // default: the flow's working directory
  contextFiles?: string[],    // file contents appended to the system prompt
  persist?: boolean,          // true → save a session file; default false (in-memory)
  resultSchema?: TSchema,     // TypeBox schema → injects the submit_result tool
}
```

### Driving the handle

```ts
const agent = await af.createAgent({ name: "reviewer" });
const answer = await agent.sendMessage("Do the thing."); // blocks, returns final text
await agent.sendMessage("What is in this shot?", {       // images ride along (base64)
  images: [{ type: "image", data: b64, mimeType: "image/png" }],
});
agent.result;             // last step's final assistant text
agent.sessionFile;        // set only when persist: true
agent.submittedResult();  // schema-typed value the agent submitted (see below)
agent.clearResult();      // explicit reset of the submitted value
await agent.abort();      // cancel mid-run; queued messages drop, agent stays usable
agent.dispose();          // release the sub-session
```

- Sequential `sendMessage` calls on one handle **share one conversation** —
  task B sees task A's context.
- Messages are always delivered **in order**: a send to a busy agent queues
  behind the running work; `sendMessage` never fails on a busy agent.
- `sendMessage` **rejects** when the agent was stopped from the fleet UI or the
  run was cancelled — a stopped agent is stopped for the rest of the run (wrap
  in `try/catch` if a step must survive a stop).
- Parallelism is ordinary JS:
  `await Promise.all([x.sendMessage(...), y.sendMessage(...)])`.

## Structured results: `resultSchema` + `submit_result`

Pass a TypeBox `resultSchema` to give the agent a typed result channel; without
one there is no `submit_result` tool and `submittedResult()` is always
`undefined`. Build the schema with `af.Type` — the same `typebox` version the
SDK uses (`1.3.7`), so the schema shares its instance identity, and bare module
specifiers like `typebox` are rejected anyway ([Imports](#imports)):

```ts
const checker = await af.createAgent<{ ok: boolean; notes: string }>({
  name: "checker",
  resultSchema: af.Type.Object({ ok: af.Type.Boolean(), notes: af.Type.String() }),
});
```

- `submit_result` overwrites any previous value (last-write-wins); a malformed
  value fails schema validation so the agent sees the error and retries.
- `submittedResult()` returns a **deep copy** of the last submitted value —
  mutating it never affects the handle.
- There is **no automatic reset** on `sendMessage`; when reusing a handle
  across rounds, `clearResult()` first so a stale value is never mistaken for
  this round's answer:

```ts
for (let round = 0; round < 5; round++) {
  checker.clearResult(); // freshness: this round's verdict only
  await checker.sendMessage(`Round ${round + 1}: verify the fix and submit { ok, notes }.`);
  const verdict = checker.submittedResult();
  if (verdict?.ok) break;
}
```

When rounds must **not** share context (independent samples, retries, unbiased
votes), create a **new agent per iteration** instead — each starts cold and
isolated, so no `clearResult()` is needed:

```ts
for (let round = 0; round < 3; round++) {
  const judge = await af.createAgent<{ accepts: boolean }>({
    name: `judge:${round + 1}`,
    resultSchema: af.Type.Object({ accepts: af.Type.Boolean() }),
  });
  await judge.sendMessage(`Round ${round + 1}: review and submit { accepts }.`);
  judge.dispose(); // handle is single-use
}
```

Fan-out — a planner submits `steps`, parallel workers each submit an output via
`Promise.all` — is shown in `../../examples/fanout.ts`.

### `af.log`, `af.result`, `af.cwd`

- `af.log(...parts)` — streams a progress line into the fleet widget; never
  sent to the LLM context.
- `af.result(value)` — records the outcome, injected into the main session as a
  visible custom message on completion. Optional: completion is signalled
  without it.
- `af.cwd` — the working directory the flow runs in.

## Running shell commands: `af.bash`

`af.bash(cmd, opts?)` runs a command through the same shell resolution as pi's
bash tool and resolves `{ stdout, stderr, code }` — no LLM in the loop. Use it
for what the flow can decide deterministically (git state, test runs, build
gates, file checks) and reserve `createAgent` for steps that genuinely need
reasoning:

```ts
const status = await af.bash("git status --porcelain");
if (status.code === 0 && status.stdout.trim() !== "") {
  const diff = await af.bash("git diff");
  const reviewer = await af.createAgent({ name: "reviewer" });
  af.result(await reviewer.sendMessage(`Review this diff:\n\n${diff.stdout}`));
}
```

- A non-zero exit is **data, not an exception** — branch on `code` (`-1` means
  the process died from a signal).
- `opts.cwd` defaults to `af.cwd`; `opts.timeoutMs` is opt-in — on timeout the
  call rejects with a `BashTimeoutError` carrying the partial
  `stdout`/`stderr` (check with `af.isBashTimeoutError(err)`) and kills the
  process group.
- Cancelling the run kills every in-flight child (process group, grandchildren
  included); the call then rejects the same way `sendMessage` does.
- Stdin is ignored (interactive commands fail fast); output is buffered
  unbounded (redirect to a file and read what you need); concurrent calls are
  fine; ungated by the permission extension — the flow's trust gate is the
  security boundary.

## Imports

Flow scripts may import helpers with **relative-only** specifiers: `./`/`../`
resolving to `.ts`/`.js` files inside the flow root. Escaping the script's own
`.pi/agentflow` directory is fine (e.g. `../../shared/util.ts`), but imports
may not escape the project for project flows (or the home directory for global
flows). ESM imports, `require()`, and `import type` all work; prefer explicit
extensions (`"./helper.ts"`). Rejected at validation time — before any
sub-agent spawns: bare module specifiers (`"zod"`, `"typebox"`), `node:`
builtins, dynamic `import()`, non-literal `require()` arguments, missing
targets, and value imports of `.d.ts` files (import those with `import type`
only). The whole graph is validated: every file must exist and parse, and `.ts`
type errors anywhere in the graph fail validation, reported with the file's
path.

### Local declarations: `agentflow.d.ts`

If `.pi/agentflow/agentflow.d.ts` exists in the project (created by
`/af-init` — run it if missing, and again after an extension upgrade since it
overwrites), prefer `import type` from it whenever a flow needs explicit
annotations or typed helpers:

```ts
import type { FlowAgent } from "./agentflow.d.ts";

async function verify(agent: FlowAgent<{ ok: boolean }>, label: string) {
  await agent.sendMessage(`Verify ${label} and submit { ok }.`);
  return agent.submittedResult()?.ok ?? false;
}
```

It pays off twice: named types (`AgentFlow`, `FlowAgent<T>`, `FlowAgentConfig`,
…) for annotations, and — because the file's `declare global { const af }`
joins the program once imported — external editors type the `af` global too.
The copy is self-contained (typebox becomes structural stand-ins), so it
type-checks in any project; validation is looser only on
`resultSchema`/`af.Type` typing, and only when your script imports it
(otherwise the shipped, full-fidelity declarations are used).

## Validation

Before a flow runs it is validated: import-graph walk (policy above) → syntax
of every file → for `.ts`, strict type-checking against the shipped
declarations (or the project's local copy when the graph imports it). To check
a draft while authoring, use the `agentflow_validate` tool —
`agentflow_validate { "name": "myflow" }` — or `/af-validate <name>`; both run
the exact same checks and report located `message`/`line`/`col` errors.
Validating clean means running clean; an invalid script is reported as normal
output, never a tool failure.

## Examples

Four runnable examples ship at `../../examples/`: `reviewcode` (sequential,
reused handles), `fanout` (planner → parallel workers, structured results),
`fresh-context` (new agent per iteration), `bash` (command-driven
orchestration). Copy one to `.pi/agentflow/` and run `/af reviewcode` (or
`/af fanout`).
