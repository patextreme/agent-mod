import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionEvent,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { registerNotifyMe, type SettledOutcome } from "./adapter.js";

// This fixture executes the locked SDK's real outer prompt/post-run/boundary/
// settlement methods. Only model execution, retry waits, compaction, and the
// extension runner port are replaced. No filesystem, auth store, network, or
// model is used. adapter.test.ts covers the command/race policy in finer detail.
for (const path of [
  "retry",
  "compaction",
  "queued",
  "boundary",
  "abort-retry",
  "abort-compaction",
  "abort-boundary",
] as const) {
  test(`locked runtime ${path} reaches the registered adapter only at final settlement`, async () => {
    const { AgentSession } = await import("@earendil-works/pi-coding-agent");
    type RuntimeMethods = {
      _runAgentPrompt: (messages: unknown[]) => Promise<void>;
      _handlePostAgentRun: () => Promise<boolean>;
      _runBeforeSettleBoundary: () => Promise<boolean>;
      _emitAgentSettled: () => Promise<void>;
    };
    const runtime = AgentSession.prototype as unknown as RuntimeMethods;
    const handlers = new Map<
      string,
      (event: unknown, ctx: ExtensionContext) => unknown
    >();
    let command: Omit<RegisteredCommand, "name" | "sourceInfo"> | undefined;
    const delivered: SettledOutcome[] = [];
    const trace: string[] = [];
    const ctx = {
      cwd: "/runtime-fixture",
      hasUI: true,
      mode: "tui",
      isIdle: () => false,
      ui: { notify: () => {} },
    } as unknown as ExtensionCommandContext;
    const pi = {
      on(name: string, handler: unknown) {
        handlers.set(
          name,
          handler as (event: unknown, ctx: ExtensionContext) => unknown,
        );
        return () => {
          handlers.delete(name);
        };
      },
      registerCommand(
        _name: string,
        registered: Omit<RegisteredCommand, "name" | "sourceInfo">,
      ) {
        command = registered;
      },
    } as Pick<ExtensionAPI, "on" | "registerCommand">;
    registerNotifyMe(pi, {
      loadConfiguration: async () => ({
        ok: true,
        webhookUrl: "https://discord.com/api/webhooks/123/fixture-token",
      }),
      now: () => 1000,
      onHandback: (_pending, outcome) => {
        trace.push("dispatch");
        delivered.push(outcome);
      },
    });
    assert.ok(command);
    await command.handler("runtime fixture", ctx);
    const emit = async (event: { type: string }) => {
      trace.push(event.type);
      await handlers.get(event.type)?.(event, ctx);
    };
    let stage = 0;
    const boundaryContext = {
      contextEntries: [],
      contextMessages: [],
      llmMessages: [],
      pendingMessages: [],
      canContinue: true,
    };
    const facade: Record<string, unknown> = {
      _pendingToolNames: new Set(),
      _deferredSettledActions: [],
      _retryAttempt: 0,
      _recordSelection: () => {},
      _finishCancelledRetry: () => {},
      _flushPendingBashMessages: () => {},
      _flushPendingCustomMessages: () => {},
      _resolveIdleWaitIfIdle: () => {},
      _emit: () => {},
      _handlePostAgentRun: runtime._handlePostAgentRun,
      _runBeforeSettleBoundary: runtime._runBeforeSettleBoundary,
      _emitAgentSettled: runtime._emitAgentSettled,
      _buildBoundaryContext: () => boundaryContext,
      _commitBoundaryDrafts: () => {},
      _extensionRunner: {
        hasHandlers: (name: string) => handlers.has(name),
        emit,
        emitBoundary: async (event: { type: string; outcome: string }) => {
          await emit({
            ...event,
            entries: [],
            continue: false,
            context: boundaryContext,
          } as ExtensionEvent);
          assert.equal(delivered.length, 0);
          if (path === "abort-boundary") {
            facade._agentRunAbortRequested = true;
            facade._abortDuringBeforeSettle = true;
          }
          return { entries: [], continue: path === "boundary" && stage === 0 };
        },
      },
      _isRetryableError: () =>
        stage === 0 && (path === "retry" || path === "abort-retry"),
      _prepareRetry: async () => {
        trace.push("retry-wait");
        assert.equal(delivered.length, 0);
        if (path === "abort-retry") facade._agentRunAbortRequested = true;
        return true;
      },
      _checkCompaction: async () => {
        if (
          stage !== 0 ||
          (path !== "compaction" && path !== "abort-compaction")
        )
          return false;
        trace.push("compaction-wait");
        assert.equal(delivered.length, 0);
        if (path === "abort-compaction") facade._agentRunAbortRequested = true;
        return true;
      },
    };
    const run = async () => {
      await emit({ type: "agent_start" });
      const failed =
        stage === 0 && (path.includes("retry") || path.includes("compaction"));
      const message = {
        role: "assistant",
        stopReason: failed ? "error" : "stop",
        errorMessage: failed ? "recoverable" : undefined,
      };
      await emit({ type: "message_end", message } as ExtensionEvent);
      facade._lastActivityOutcome = failed ? "error" : "completed";
      facade._lastAssistantMessage = message;
      facade._lastAssistantToolResults = [];
      await emit({ type: "agent_end", messages: [] } as ExtensionEvent);
      assert.equal(delivered.length, 0);
    };
    facade.agent = {
      prompt: run,
      continue: async () => {
        ++stage;
        await run();
      },
      hasQueuedMessages: () => stage === 0 && path === "queued",
    };
    await runtime._runAgentPrompt.call(facade, []);
    const abort = path.startsWith("abort-");
    assert.equal(stage, abort ? 0 : 1);
    assert.equal(delivered.length, abort ? 0 : 1);
    if (!abort)
      assert.deepEqual(delivered[0], {
        status: "completed",
        errorReason: undefined,
      });
    assert.equal(trace.filter((event) => event === "agent_settled").length, 1);
    assert.equal(trace.at(-1), abort ? "agent_settled" : "dispatch");
    await emit({ type: "agent_settled", aborted: abort } as ExtensionEvent);
    assert.equal(delivered.length, abort ? 0 : 1);
  });
}
