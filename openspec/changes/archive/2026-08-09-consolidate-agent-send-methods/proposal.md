## Why

The `FlowAgent` handle exposes three near-identical send methods — `sendPrompt`, `sendFollowUp`, and `sendSteer` — that all do the same underlying thing (send a message to the agent and block for the result) and differ only in how they queue when the agent is busy. This is confusing to author and unnecessary: the unified primitive (`AgentSession.prompt` with a `streamingBehavior` option) already exists one layer down. We want a single, teachable `sendMessage` entry point that always delivers in order, freeing the surface to grow future per-step options.

## What Changes

- **Replace** the public `FlowAgent` send methods with a single `sendMessage(text, opts?)` that always queues-and-waits and resolves with the final assistant text. **BREAKING** — `sendPrompt` and `sendFollowUp` are removed from the public type.
- `sendMessage` supports image attachments via an options object (`SendMessageOptions`), the extension point for future per-step options.
- **Remove** `sendSteer` from the public `FlowAgent` interface. Steering remains an internal capability on the concrete handle (used by the Orchestrator to forward a main-session message into a running sub-agent), but is not exposed to flow scripts. **BREAKING** — scripts can no longer steer.
- **Drop** the throw-on-busy guard: `sendMessage` queues a message when the agent is streaming instead of failing. No opt-in flag.
- **Update** the `agentflow.d.ts` declarations, the authoring skill, and the `reviewcode` example from `sendPrompt` to `sendMessage`.
- Safe to hard-break: no user flow scripts exist yet (no `.pi/agentflow` or `~/.pi/agentflow` scripts), so no deprecated aliases are needed.

## Capabilities

### New Capabilities
<!-- None. This change modifies existing capabilities; no new capability path is introduced. -->

### Modified Capabilities
- `agentflow-runtime`: The "Flow-agent prompt steps" requirement changes from `sendPrompt`/`sendSteer`/`sendFollowUp` to a single `sendMessage` that always queues-and-waits; steering is no longer a public-script capability.
- `agentflow-authoring`: The example-flow requirement changes from sequential `sendPrompt` steps to `sendMessage`; the authoring skill and type declarations reflect the consolidated surface.

## Impact

- `extensions/agentflow/agentflow.d.ts` — replace `sendPrompt`/`sendSteer`/`sendFollowUp` with `sendMessage`; add `SendMessageOptions`; keep `sendSteer` off the public interface.
- `extensions/agentflow/runtime.ts` — implement unified `sendMessage` (`session.prompt` + `waitForIdle`); keep `sendSteer` as a concrete-class method not in the interface; remove `sendFollowUp`.
- `extensions/agentflow/index.ts` — unchanged (orchestrator steers via the concrete handle).
- `extensions/agentflow/examples/reviewcode.ts` — `sendPrompt` → `sendMessage`.
- `extensions/agentflow/skills/agentflow/SKILL.md` — update documented `af` surface and frontmatter.
- No external flow scripts exist, so the breaking change affects only the repo's own files.