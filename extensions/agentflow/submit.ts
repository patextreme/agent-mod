/**
 * submit.ts — The typed submitted-result surface for AgentFlow.
 *
 * Holds the schema-gated `submit_result` tool (`buildSubmitTool`), the shared
 * submission slot, ``deepCopy``, and the `FlowAgentHandle` drive methods that
 * read/clear a submitted value. Kept free of any *runtime* import from
 * `@earendil-works/pi-coding-agent` (only type imports) so the module — and its
 * unit tests — run under `tsx`, which cannot resolve that package's `exports`
 * from a `.ts` file. The runtime (`runtime.ts`) imports and re-exports these.
 */

import type {
  AgentSession,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type TSchema, Type } from "typebox";
import type { FlowAgent, SendMessageOptions } from "./agentflow.js";

/**
 * The per-agent submission slot backing `submittedResult()` / `clearResult()`.
 * Shared between the `submit_result` tool's `execute` closure and the handle so
 * a submission written by the tool is readable (as a copy) through the handle.
 */
export interface SubmissionSlot {
  value: unknown;
  set: boolean;
}

/** Create a fresh, empty submission slot. */
export function createSubmissionSlot(): SubmissionSlot {
  return { value: undefined, set: false };
}

/**
 * Ensure the `submit_result` tool is in the agent's active-tool allowlist when
 * a `resultSchema` is provided. The SDK's `tools` field is an allowlist that
 * also determines the active set, so merely registering the tool via
 * `customTools` is not enough for the agent to see it — the tool name must be
 * present in the allowlist too. Returns the input list unchanged when no
 * `resultSchema` is present (so no tool is ever activated without one).
 */
export function includeSubmitToolActive(
  tools: string[],
  hasResultSchema: boolean,
): string[] {
  if (!hasResultSchema) return tools;
  return tools.includes("submit_result") ? tools : [...tools, "submit_result"];
}

/** Deep-copy a value: `structuredClone`, falling back to a JSON round-trip. */
export function deepCopy<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/**
 * Build the schema-gated `submit_result` tool, or `undefined` when no
 * `resultSchema` is provided (so no tool is injected). The tool's `execute`
 * stores the validated `value` into the shared `slot` and emits a submission
 * log line via `onEmit`. Schema-shape enforcement is delegated to the SDK's
 * built-in tool-argument validation, which rejects a malformed value so the
 * agent can observe the error and retry.
 */
export function buildSubmitTool(
  agentName: string,
  resultSchema: TSchema | undefined,
  slot: SubmissionSlot,
  onEmit: (line: string) => void,
): ToolDefinition | undefined {
  if (!resultSchema) return undefined;
  return {
    name: "submit_result",
    label: "Submit result",
    description:
      "Submit a structured result value back to the flow. The value is validated against the flow-declared schema; a malformed value is rejected so you can fix it and retry. Each call overwrites the previous submitted value.",
    promptSnippet:
      "`submit_result` — submit a structured result value back to the flow (overwrites the previous value).",
    promptGuidelines: [
      "Use `submit_result` to hand the final structured result back to the flow instead of only writing prose.",
      "Each `submit_result` call overwrites the previously submitted value.",
      "The `value` must conform to the declared schema; if you get a validation error, fix the value and retry.",
    ],
    parameters: Type.Object({ value: resultSchema }),
    execute: async (_toolCallId, params) => {
      // `params` is statically `Static<TSchema>` (unknown); the flow-declared
      // result value is the `.value` key of the wrapper object.
      const { value } = params as { value: unknown };
      slot.value = value;
      slot.set = true;
      onEmit(`agent "${agentName}" submitted a result`);
      return {
        content: [{ type: "text", text: "Result submitted." }],
        details: undefined,
      };
    },
  };
}

/** A thin flow-agent handle wrapping one `createAgentSession` sub-session. */
export class FlowAgentHandle<T = unknown> implements FlowAgent<T> {
  readonly name: string;
  readonly session: AgentSession;
  private lastResult: string | undefined;
  private disposed = false;
  private submission: SubmissionSlot;

  constructor(
    name: string,
    session: AgentSession,
    submission: SubmissionSlot = createSubmissionSlot(),
  ) {
    this.name = name;
    this.session = session;
    this.submission = submission;
  }

  get result(): string | undefined {
    return this.lastResult;
  }

  get sessionFile(): string | undefined {
    return this.session.sessionFile;
  }

  /**
   * The most recent value the agent submitted via `submit_result`, or
   * `undefined` when none has been submitted (or the result was cleared).
   * Returns a deep copy so mutating it never aliases the handle's stored value.
   */
  submittedResult(): T | undefined {
    if (!this.submission.set) return undefined;
    return deepCopy(this.submission.value) as T;
  }

  /** Reset the stored submitted value to `undefined`. */
  clearResult(): void {
    this.submission.value = undefined;
    this.submission.set = false;
  }

  /**
   * Send a message and block until the step fully completes; returns the final
   * text. Always delivers in order: while the agent is streaming, the message
   * is queued (streamingBehavior "followUp") and `waitForIdle()` provides the
   * blocking until the current work settles.
   */
  async sendMessage(text: string, opts?: SendMessageOptions): Promise<string> {
    if (this.disposed)
      throw new Error(`AgentFlow: "${this.name}" is disposed.`);
    const images = opts?.images?.length ? opts.images : undefined;
    await this.session.prompt(text, {
      images,
      streamingBehavior: "followUp",
    });
    await this.session.waitForIdle();
    this.lastResult = this.session.getLastAssistantText();
    return this.lastResult ?? "";
  }

  /**
   * Internal steering only (used by the Orchestrator to forward a main-session
   * message into a running sub-agent). Not part of the public `FlowAgent`
   * interface, so flow scripts cannot steer.
   */
  async sendSteer(text: string): Promise<string> {
    if (this.disposed)
      throw new Error(`AgentFlow: "${this.name}" is disposed.`);
    await this.session.prompt(text, { streamingBehavior: "steer" });
    await this.session.waitForIdle();
    this.lastResult = this.session.getLastAssistantText();
    return this.lastResult ?? "";
  }

  /** Cancel the sub-agent mid-run. */
  async abort(): Promise<void> {
    await this.session.abort();
  }

  /** Release the underlying sub-session. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
  }
}
