## 1. Public API surface

- [x] 1.1 Update `extensions/agentflow/agentflow.d.ts`: replace `sendPrompt`/`sendFollowUp`/`sendSteer` on the `FlowAgent` interface with a single `sendMessage(text: string, opts?: SendMessageOptions): Promise<string>` (always queues-and-waits, resolves with final assistant text); add the `SendMessageOptions` interface (`{ images?: FlowImageContent[] }`).

## 2. Runtime implementation

- [x] 2.1 In `extensions/agentflow/runtime.ts`, implement `FlowAgentHandle.sendMessage(text, opts?)`: guard on `disposed`, then `session.prompt(text, { images, streamingBehavior: "followUp" })`, then `await session.waitForIdle()`, then set and return `lastResult`.
- [x] 2.2 Remove `sendFollowUp` from `FlowAgentHandle`.
- [x] 2.3 Keep steering as an internal capability: leave a steer method on the concrete `FlowAgentHandle` (e.g. `session.prompt` with `streamingBehavior: "steer"` + `waitForIdle()`) that is NOT part of the public `FlowAgent` interface, so `index.ts` `steerAgent()` keeps working.
- [x] 2.4 Verify the busy path: confirm `session.prompt` with `streamingBehavior` returns before the agent settles so `waitForIdle()` provides the blocking (per design Risk).

## 3. Example and docs

- [x] 3.1 Update `extensions/agentflow/examples/reviewcode.ts` from `sendPrompt` to `sendMessage`.
- [x] 3.2 Update `extensions/agentflow/skills/agentflow/SKILL.md`: document `sendMessage` on the `af` surface, remove `sendPrompt`/`sendFollowUp`/`sendSteer` from the authoring docs, and update the frontmatter description.

## 4. Verification

- [x] 4.1 Run `npm run typecheck` (tsc --noEmit) to confirm the extension type-checks with the new surface.
- [x] 4.2 Run the AgentFlow discovery tests (`npm test`) to confirm no regressions.
- [x] 4.3 Run `openspec validate --change consolidate-agent-send-methods` to confirm the change artifacts are valid.