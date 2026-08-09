/**
 * runtime.ts — The AgentFlow runtime: flow-agent lifecycle and the injected
 * `af` scripting surface, driving isolated `createAgentSession` sub-sessions.
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionContext,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentFlow, FlowAgent, FlowAgentConfig } from "./agentflow.js";
import {
  buildSubmitTool,
  createSubmissionSlot,
  FlowAgentHandle,
  includeSubmitToolActive,
} from "./submit.js";

// Re-export the submitted-result surface so runtime consumers (and the shipped
// runtime interface) keep working through this module path.
export {
  buildSubmitTool,
  createSubmissionSlot,
  deepCopy,
  FlowAgentHandle,
  includeSubmitToolActive,
  type SubmissionSlot,
} from "./submit.js";

/** Live status of a flow-agent, as shown in the Orchestrator. */
export type AgentStatus = "created" | "running" | "idle" | "stopped" | "error";

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

/** Events emitted by the FlowRunner for the Orchestrator / non-TUI reporter. */
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

type Listener = (event: FlowRunnerEvent) => void;

/** Services the runner needs from the main-session context. */
export interface RunnerServices {
  ctx: ExtensionContext;
  /** Resolve a `provider/modelId` string to a model, or undefined. */
  resolveModel: (spec: string) => unknown | undefined;
  /** Inherited active tool names from the main session. */
  inheritTools: () => string[];
}

/**
 * Drives one flow script: owns the flow-agent registry, collects `af.log`
 * lines and `af.result`, and runs the script body. Emits events so the
 * Orchestrator (or the non-TUI reporter) can render live progress.
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
        const line = parts.map(String).join(" ");
        runner.logs.push(line);
        runner.emit({ type: "log", line });
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
    const name = config.name?.trim();
    if (!name) throw new Error("AgentFlow: af.createAgent requires a `name`.");

    const cwd = config.cwd ?? this.cwd;
    const model = config.model
      ? (this.services.resolveModel(config.model) as never)
      : this.services.ctx.model;
    if (config.model && model === undefined) {
      this.emit({
        type: "log",
        line: `AgentFlow: warning — model "${config.model}" not found; using the default model.`,
      });
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

    const agentDir = getAgentDir();
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const sessionManager = config.persist
      ? SessionManager.create(cwd)
      : SessionManager.inMemory(cwd);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    });
    await loader.reload();

    // Create the submission slot *before* the session so the submit_result
    // tool's execute closure and the handle share the same storage. The tool
    // is injected only when a resultSchema is provided (schema-gated opt-in).
    const submission = createSubmissionSlot();
    const submitTool = buildSubmitTool(
      name,
      config.resultSchema,
      submission,
      (line) => this.emit({ type: "log", line }),
    );
    const customTools = submitTool ? [submitTool] : undefined;

    const { session } = await createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      settingsManager,
      resourceLoader: loader,
      ...(model !== undefined ? { model: model as never } : {}),
      ...(tools ? { tools } : {}),
      ...(customTools ? { customTools } : {}),
    });

    session.setSessionName(name);

    const handle = new FlowAgentHandle<T>(name, session, submission);
    const record: FlowAgentRecord = {
      id: `agent${this.nextId++}`,
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
      } else if (event.type === "tool_execution_end") {
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
    record.completedAt = Date.now();
    this.emit({ type: "agent_updated", record });
  }

  /** Record the final outcome and signal completion. */
  complete(error?: string): void {
    this.completed = true;
    this.emit({
      type: "complete",
      result: this.flowResult.value,
      hasResult: this.flowResult.set,
      error,
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
