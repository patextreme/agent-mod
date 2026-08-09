## 1. Typed surface & dependency

- [x] 1.1 Add `typebox@1.3.7` to `package.json` `dependencies` and run `nix flake check` to refresh `npmDepsHash` (per AGENTS.md).
- [x] 1.2 Extend `extensions/agentflow/agentflow.d.ts`: import `TSchema` from `typebox`; add optional `resultSchema?: TSchema` to `FlowAgentConfig`; make `FlowAgent<T = unknown>` generic; add `submittedResult(): T | undefined` and `clearResult(): void` read through `declare global` if needed.

## 2. Runtime: submission slot & methods

- [x] 2.1 In `extensions/agentflow/runtime.ts`, add a private submission slot (`{ value: unknown; set: boolean }`) to `FlowAgentHandle`; implement `submittedResult(): T | undefined` returning a deep copy (`structuredClone`, fallback `JSON` round-trip) and `clearResult(): void`.
- [x] 2.2 Make `FlowAgentHandle`/`createAgent` generic-aware (`FlowAgentHandle<T>`) so the handle type carries `T`.

## 3. Runtime: `submit_result` tool injection

- [x] 3.1 In `createAgent`, when `config.resultSchema` is present, build the tool with `defineTool` (imported from `@earendil-works/pi-coding-agent`): `name: "submit_result"`, `parameters: Type.Object({ value: resultSchema })`, `promptSnippet` + `promptGuidelines` guiding the agent, and an `execute` that stores `params.value` into the handle's slot and emits a submission log event. Pass it via `customTools` to `createAgentSession` (create the handle before the session so the closure can reference it).
- [x] 3.2 Ensure a missing `resultSchema` injects no tool and leaves `submittedResult()` returning `undefined`.

## 4. Orchestrator visibility

- [x] 4.1 Emit a `log`-type event on submission (e.g. `agent "<name>" submitted a result`) so both the TUI Orchestrator (renders `runner.logs`) and the non-TUI reporter show it.

## 5. Authoring skill & example

- [x] 5.1 Update `extensions/agentflow/skills/agentflow/SKILL.md`: document `resultSchema`, the `submit_result` tool, `submittedResult()`, `clearResult()`, and at least one loop-control and one fan-out pattern with `clearResult()` used for freshness.
- [x] 5.2 Add a worked example (or extend `extensions/agentflow/examples/reviewcode.ts` or a new example) demonstrating reading a submitted result and iterating/fanning out.

## 6. Tests & quality gates

- [x] 6.1 Add `extensions/agentflow/runtime.test.ts` covering: tool injected iff `resultSchema` present; valid submission stores value; malformed submission rejected so the agent can retry; `submittedResult()` returns a copy (mutating the returned value does not affect the handle); `clearResult()` resets to `undefined`; no auto-reset across `sendMessage`.
- [x] 6.2 Run `npm run format && npm run lint && npm run check && npm run typecheck && npm test` and `nix flake check`; confirm all pass.