/**
 * runner.ts — The AgentFlow FlowRunner: flow-agent registry, `af.log` /
 * `af.result` collection, flow cancellation, and the injected `af` scripting
 * surface.
 *
 * Kept free of any *runtime* import from `@earendil-works/pi-coding-agent`
 * (only type imports, erased at transpile) so this module — and its unit
 * tests — run under `tsx`, which cannot resolve that package's `exports`
 * from a `.ts` file via CJS. The SDK session spawning lives in `runtime.ts`
 * and is injected via `RunnerServices.spawnSession`.
 */

import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentFlow, FlowAgent, FlowAgentConfig } from "./agentflow.js";
import {
  buildSubmitTool,
  createSubmissionSlot,
  FLOW_CANCELLED_ERROR,
  FlowAgentHandle,
  includeSubmitToolActive,
} from "./submit.js";

/** Live status of a flow-agent, as shown in the fleet UI. */
export type AgentStatus =
  | "created"
  | "running"
  | "idle"
  | "stopped"
  | "error"
  | "disposed";

/**
 * Render a flow-provided value for display: strings verbatim, everything else
 * as pretty JSON. Falls back to `String(value)` when JSON cannot represent it
 * (BigInt, circular structures, `undefined`), so display paths never throw.
 */
export function renderFlowValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Public, UI-facing record for one running flow-agent. */
export interface FlowAgentRecord {
  id: string;
  /** Agent name from `af.createAgent`. */
  name: string;
  status: AgentStatus;
  /** Human-readable model label, or undefined when inheriting the main model. */
  model: string | undefined;
  startedAt: number;
  completedAt: number | undefined;
  /** Current activity summary (current step / tool). */
  activity: string;
  /** The underlying session (for the conversation viewer). */
  session: AgentSession;
  /** The flow-agent handle driving this session. */
  handle: FlowAgentHandle;
}

/** Events emitted by the FlowRunner for the fleet UI / non-TUI reporter. */
export type FlowRunnerEvent =
  | { type: "log"; line: string }
  | { type: "agent_created"; record: FlowAgentRecord }
  | { type: "agent_updated"; record: FlowAgentRecord }
  | {
      type: "complete";
      result: unknown;
      hasResult: boolean;
      error?: string;
    };

/** Everything `FlowRunner.createAgent` computed before spawning a session. */
export interface SpawnSessionOptions {
  cwd: string;
  name: string;
  /** Resolved model, or undefined to inherit the session default. */
  model: unknown | undefined;
  /** Active-tool allowlist (includes `submit_result` when a schema is set). */
  tools: string[];
  systemPrompt: string;
  persist: boolean;
  /** The schema-gated `submit_result` tool, or undefined without a schema. */
  customTools: ToolDefinition[] | undefined;
}

type Listener = (event: FlowRunnerEvent) => void;

/** Services the runner needs from the main-session context. */
export interface RunnerServices {
  ctx: ExtensionContext;
  /** Resolve a `provider/modelId` string to a model, or undefined. */
  resolveModel: (spec: string) => unknown | undefined;
  /** Inherited active tool names from the main session. */
  inheritTools: () => string[];
  /** Spawn the isolated sub-session (SDK work lives in `runtime.ts`). */
  spawnSession: (opts: SpawnSessionOptions) => Promise<AgentSession>;
}

/**
 * Drives one flow script: owns the flow-agent registry, collects `af.log`
 * lines and `af.result`, and signals cancellation/completion. Emits events
 * so the fleet UI (or the non-TUI reporter) can render live progress.
 */
export class FlowRunner {
  /** Flow-agents in creation order. */
  readonly agents: FlowAgentRecord[] = [];
  /** Streamed `af.log` lines. */
  readonly logs: string[] = [];
  readonly cwd: string;

  private listeners = new Set<Listener>();
  private flowResult: { value: unknown; set: boolean } = {
    value: undefined,
    set: false,
  };
  private nextId = 1;
  private completed = false;
  /** Set when the user cancels the run from the fleet UI. */
  private cancelled = false;

  constructor(readonly services: RunnerServices) {
    this.cwd = services.ctx.cwd;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: FlowRunnerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A listener must never break the flow run.
      }
    }
  }

  /** The `af` object injected into the script's scope. */
  buildAf(): AgentFlow {
    const runner = this;
    return {
      // Expose the TypeBox `Type` namespace so flow scripts can build a
      // `resultSchema` without importing (scripts cannot import).
      Type,
      async createAgent<T = unknown>(
        config: FlowAgentConfig,
      ): Promise<FlowAgent<T>> {
        return runner.createAgent<T>(config);
      },
      log(...parts: unknown[]): void {
        runner.logLine(parts.map(renderFlowValue).join(" "));
      },
      result(value: unknown): void {
        runner.flowResult = { value, set: true };
      },
      get cwd(): string {
        return runner.cwd;
      },
    };
  }

  /** Spawn a flow-agent sub-session and register it. */
  async createAgent<T = unknown>(
    config: FlowAgentConfig,
  ): Promise<FlowAgentHandle<T>> {
    if (this.cancelled) throw new Error(`AgentFlow: ${FLOW_CANCELLED_ERROR}`);
    const name = config.name?.trim();
    if (!name) throw new Error("AgentFlow: af.createAgent requires a `name`.");

    const cwd = config.cwd ?? this.cwd;
    const model = config.model
      ? this.services.resolveModel(config.model)
      : this.services.ctx.model;
    if (config.model && model === undefined) {
      this.logLine(
        `AgentFlow: warning — model "${config.model}" not found; using the default model.`,
      );
    }
    const baseTools =
      config.tools !== undefined ? config.tools : this.services.inheritTools();
    // When a resultSchema is provided, the submit_result tool must be among the
    // agent's ACTIVE tools (the SDK's `tools` field is an allowlist that also
    // determines the active set — mere registration via customTools is not
    // enough for the agent to see it). Omit the inherited allowlist so the
    // custom tool is reachable; otherwise the agent can never call it.
    const tools = includeSubmitToolActive(
      baseTools,
      config.resultSchema !== undefined,
    );
    const baseSystemPrompt =
      config.systemPrompt ?? this.services.ctx.getSystemPrompt();

    // Optionally append context file contents to the system prompt.
    let systemPrompt = baseSystemPrompt;
    if (config.contextFiles && config.contextFiles.length > 0) {
      const { readFileSync } = await import("node:fs");
      const blocks: string[] = [];
      for (const file of config.contextFiles) {
        try {
          blocks.push(
            `\n\n<context file="${file}">\n${readFileSync(file, "utf-8")}\n</context>`,
          );
        } catch {
          // A missing context file is a soft warning, not a hard failure.
        }
      }
      systemPrompt = baseSystemPrompt + blocks.join("\n");
    }

    // Create the submission slot *before* the session so the submit_result
    // tool's execute closure and the handle share the same storage. The tool
    // is injected only when a resultSchema is provided (schema-gated opt-in).
    const submission = createSubmissionSlot();
    const submitTool = buildSubmitTool(
      name,
      config.resultSchema,
      submission,
      (line) => this.logLine(line),
    );

    const session = await this.services.spawnSession({
      cwd,
      name,
      model,
      tools,
      systemPrompt,
      persist: config.persist ?? false,
      customTools: submitTool ? [submitTool] : undefined,
    });
    session.setSessionName(name);

    const id = `agent${this.nextId++}`;
    const handle = new FlowAgentHandle<T>(
      name,
      session,
      submission,
      () => this.isCancelled,
      () => this.markDisposed(id),
    );
    const record: FlowAgentRecord = {
      id,
      name,
      status: "created",
      model: config.model,
      startedAt: Date.now(),
      completedAt: undefined,
      activity: "created",
      session,
      handle,
    };
    this.agents.push(record);
    this.emit({ type: "agent_created", record });
    this.wireActivity(record);
    return handle;
  }

  /** Track live activity from the sub-session's events. */
  private wireActivity(record: FlowAgentRecord): void {
    const update = (activity: string, status?: AgentStatus) => {
      // Terminal states are final: late events after an abort/error/dispose
      // must not flip a stopped, errored, or disposed agent back to running.
      if (
        record.status === "stopped" ||
        record.status === "error" ||
        record.status === "disposed"
      )
        return;
      record.activity = activity;
      if (status) record.status = status;
      this.emit({ type: "agent_updated", record });
    };
    record.session.subscribe((event: AgentSessionEvent) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        update("streaming", "running");
      } else if (event.type === "tool_execution_start") {
        update(`running ${event.toolName}`, "running");
      } else if (event.type === "agent_settled") {
        // The turn fully completed — the agent is idle, not still running.
        // (`tool_execution_end` deliberately does NOT flip to idle: a turn
        // spans many tool calls, and flapping to idle mid-turn would briefly
        // disable the UI's steer/stop affordances.)
        update("idle", "idle");
      } else if (
        event.type === "message_start" &&
        event.message.role === "user"
      ) {
        update("thinking", "running");
      }
    });
  }

  /** Mark an agent stopped (post-`abort()`). */
  markStopped(agentId: string): void {
    const record = this.agents.find((a) => a.id === agentId);
    if (!record) return;
    record.status = "stopped";
    record.activity = "stopped";
    record.completedAt = Date.now();
    this.emit({ type: "agent_updated", record });
  }

  /**
   * Mark an agent disposed (post-`dispose()`): freezes its elapsed clock and
   * retires it from the fleet. Terminal statuses (stopped/error) win over a
   * late dispose so the reason the agent ended stays visible.
   */
  markDisposed(agentId: string): void {
    const record = this.agents.find((a) => a.id === agentId);
    if (!record) return;
    if (record.status === "stopped" || record.status === "error") return;
    record.status = "disposed";
    record.activity = "disposed";
    record.completedAt = Date.now();
    this.emit({ type: "agent_updated", record });
  }

  /** True once the user cancelled the run from the fleet UI. */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /** Append a progress line (also used for runtime-generated notices). */
  logLine(line: string): void {
    this.logs.push(line);
    this.emit({ type: "log", line });
  }

  /**
   * Cancel the whole run: stop every non-terminal agent (clearing queues so
   * nothing resurrects) and reject any further `af` calls so the flow script
   * unwinds at its next step.
   */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const record of this.agents) {
      if (
        record.status === "stopped" ||
        record.status === "error" ||
        record.status === "disposed"
      )
        continue;
      void record.handle.stop();
      this.markStopped(record.id);
    }
    this.logLine("AgentFlow: run cancelled by user");
  }

  /** Record the final outcome and signal completion. */
  complete(error?: string): void {
    this.completed = true;
    // Freeze any still-ticking clocks so no agent's elapsed time outlives the
    // run (e.g. agents the script never explicitly disposed).
    const now = Date.now();
    for (const record of this.agents) {
      if (record.completedAt === undefined) record.completedAt = now;
    }
    // A cancelled run always reports the cancellation — the script's unwind
    // errors (e.g. "agent was stopped") are consequences of it, not the
    // outcome the user needs to see.
    const finalError = this.cancelled ? FLOW_CANCELLED_ERROR : error;
    this.emit({
      type: "complete",
      result: this.flowResult.value,
      hasResult: this.flowResult.set,
      error: finalError,
    });
  }

  /** Result recorded via `af.result`, with a flag for whether it was set. */
  get recordedResult(): { value: unknown; set: boolean } {
    return this.flowResult;
  }

  /** True once `complete()` has been called (flow finished or errored). */
  get isComplete(): boolean {
    return this.completed;
  }
}

/**
 * Execute a flow script's (already-transpiled, JS) source with the injected
 * `af` global. Wraps the body in an `AsyncFunction` — the only identifier in
 * scope beyond native JS is `af`.
 */
export async function executeFlowScript(
  transpiledSource: string,
  af: AgentFlow,
): Promise<void> {
  const fn = new Function(
    "af",
    `"use strict"; return (async () => {\n${transpiledSource}\n})();`,
  ) as (af: AgentFlow) => Promise<unknown>;
  await fn(af);
}
