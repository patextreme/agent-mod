## Context

The `FlowAgentHandle` in `extensions/agentflow/runtime.ts` currently wraps a single `createAgentSession` sub-session and exposes three send methods (`sendPrompt`, `sendSteer`, `sendFollowUp`) that differ only in busy-time queueing. The underlying `AgentSession.prompt(text, opts)` already accepts a `streamingBehavior: "steer" | "followUp"` option, so the unified primitive exists one layer down. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- A single public `sendMessage(text, opts?)` on `FlowAgent` that always delivers in order and resolves with the final assistant text.
- An `opts` object (`SendMessageOptions`) as the extension point for future per-step options.
- Preserve the existing main-session→sub-agent steering feature (used by the Orchestrator) without exposing steering to flow scripts.

**Non-Goals:**
- No new public send methods beyond `sendMessage`.
- No backward-compat aliases (no external flows exist).
- No change to `result`, `sessionFile`, `abort`, `dispose`.

## Decisions

**1. Unify on `session.prompt` + `streamingBehavior: "followUp"` + `waitForIdle()`.**
`sendMessage` calls `session.prompt(text, { images, streamingBehavior: "followUp" })` then `await waitForIdle()` and reads `getLastAssistantText()`. When idle, `prompt` runs the full fresh-turn pipeline and blocks; when busy, it queues and returns, so `waitForIdle()` provides the blocking. This keeps the richer pre-processing of `prompt` (extension input interception, skill/template expansion) compared to the bare `session.followUp()`.
- *Alternative rejected:* keep separate `sendPrompt`/`sendFollowUp` methods — the redundancy we're removing.

**2. Drop the throw-on-busy guard.**
`sendMessage` always queues when the agent is streaming; there is no `throwIfBusy` opt-in. This is the "always delivers, in order" mental model. Chosen over preserving the guard because the point of consolidation is a predictable, safe send primitive.

**3. Steering stays on the concrete class only.**
`FlowAgentHandle` keeps a `sendSteer` / internal steer method (calls `session.prompt` with `streamingBehavior: "steer"` + `waitForIdle()`), but it is **not** declared on the public `FlowAgent` interface. `index.ts`'s `steerAgent()` types against the concrete `FlowAgentHandle`, so the Orchestrator's steering keeps working unchanged.
- *Alternative rejected:* removing steering entirely — would regress the main-session→sub-agent steering feature.

**4. `SendMessageOptions` object (not a positional images param).**
`{ images?: FlowImageContent[] }` today; future options (per-step `model`, `throwIfBusy`, attachments) add keys without changing call sites. Matches the existing `PromptOptions` shape.

## Risks / Trade-offs

- **[Loss of the loud-failure guard]** → Previously `sendPrompt` threw if a script double-dispatched to a busy agent. Now it silently queues. Mitigation: this is intended and matches the "always delivers" contract; a future `throwIfBusy` option can restore it without breaking the API.
- **[Behavioral regression if `waitForIdle` is omitted in the busy path]** → `session.prompt` with `streamingBehavior` returns before the agent settles, so `sendMessage` must call `waitForIdle()` to block. Mitigation: verify the busy path blocks correctly during implementation.

## Migration Plan

- Hard break: no external flows exist. Update `agentflow.d.ts`, `runtime.ts`, `examples/reviewcode.ts`, and `skills/agentflow/SKILL.md` in the same change.
- Rollback: revert commits; the change is confined to the extension's own files.

## Open Questions

None.