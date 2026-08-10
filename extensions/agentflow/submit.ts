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

/** Error message used when a run is cancelled by the user from the UI. */
export const FLOW_CANCELLED_ERROR = "cancelled by user";

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
  /** Set when the Orchestrator stops this agent; the handle then rejects new messages. */
  private stopped = false;
  /**
   * Serializes prompt turns on this session. Without it, a human steer issued
   * from the Orchestrator while the flow's `await agent.sendMessage(...)` is in
   * flight interleaves on the shared session and overwrites `lastResult` with
   * the wrong turn's text, silently corrupting the flow's control flow.
   */
  private driveLock: Promise<unknown> = Promise.resolve();
  private submission: SubmissionSlot;
  /** Live check for flow-level cancellation (wired by the FlowRunner). */
  private isFlowCancelled: (() => boolean) | undefined;
  /** Notified once on dispose so the runner can retire the record. */
  private onDispose?: () => void;
  /** Notified when a genuine turn failure (not a stop/cancel) is observed. */
  private onTurnError?: (detail: string) => void;

  constructor(
    name: string,
    session: AgentSession,
    submission: SubmissionSlot = createSubmissionSlot(),
    isFlowCancelled?: () => boolean,
    onDispose?: () => void,
    onTurnError?: (detail: string) => void,
  ) {
    this.name = name;
    this.session = session;
    this.submission = submission;
    this.isFlowCancelled = isFlowCancelled;
    this.onDispose = onDispose;
    this.onTurnError = onTurnError;
  }

  /** True once the Orchestrator stopped this agent. */
  get isStopped(): boolean {
    return this.stopped;
  }

  private assertSendable(): void {
    if (this.disposed)
      throw new Error(`AgentFlow: "${this.name}" is disposed.`);
    if (this.stopped)
      throw new Error(
        `AgentFlow: agent "${this.name}" was stopped \u2014 it can no longer receive messages.`,
      );
    if (this.isFlowCancelled?.())
      throw new Error(`AgentFlow: ${FLOW_CANCELLED_ERROR}`);
  }

  /**
   * Report a genuine turn failure (a model/tool crash during `prompt`/
   * `waitForIdle`) to the runner so the agent is marked errored in the fleet.
   * A rejection caused by an explicit stop or a flow-level cancel is a
   * *consequence* of the cancellation, not a failure, so it is ignored here —
   * those set `stopped`/`cancelled` first, which is what we check.
   */
  private markTurnErrorIfGenuine(err: unknown): void {
    if (this.stopped || this.isFlowCancelled?.()) return;
    this.onTurnError?.(err instanceof Error ? err.message : String(err));
  }

  /**
   * Run `fn` as the next exclusive "turn" on this session: one prompt at a
   * time. A steer and the flow's own sendMessage serialize, so neither can
   * observe or overwrite the other's `lastResult`. `abort`/`stop`/`dispose`
   * deliberately bypass this so they can interrupt an in-flight turn.
   */
  private drive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.driveLock.then(fn, fn);
    // Swallow this step's outcome for the NEXT step's gate so a rejecting turn
    // doesn't poison every subsequent one (the caller still sees the rejection
    // via `run`).
    this.driveLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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
    return this.drive(async () => {
      this.assertSendable();
      const images = opts?.images?.length ? opts.images : undefined;
      try {
        await this.session.prompt(text, {
          images,
          streamingBehavior: "followUp",
        });
        await this.session.waitForIdle();
      } catch (err) {
        this.markTurnErrorIfGenuine(err);
        throw err;
      }
      // A cancel that arrived mid-turn — either an individual stop() setting
      // this.stopped + abort() or a flow-level cancel — must reject this step,
      // not resolve with partial text and let the flow script walk into its
      // next step.
      if (this.stopped)
        throw new Error(
          `AgentFlow: agent "${this.name}" was stopped \u2014 it can no longer receive messages.`,
        );
      if (this.isFlowCancelled?.())
        throw new Error(`AgentFlow: ${FLOW_CANCELLED_ERROR}`);
      this.lastResult = this.session.getLastAssistantText();
      return this.lastResult ?? "";
    });
  }

  /**
   * Internal steering only (used by the Orchestrator to forward a main-session
   * message into a running sub-agent). Not part of the public `FlowAgent`
   * interface, so flow scripts cannot steer.
   */
  async sendSteer(text: string): Promise<string> {
    return this.drive(async () => {
      this.assertSendable();
      try {
        await this.session.prompt(text, { streamingBehavior: "steer" });
        await this.session.waitForIdle();
      } catch (err) {
        this.markTurnErrorIfGenuine(err);
        throw err;
      }
      if (this.stopped)
        throw new Error(
          `AgentFlow: agent "${this.name}" was stopped \u2014 it can no longer receive messages.`,
        );
      if (this.isFlowCancelled?.())
        throw new Error(`AgentFlow: ${FLOW_CANCELLED_ERROR}`);
      this.lastResult = this.session.getLastAssistantText();
      return this.lastResult ?? "";
    });
  }

  /**
   * Cancel the sub-agent mid-run. Clears the steer/follow-up queues first so
   * queued messages cannot resurrect the agent right after the abort (the
   * agent loop would otherwise continue with them once the run settles).
   */
  async abort(): Promise<void> {
    this.session.clearQueue();
    await this.session.abort();
  }

  /**
   * Orchestrator-only stop: abort and permanently reject further messages for
   * this run, so a flow script cannot silently revive a stopped agent. Not
   * part of the public `FlowAgent` interface.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.abort();
  }

  /** Release the underlying sub-session and notify the runner to retire it. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
    this.onDispose?.();
  }
}
