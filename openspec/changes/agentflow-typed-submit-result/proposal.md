## Why

AgentFlow sub-agents currently communicate results back to the flow only as conversational text (`sendMessage` returns the last assistant text). That is fragile for structured orchestration — a flow cannot reliably read a typed value an agent produced, detect that an agent failed to produce one, or iterate over a list of items the agent returned. Supporting a first-class, schema-validated result channel lets flows express loop control and fan-out orchestration directly from agent output.

## What Changes

- Add a `submit_result` tool that is injected into a flow-agent **only when** the flow provides a `resultSchema` (TypeBox `TSchema`) to `af.createAgent`. The tool takes a single `value` param validated against that schema; a malformed submission is rejected by schema validation so the agent sees the error and retries.
- Add a typed accessor on the flow-agent handle: `submittedResult(): T | undefined` returns a **deep copy** of the last value the agent submitted, typed by the generic `FlowAgent<T>` (compile-time only).
- Add `clearResult(): void` to explicitly reset the stored submission to `undefined`. There is **no automatic reset** on `sendMessage` or steering; the script owns freshness.
- Keep `sendMessage` returning the last assistant text unchanged; `submittedResult` is a separate, structured channel.
- Surface a brief log line in the Orchestrator when an agent submits a result.
- Document the new surface and the loop-control / fan-out authoring patterns in the authoring skill and `agentflow.d.ts`.

No existing behavior is removed. `agent.result` (last assistant text) and `af.result` (flow outcome) are unaffected.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `agentflow-runtime`: adds the schema-gated `submit_result` tool, the typed, copy-returning `submittedResult()` accessor, and the explicit `clearResult()` reset on the flow-agent handle.
- `agentflow-authoring`: extends the shipped `agentflow.d.ts` declarations (generic `FlowAgent<T>`, `resultSchema` config, `submittedResult`, `clearResult`) and the authoring skill with the new surface and orchestration patterns.

## Impact

- `extensions/agentflow/runtime.ts` — `FlowAgentHandle` gains the submission slot, `submittedResult()`, `clearResult()`; `createAgent` builds and injects the `submit_result` tool via `customTools` when `resultSchema` is present.
- `extensions/agentflow/agentflow.d.ts` — new type surface; imports `TSchema` from `typebox`.
- `extensions/agentflow/orchestrator.ts` — render the submission log line on the agent row.
- `extensions/agentflow/skills/agentflow/SKILL.md` — document the new API and patterns.
- `package.json` — add `typebox` (matching pi's `typebox@1.3.7`) as a dependency so the extension shares the same schema-instance identity as the SDK; refresh `npmDepsHash` (validated by `nix flake check`).
- Tests: extend `agentflow.d.ts` coverage; add `runtime` tests for tool injection gating, valid/invalid submission, copy semantics, and `clearResult`.