# Design — typed `submit_result` tool + `FlowAgent<T>.submittedResult()`

## Context

See `proposal.md` — Why. Current AgentFlow runtime (`extensions/agentflow/runtime.ts`) drives isolated `createAgentSession` sub-sessions through a `FlowAgentHandle`; `sendMessage` returns the last assistant text and `agent.result` is a getter for that same text. The SDK's `createAgentSession` accepts `customTools?: ToolDefinition[]` and exports `defineTool`, so a per-agent tool with a closure back to the handle is injectable. `ToolDefinition.parameters` is a TypeBox `TSchema`; the SDK validates tool args against it before `execute` runs — that validation is the natural retry backstop.

## Goals / Non-Goals

**Goals**
- A schema-gated `submit_result` tool that a sub-agent can call to hand a typed value back to the flow.
- A typed, copy-returning `submittedResult()` accessor plus an explicit `clearResult()` reset.
- Loop-control and fan-out orchestration expressible from ordinary script TS, with no new runtime primitives.

**Non-Goals**
- No automatic result reset on `sendMessage` or steering.
- No higher-level loop/forEach helpers in the runtime.
- No change to `sendMessage`'s return value or `agent.result` / `af.result`.
- No runtime validation of the flow-declared generic `T` (it is compile-time only); the schema is the only runtime guard.

## Decisions

### 1. Inject `submit_result` only when `resultSchema` is provided
The tool is built and passed via `customTools` to `createAgentSession` **only** when `config.resultSchema` is set. The SDK's `tools` field is an allowlist that also determines the agent's *active* tool set, so the tool name `submit_result` is additionally appended to the active-tool allowlist (`includeSubmitToolActive`) whenever a `resultSchema` is present — mere registration via `customTools` is not enough for the agent to see it. Absent a schema, no tool is injected/activated and `submittedResult()` is always `undefined`.
- Rationale: the schema is both the shape contract and the opt-in switch (per proposal amendment). The active-allowlist append was discovered during live verification (the agent could not call an inactive tool). No ambiguous permissive fallback.
- Alternative considered: always permissive schema — rejected; loses the shape guarantee and the retry value.

### 2. Tool schema wraps the result schema under a `value` key
`parameters: Type.Object({ value: resultSchema })`. The tool's `execute` reads `params.value` and stores it on the handle.
- Rationale: keeps the LLM-facing arg a single `value`; the enforcement of the inner shape is delegated to the SDK's built-in schema validation, which produces an error the agent observes and can retry from. No hand-rolled validation thrown inside `execute`.

### 3. Handle owns a single overwritable submission slot
`FlowAgentHandle` stores `{ value: unknown; set: boolean }` (last-write-wins). `submittedResult(): T | undefined` returns a **deep copy** (`structuredClone`, falling back to `JSON.parse(JSON.stringify(...))`) of the stored value, or `undefined` when unset. `clearResult(): void` resets the slot.
- Rationale: copy-on-read prevents the script from aliasing and mutating the handle's internal state (a real footgun across repeated loop reads). The value is JSON-born, so `structuredClone` is exact and cheap.
- Alternative considered: returning the live reference — rejected per user decision (pointer-aliasing risk).

### 4. No automatic reset anywhere
Neither `sendMessage` nor steering (`sendSteer`) clears the slot. The script calls `clearResult()` explicitly when it wants freshness.
- Rationale (user decision): explicit and self-documenting; avoids hidden behavior when a user steers mid-run.

### 5. Tool guidance via `promptSnippet` + `promptGuidelines`
The tool definition carries a one-line `promptSnippet` and `promptGuidelines` bullets telling the agent it can call `submit_result` to hand structured values back to the flow, and that each call overwrites the previous value.
- Rationale: makes the agent reliably reach for the tool instead of writing the answer as prose.

### 6. Submission surfaced in the Orchestrator
On successful `execute`, the runner emits a `log` event (e.g. `agent "<name>" submitted a result`). The Orchestrator already renders `runner.logs`; the non-TUI reporter already prints `log` events — no new rendering path needed.
- Rationale: live visibility into loops with near-zero plumbing cost.

### 7. `typebox` as a direct dependency
`resultSchema` is a TypeBox `TSchema`; the `TSchema`/`Static` type is not re-exported by `pi-coding-agent`, and the tool's `parameters` must be a schema from the *same* `typebox` instance the SDK uses (v1.3.7) to avoid `SchemaGuard` identity mismatches. Add `typebox@1.3.7` to `package.json` `dependencies` and refresh `npmDepsHash` (verified by `nix flake check`).
- Rationale: schema-instance identity matters at runtime; importing the same pinned version guarantees compatibility.

### 8. Expose `af.Type` so scripts can build schemas without importing
Flow scripts run inside `new Function("af", ...)` — `af` is the only global and scripts cannot `import`. A `resultSchema` is a TypeBox schema *value* that must be constructed by the script, so the `af` surface exposes the TypeBox `Type` namespace as `af.Type`. `buildAf` returns `Type` (the exact typebox instance the SDK shares via the pinned `typebox@1.3.7`); `agentflow.d.ts` declares `Type: typeof Type` on `AgentFlow`.
- Rationale: the spec scenario (`Type.Array(Type.String())`) and the authoring examples require schema construction in-script; without `af.Type` there is no way to build a schema given the no-import constraint. This keeps the "only `af` global" model intact and guarantees schema-instance identity (same pinned typebox).
- Alternative considered: relying on scripts importing typebox — rejected; `import` inside the `new Function` body is a SyntaxError, so imports cannot work at runtime.

## Risks / Trade-offs

- **[Provider constrained-sampling on free-form JSON]** → Mitigation: the schema is flow-provided, so constrained sampling follows whatever the flow declares; if a provider struggles with a broad schema, the throw-on-mismatch retry path still guarantees recovery.
- **[`typebox` version drift vs SDK]** → Mitigation: pin to the SDK's exact `typebox@1.3.7`; `nix flake check` validates the lock.
- **[Script reads stale value across loop turns]** → Mitigation: feature is opt-in via explicit `clearResult()`; the authoring skill documents clearing per iteration.
- **[Schema-instance mismatch if a flow imports a different `typebox`]** → Mitigation: authoring skill and `.d.ts` point authors at the shipped `typebox`; validation is best-effort (documented as such).

## Migration Plan

- Backward compatible: existing flows that never set `resultSchema` are unaffected (no tool, `submittedResult()` returns `undefined`).
- Ship the `.d.ts` and skill updates alongside the runtime change so type-checking stays coherent.
- Rollback: revert the runtime/tool wiring; `submit_result` simply disappears from agents created without a schema.

## Open Questions

None. (Schema-instance resolution details are handled by pinning `typebox@1.3.7` per Decision 7.)