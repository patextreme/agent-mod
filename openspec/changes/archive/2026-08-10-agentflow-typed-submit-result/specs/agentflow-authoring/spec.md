## ADDED Requirements

### Requirement: Typed result declarations in `agentflow.d.ts`
The shipped `agentflow.d.ts` SHALL declare the submitted-result surface: `af.createAgent` SHALL accept an optional `resultSchema` (a TypeBox `TSchema`) in its config, and the flow-agent handle SHALL be generic (`FlowAgent<T>`), exposing `submittedResult(): T | undefined` and `clearResult(): void`. The declarations SHALL reference the `typebox` `TSchema` type so `resultSchema` is type-checkable.

#### Scenario: Script type-checks against the new surface
- **WHEN** a `.ts` flow script uses `af.createAgent<MyVal>({ name, resultSchema: af.Type.Array(af.Type.String()) })`, reads `agent.submittedResult()` typed as `MyVal | undefined`, and calls `agent.clearResult()`, then is checked with `tsc --noEmit`
- **THEN** the script type-checks against the declared `af` surface

### Requirement: `af.Type` exposes the TypeBox type builder
Flow scripts cannot `import`, so the `af` surface SHALL expose the TypeBox `Type` namespace as `af.Type` so a script can construct a `resultSchema` value. The `agentflow.d.ts` declarations SHALL declare `Type: typeof Type` (from `typebox`) on the `AgentFlow` interface.

#### Scenario: Script builds a result schema via `af.Type`
- **WHEN** a flow script declares `resultSchema: af.Type.Object({ steps: af.Type.Array(af.Type.String()) })` and passes it to `af.createAgent`
- **THEN** the schema value is constructed from the `af.Type` namespace and accepted as the agent's `resultSchema`

### Requirement: Authoring skill documents result orchestration
The authoring skill SHALL document the `submit_result` tool, `resultSchema`, `submittedResult()`, and `clearResult()`, and SHALL include at least one orchestration pattern (loop control and/or fan-out over a submitted array) that a script author can model flows on.

#### Scenario: Skill covers result orchestration
- **WHEN** the main-session LLM loads the authoring skill to learn how a flow reads an agent-submitted result
- **THEN** the skill documents the result surface and at least one loop-control or fan-out pattern