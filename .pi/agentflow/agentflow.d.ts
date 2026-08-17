/**
 * AgentFlow — type declarations for the injected `af` scripting surface.
 *
 * Flow scripts (`.pi/agentflow/<name>.ts`) are executed with a single global
 * `af` object in scope (the entry and every module it imports see the same
 * object). This file declares its full type surface so scripts can be
 * type-checked with `tsc --noEmit` before execution.
 *
 * Scripts MAY import other files with relative specifiers (`./module`,
 * `../module` — `.ts`/`.js` inside the flow root; project flows are confined
 * to the project, global flows to the user's home directory). Bare module specifiers
 * (`"zod"`), `node:` builtins, and dynamic `import()` are rejected at
 * validation time; `.d.ts` files may be imported for types only. Scripts
 * that want these types locally can run `/af-init` to generate a
 * self-contained copy at `.pi/agentflow/agentflow.d.ts` and `import type`
 * from it. The only injected orchestration global is `af`.
 */

/**
 * Structural stand-in for TypeBox's `TSchema` (this local copy has no module
 * imports): any schema-shaped object is assignable, so `resultSchema` values
 * built with `af.Type` type-check without typebox's exact definition.
 */
interface TSchema {
  readonly [key: string]: unknown;
}

/**
 * Loose stand-in for TypeBox's `Type` builder namespace: every method
 * (Object, String, Number, ...) accepts anything and returns a `TSchema`.
 */
declare const Type: { [method: string]: (...args: unknown[]) => TSchema };

/** Result of an `af.bash(cmd, opts?)` call: the captured streams and exit code. */
export interface BashResult {
  /** Full captured stdout (utf-8, unbounded). */
  stdout: string;
  /** Full captured stderr (utf-8, unbounded). */
  stderr: string;
  /**
   * Process exit code. A non-zero code is data, not an exception — never
   * thrown. When the process is killed by a signal (e.g. SIGKILL/SIGTERM,
   * including external kills) Node reports `null`, which `af.bash` resolves as
   * `-1` so the `number` contract always holds; branch for this `-1` sentinel
   * rather than a specific signal-derived code (e.g. 137).
   */
  code: number;
}

/**
 * Rejected by `af.bash` when the call exceeds its `opts.timeoutMs`. Carries the
 * partially-collected output so the hang is diagnosable. A value import of
 * this declaration file is rejected by the flow import policy, so distinguish
 * a timeout with `af.isBashTimeoutError` (a type-checked guard) rather than a
 * bare `err.name === "BashTimeoutError"` string compare, which a typo can
 * silently break past validation.
 */
export interface BashTimeoutError extends Error {
  readonly name: "BashTimeoutError";
  /** Partially-collected stdout at the moment of the timeout. */
  readonly stdout: string;
  /** Partially-collected stderr at the moment of the timeout. */
  readonly stderr: string;
}

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
  /**
   * A TypeBox `TSchema` describing the structured value the agent can submit
   * back to the flow via the `submit_result` tool. When provided, the
   * sub-agent gains a `submit_result` tool whose `value` is validated against
   * this schema; when omitted, no such tool is injected and
   * `submittedResult()` is always `undefined`. Use the `typebox` package the
   * extension ships so the schema shares the SDK's schema-instance identity.
   */
  resultSchema?: TSchema;
}

/** An image attachment to include with a `sendMessage`. */
export interface FlowImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** Optional per-step options for `sendMessage`. */
export interface SendMessageOptions {
  /** Image attachments to include with the message. */
  images?: FlowImageContent[];
}

/**
 * A single flow-agent: a thin handle wrapping one isolated sub-agent session.
 * Sequential `sendMessage` calls share the same conversation.
 *
 * `T` is the compile-time type of the value the agent submits via
 * `submit_result` (compile-time only; the runtime guard is `resultSchema`).
 */
export interface FlowAgent<T = unknown> {
  /** The agent name given to `af.createAgent`. */
  readonly name: string;
  /**
   * Send a message to the agent and block until the step fully completes,
   * resolving with the final assistant text. Messages are always delivered in
   * order: when the agent is already streaming, the message is queued and
   * delivered after the current work settles rather than failing.
   *
   * Rejects when the agent was stopped from the Orchestrator UI or the whole
   * run was cancelled — a stopped agent can never be revived by the script.
   * Flows that want to tolerate a stop can `try/catch` around the call.
   */
  sendMessage(text: string, opts?: SendMessageOptions): Promise<string>;
  /** The last step's final assistant text, or undefined if no step has run. */
  readonly result: string | undefined;
  /** The session file path when the agent is persisted, else undefined. */
  readonly sessionFile: string | undefined;
  /**
   * The most recent value the agent submitted via `submit_result`, or
   * `undefined` when none has been submitted (or the result was cleared).
   * Returns a deep copy, so mutating it does not affect the handle's stored
   * value. There is no automatic reset on `sendMessage` or steering; call
   * `clearResult()` explicitly when you want freshness.
   */
  submittedResult(): T | undefined;
  /** Reset the stored submitted value to `undefined`. */
  clearResult(): void;
  /**
   * Cancel the agent mid-run and drop any queued steering/follow-up
   * messages. The agent stays usable afterwards; a permanent stop is a UI
   * action (the Orchestrator stops it and rejects further messages).
   */
  abort(): Promise<void>;
  /** Release the underlying sub-session. */
  dispose(): void;
}

/** The injected `af` scripting surface. */
export interface AgentFlow {
  /**
   * The TypeBox `Type` namespace, exposed so flow scripts can build a
   * `resultSchema` without importing `typebox` (bare module specifiers are
   * rejected by the flow import policy). Use it to construct schema values,
   * e.g. `af.Type.Object({ done: af.Type.Boolean() })`.
   */
  Type: typeof Type;
  /**
   * Spawn an isolated sub-agent session and return a handle to drive it.
   * Defaults (model, tools, cwd, system prompt) inherit from the main session.
   * `T` is the type of the value the agent submits via `submit_result`.
   */
  createAgent<T = unknown>(config: FlowAgentConfig): Promise<FlowAgent<T>>;
  /** Emit a progress line, rendered live inside the Orchestrator. */
  log(...parts: unknown[]): void;
  /** Record the flow's outcome. On completion it is injected into the main
   * session as a custom message visible to the orchestrating LLM.
   */
  result(value: unknown): void;
  /** The working directory the flow runs in. */
  readonly cwd: string;
  /**
   * Run a shell command and await its completion. Resolves with a
   * {@link BashResult} of `{ stdout, stderr, code }`; a non-zero exit code is
   * returned as data, never thrown. The child's stdin is ignored (interactive
   * commands fail fast), and the command runs ungated by the permission
   * extension (the flow's trust gate is the security boundary). Output is
   * buffered unbounded — redirect to a file inside the command for huge output.
   *
   * Rejects with the flow's cancellation error (and kills the process group)
   * when the whole run is cancelled, and with a {@link BashTimeoutError}
   * (carrying partial `stdout`/`stderr`) when `opts.timeoutMs` elapses.
   *
   * @param cmd  Shell command (run through the same shell resolution as pi's bash tool).
   * @param opts `{ cwd?: string; timeoutMs?: number }`. `cwd` defaults to `af.cwd`.
   */
  bash(
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number },
  ): Promise<BashResult>;
  /**
   * Type guard for a {@link BashTimeoutError} thrown by {@link bash}. Use this
   * in a `catch` instead of an uncheckable `err.name === "BashTimeoutError"`
   * string compare: it narrows `unknown` catch clauses to `BashTimeoutError`
   * (exposing `.stdout`/`.stderr`) and is verified by `agentflow_validate`, so
   * a typo can't silently disable the timeout branch.
   *
   * @example
   * try {
   *   await af.bash(cmd, { timeoutMs: 1000 });
   * } catch (err) {
   *   if (af.isBashTimeoutError(err)) {
   *     af.log("timed out; partial stdout:", err.stdout);
   *   } else {
   *     throw err;
   *   }
   * }
   */
  isBashTimeoutError(error: unknown): error is BashTimeoutError;
}

declare global {
  const af: AgentFlow;
}
