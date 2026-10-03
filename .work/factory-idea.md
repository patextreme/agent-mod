# Software factory extension for Pi

Status: exploratory notes, not an implementation specification. We will refine the design and research the remaining questions later.

## Intent

Build a Pi extension that reads a factory definition file and coordinates reusable pi-subagent workflow scripts.

The factory is a **feedback-loop controller**, not just a sequential workflow chain:

```text
Request → Plan → Implement → Verify → Accepted → Delivery
                    ▲          │
                    │          └── Revise → Repair ──┘
                    │
                    └── Human decision, when needed

Any stage → Blocked / Cancelled / Attempts exhausted → Stop
```

The exact approval policy, definition format, and delivery behavior are undecided.

## Architectural split

**Workflow scripts own the work:** planning, implementation, tests, reviews, and repair.

**The factory owns coordination:** selecting the next workflow, passing inputs and results, bounding iterations, managing decisions, and recording run state.

Prefer explicit structured result contracts over interpreting agent prose. A verification result might distinguish `accepted`, `revise`, and `blocked`, with findings and evidence. A failed workflow or absent result must not imply acceptance.

Repair and retry are different:

- **Repair:** a new invocation informed by verification findings.
- **Retry:** another attempt after an execution failure; potentially unsafe if the failed attempt already changed files.

The factory should own a consistent candidate workspace across implementation, verification, and repair. A dedicated worktree retained for the factory run is a candidate approach. Per-agent throwaway worktrees alone do not establish that continuity; branch integration would need explicit handling.

## Existing pi-subagent capabilities and limitations

Investigation used the installed checkout:

- Repository: `Arteiimis/pi-subagents`
- Configured revision: `dd12bee7726bc82bd7de87f31ea21042efddce8b`
- Package: `@tintinweb/pi-subagents`, version `0.19.0`
- Local source: `/home/pat/.pi/agent/git/github.com/Arteiimis/pi-subagents/`

These findings are version-specific, not promises about future releases.

### Workflow composition

- Saved workflow scripts accept JSON-shaped `args` and return JSON-shaped values.
- A script can invoke another saved script with `await workflow(nameOrRef, args)`.
- Composition supports **one nesting level only**. A child workflow cannot invoke another workflow.
- Nested workflows share the parent run's concurrency cap, cancellation, journal, and agent counter.
- Scripts have no filesystem, network, or module access; actual work happens through agents.
- `SubagentWorkflow` starts a background run and returns a task ID, not its eventual result.

Independent top-level workflow invocations are a candidate factory execution model. This preserves each workflow's own nesting allowance and gives the factory separate step boundaries.

### External invocation

There is currently **no supported cross-extension workflow start/result/control API**.

The existing `pi.events` RPC surface supports top-level agent operations (`ping`, `spawn`, `stop`, `consume`), not workflow execution. Workflow-owned children are excluded from normal top-level lifecycle events and cannot be stopped through the top-level stop RPC.

Internal source exports include `runWorkflow`, `createWorkflowHost`, and workflow resolution helpers, but there is no advertised package-root runner API. Deep imports would introduce version coupling and still require appropriate host/manager integration.

An execution adapter remains necessary. Possible directions to investigate:

- Add a supported workflow bridge upstream or in the installed fork.
- Reuse internal runtime APIs behind a pinned adapter.
- Run workflows in separate Pi processes through the existing workflow CLI flag, after establishing a reliable result/control protocol.

Wrapping escalation does **not** solve this workflow-invocation problem by itself.

### Resume semantics

- `agent(prompt, { resume: label })` can continue a completed child's conversation **within the same running workflow**.
- Labels and their child mappings are local to a workflow run; separate workflow invocations cannot resume prior children by label.
- `resumeFromRunId` replays the unchanged successful prefix of recorded agent calls. It is not a VM checkpoint or child-session restoration mechanism.
- Tool-level journal resume is restricted to retained runs in the same Pi session.
- Workflows containing agent resume calls cannot use journal replay.
- Workflow CLI startup runs do not currently journal for resume.

Potential implementation issue to investigate before adopting structured-output/resume loops: the current manager retains the original `structuredJson`, and the workflow host prefers it over resumed text. This may expose stale structured results after continuation. Also, resumed agent calls cannot specify a new `schema`.

## Child session lifetime and persistence

The **pi-subagent `AgentManager`**, not Pi core, performs completed-record eviction.

Its cleanup timer runs every minute and removes completed/stopped/errored records older than ten minutes. Running and queued records are exempt. Session-boundary cleanup can also remove settled records.

Eviction disposes the live session object and removes its in-memory record. **It does not delete a persisted conversation file.**

Persistence behavior:

- `rememberAgents` defaults to `true`.
- Agents launched directly by a workflow follow that default.
- Agent frontmatter `persist_session` can override persistence in either direction.
- Agents spawned by another child agent default to in-memory sessions unless explicitly configured to persist.

Persisted top-level agents can be reopened through the existing `@handle` UI path after eviction, while the handle's retained metadata remains available. The ordinary Agent resume tool does not provide a general disk-resume fallback, and workflow labels do not provide one either.

Pi's SDK can open a saved session through `SessionManager.open(...)`. Therefore, conversation restoration is technically possible, but exposing it safely to factory/workflow ownership requires additional integration.

**Persisted conversation history is not a persisted running workflow or pending tool promise.**

## Human escalation

### Current behavior

- No built-in human-decision tool or escalation primitive exists in the investigated version.
- Returning a result such as `blocked` is application-defined normal completion, not native suspension.
- Child extension dialogs are not forwarded to the parent UI. Child sessions are bound without a UI context; their dialogs are effectively headless/no-op.
- Child and parent extension event buses are separate; child `pi.events` does not automatically reach the parent.

### Candidate design: wrapper extension, no pi-subagent modification

Escalation can likely be implemented as a separate extension with parent and child roles. Existing agent definitions support loading custom extensions and exposing their tools.

```text
Parent Pi / factory                       Child agent
───────────────────                       ───────────
Decision broker ◄──── request ─────────── request_decision tool
      │                                         │
Present question                           Await answer
      │                                         │
Record human answer ─── response ─────────► Return tool result
                                                │
                                         Child continues
```

**Parent role:** manage pending decisions, display questions, record answers, route responses, and handle cancellation.

**Child role:** register a `request_decision` tool, send the question to the broker, await its answer, and return that answer as the tool result.

The child is awaiting a tool result rather than returning a final answer. It therefore continues naturally in the same conversation, without needing a completed-child resume operation. Completed-record eviction should not apply while the child remains running.

Participating agents must load the extension and allow its tool. This approach does not work unchanged for `isolated: true` agents or agents with extensions disabled.

This is a feasible design direction, **not yet implemented or integration-tested**.

### Bridge options

| Option | Benefits | Limitations |
| --- | --- | --- |
| Shared in-process broker | Smallest implementation | Tied to same-process execution; must isolate roots and ownership correctly |
| Local socket | Explicit boundary; supports separate Pi processes | Requires endpoint discovery, authentication, lifecycle management, and disconnect handling |

A local socket is the leading candidate if factory execution may use separate Pi processes. A shared in-process broker remains a simpler prototype option.

Questions should reach the **parent's** UI, not attempt to use the child's no-op UI. The bridge must correlate requests with the correct root/factory run and child session.

### Proposed request contract

A child could supply:

```json
{
  "question": "Should this change break compatibility?",
  "context": "Preserving compatibility requires a migration layer.",
  "options": [
    { "id": "preserve", "label": "Preserve compatibility" },
    { "id": "break", "label": "Allow the breaking change" }
  ],
  "recommendation": "preserve"
}
```

The broker generates request identity and attaches trusted ownership metadata. The agent must not be allowed to choose another run's identity or ownership.

An answer could be:

```json
{
  "requestId": "decision_123",
  "outcome": "answered",
  "choice": "preserve",
  "message": "Keep existing clients working."
}
```

Free-text questions should also be supported.

### State and policy

Proposed factory-visible states:

```text
Child:    running → awaiting_decision → running → completed
Decision: pending → answered | cancelled | expired
```

These are wrapper-owned states; pi-subagent would still see the waiting child as running unless native support is added later.

Rules to carry into the design:

- Waiting for a decision is not failure and does not consume a repair attempt.
- Dismissing a dialog leaves the question pending.
- No UI, timeout, or disconnect must never imply approval.
- A human answer does not bypass permission checks.
- Cancelling the owning run must unblock/cancel its pending tool calls.
- A decision applies to one request occurrence, not all future similar questions.
- A question need not stop unrelated workflow branches; the factory decides the blocking scope.
- Multiple questions need a queue rather than competing dialogs.
- Persist the answer before delivering it; duplicate identical answers should be harmless and conflicting answers rejected.

For an initial wrapper, waiting children continue occupying concurrency slots. Existing workflow deadlines may still apply: excluding human wait time from native execution deadlines would require deeper integration. Avoid promising scheduler or deadline changes the wrapper cannot enforce.

### Restart boundary

Record pending questions, answers, and child-session references durably for audit and possible recovery.

Initial scope should be **same-process continuation**, not automatic crash-safe resume. A process crash loses the live tool wait and workflow execution state. Mark interrupted requests/runs as recovery-required rather than silently continuing them.

Full recovery would need to reconcile pending tool calls, restore the child conversation, and restore factory/workflow control state. Simply opening the saved session and sending another prompt is insufficient.

Human decisions also need explicit journal/replay semantics before escalation-enabled workflows can safely use existing replay behavior. An answer from an obsolete execution path must not be reused accidentally.

## Current direction

1. Keep workflows responsible for work and the factory responsible for control flow.
2. Favor independent workflow invocations, subject to solving the execution adapter.
3. Implement human escalation as a standalone parent/child wrapper first; no pi-subagent fork is inherently required for live escalation.
4. Treat native waiting-state UI, scheduling, deadline accounting, and crash recovery as separate potential upstream enhancements.
5. Do not automatically commit, merge, or push in an initial factory version.

## Questions for later refinement/research

- What is the supported workflow execution/result adapter we want to depend on?
- Definition format: YAML, JSON, or executable composition? How much branching belongs in it?
- Where are approvals mandatory, versus agent-requested only?
- How does the wrapper discover and authenticate its broker across child sessions/processes?
- How are factory run, step, workflow, child session, and request identities correlated without agent-forged ownership?
- What are cancellation, headless-answering, and timeout semantics?
- Which existing workflow deadlines apply while a child waits?
- How should decision replay interact with workflow journals?
- What is the minimal safe crash-recovery contract?
- How are worktrees retained and changes integrated across workflow invocations?
- Does the structured-output/resume issue require an upstream fix?

## Source references

Paths below are relative to the installed pi-subagent checkout:

- `docs/workflows.md` — composition, return values, replay, CLI behavior, limits.
- `docs/rpc.md` — cross-extension RPC, ownership, lifecycle visibility, registry limitations.
- `README.md` — agent frontmatter and extension/tool scoping.
- `src/workflow/runtime.ts` — workflow execution and per-run resume labels.
- `src/workflow/host.ts` — manager integration and structured result selection.
- `src/workflow/journal.ts` — replay restrictions.
- `src/agent-manager.ts` — live-session resume, cleanup, and retained handle metadata.
- `src/agent-runner.ts` — extension loading, child UI binding, persistence defaults, session opening.

Pi SDK references consulted: `docs/extensions.md`, `docs/sdk.md`, `docs/sessions.md`, `docs/rpc-extension-ui.md`, and `examples/sdk/11-sessions.ts` in the installed Pi distribution.
