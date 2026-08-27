/**
 * runtime.ts — The AgentFlow runtime layer that owns the SDK imports.
 *
 * Spawns isolated `createAgentSession` sub-sessions for `FlowRunner` (via
 * the injected `RunnerServices.spawnSession`) and re-exports the testable,
 * SDK-runtime-free `runner.ts` surface (`FlowRunner`, record/event types,
 * `executeFlowScript`) plus the `submit.ts` submitted-result surface, so
 * existing `./runtime.js` imports keep working.
 */

import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { SpawnSessionOptions } from "./runner.js";

// Re-export the `af.bash` execution surface (SDK-free spawn/collect + kill).
export {
  type BashResult,
  BashTimeoutError,
  killProcessTree,
  runCommand,
  type ShellConfig,
} from "./exec.js";
// Re-export the runner surface so runtime consumers (orchestrator, index,
// and the shipped runtime interface) keep working through this module path.
export {
  type AgentStatus,
  executeFlowScript,
  type FlowAgentRecord,
  FlowRunner,
  type FlowRunnerEvent,
  type RunnerServices,
  renderFlowValue,
  type SpawnSessionOptions,
} from "./runner.js";
// Re-export the submitted-result surface (kept here for compatibility).
export {
  buildSubmitTool,
  createSubmissionSlot,
  deepCopy,
  FLOW_CANCELLED_ERROR,
  FlowAgentHandle,
  includeSubmitToolActive,
  type SubmissionSlot,
} from "./submit.js";

/**
 * Spawn one isolated flow-agent sub-session. Resources are stripped to the
 * minimum (no extensions, skills, themes, or context files) and the system
 * prompt is fixed by the caller, so sub-agents are deterministic workers.
 */
export async function spawnAgentSession(
  opts: SpawnSessionOptions,
): Promise<AgentSession> {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(opts.cwd, agentDir);
  const sessionManager = opts.persist
    ? SessionManager.create(opts.cwd)
    : SessionManager.inMemory(opts.cwd);

  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => opts.systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir,
    sessionManager,
    settingsManager,
    resourceLoader: loader,
    ...(opts.model !== undefined ? { model: opts.model as never } : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.customTools ? { customTools: opts.customTools } : {}),
  });

  return session;
}
