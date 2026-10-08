import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AgentActivityOutcome,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

// A proposed registration probe, not the lifecycle adapter. Compiling this file
// against the locked SDK checks event overloads and required event properties.
// Source-bound runtime ordering evidence is in docs/notify-me-sdk-compatibility.md.
test("proposed notification lifecycle registrations compile against the locked Pi SDK", () => {
  const handlers = new Map<string, (event: unknown) => unknown>();
  const observations: unknown[] = [];
  const pi = {
    on(name: string, handler: unknown) {
      handlers.set(name, handler as (event: unknown) => unknown);
      return () => handlers.delete(name);
    },
  } as Pick<ExtensionAPI, "on">;

  pi.on("agent_start", () => {
    observations.push("start");
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") {
      observations.push({
        stopReason: event.message.stopReason,
        errorMessage: event.message.errorMessage,
      });
    }
  });
  pi.on("agent_before_settle", (event) => {
    const outcome: AgentActivityOutcome = event.outcome;
    observations.push(outcome);
  });
  pi.on("agent_settled", (event) => {
    const aborted: boolean = event.aborted;
    observations.push(aborted);
  });
  pi.on("session_start", (event) => {
    observations.push(event.reason);
  });
  pi.on("session_shutdown", () => {
    observations.push("shutdown");
  });

  assert.deepEqual(
    [...handlers.keys()],
    [
      "agent_start",
      "message_end",
      "agent_before_settle",
      "agent_settled",
      "session_start",
      "session_shutdown",
    ],
  );
  handlers.get("agent_start")?.({ type: "agent_start" });
  handlers.get("message_end")?.({
    type: "message_end",
    message: {
      role: "assistant",
      stopReason: "error",
      errorMessage: "synthetic",
    },
  });
  handlers.get("agent_before_settle")?.({ outcome: "error" });
  handlers.get("agent_settled")?.({ aborted: true });
  handlers.get("session_start")?.({ reason: "new" });
  handlers.get("session_shutdown")?.({});
  assert.deepEqual(observations, [
    "start",
    { stopReason: "error", errorMessage: "synthetic" },
    "error",
    true,
    "new",
    "shutdown",
  ]);
});
