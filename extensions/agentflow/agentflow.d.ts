/**
 * AgentFlow — type declarations for the injected `af` scripting surface.
 *
 * Flow scripts (`.pi/agentflow/<name>.ts`) are executed with a single global
 * `af` object in scope. This file declares its full type surface so scripts
 * can be type-checked with `tsc --noEmit` before execution.
 *
 * Scripts SHALL NOT import anything and SHALL NOT rely on any other global.
 * The only orchestration identifier available is `af`.
 */

/** Configuration accepted by `af.createAgent(config)`. */
export interface FlowAgentConfig {
  /** Human-readable agent name shown in the Orchestrator (e.g. "reviewer"). */
  name: string;
  /** Model to use, as `provider/modelId`. Defaults to the main session's model. */
  model?: string;
  /** Allowlist of tool names exposed to the agent. Defaults to the main session's tools. */
  tools?: string[];
  /** System prompt for the agent. Defaults to the main session's system prompt. */
  systemPrompt?: string;
  /** Working directory for the agent. Defaults to the flow's working directory. */
  cwd?: string;
  /** Extra files whose contents are appended to the agent's system prompt as context. */
  contextFiles?: string[];
  /**
   * When true, the sub-session is persisted to a session file (`sessionFile` is
   * set). When false or omitted, the sub-session is in-memory only.
   */
  persist?: boolean;
}

/** An image attachment to include with a `sendPrompt`. */
export interface FlowImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** Optional per-step options for `sendPrompt`. */
export interface PromptStepOptions {
  /** Image attachments to include with the prompt. */
  images?: FlowImageContent[];
}

/**
 * A single flow-agent: a thin handle wrapping one isolated sub-agent session.
 * Sequential `sendPrompt` calls share the same conversation.
 */
export interface FlowAgent {
  /** The agent name given to `af.createAgent`. */
  readonly name: string;
  /**
   * Send a prompt to the agent and block until the step fully completes,
   * resolving with the final assistant text.
   */
  sendPrompt(text: string, opts?: PromptStepOptions): Promise<string>;
  /**
   * Deliver a steering message (interrupting the agent's current work) and
   * block until the step completes, resolving with the final assistant text.
   */
  sendSteer(text: string): Promise<string>;
  /**
   * Deliver a follow-up message (processed after the current work) and block
   * until the step completes, resolving with the final assistant text.
   */
  sendFollowUp(text: string): Promise<string>;
  /** The last step's final assistant text, or undefined if no step has run. */
  readonly result: string | undefined;
  /** The session file path when the agent is persisted, else undefined. */
  readonly sessionFile: string | undefined;
  /** Cancel the agent mid-run. */
  abort(): Promise<void>;
  /** Release the underlying sub-session. */
  dispose(): void;
}

/** The injected `af` scripting surface. */
export interface AgentFlow {
  /**
   * Spawn an isolated sub-agent session and return a handle to drive it.
   * Defaults (model, tools, cwd, system prompt) inherit from the main session.
   */
  createAgent(config: FlowAgentConfig): Promise<FlowAgent>;
  /** Emit a progress line, rendered live inside the Orchestrator. */
  log(...parts: unknown[]): void;
  /**
   * Record the flow's outcome. On completion it is injected into the main
   * session as a custom message visible to the orchestrating LLM.
   */
  result(value: unknown): void;
  /** The working directory the flow runs in. */
  readonly cwd: string;
}

declare global {
  const af: AgentFlow;
}
