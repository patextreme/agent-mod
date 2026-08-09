/**
 * AgentFlow — scriptable orchestration of isolated sub-agents for pi.
 *
 * Invoke a flow with `/af <flow-name>`. AgentFlow resolves `.pi/agentflow/
 * <name>.ts` (project, trusted), then global `~/.pi/agentflow/<name>.ts`
 * (and `.js` variants), validates/type-checks it, and runs it alongside the
 * editor under the fleet widget (TUI): a live list of `main` + each
 * flow-agent below the editor, overlay conversation/log viewers, steering,
 * per-agent stop, and whole-run cancel. In non-TUI modes it runs without
 * the UI.
 *
 * Flows are imperative TS/JS scripts that get a single injected `af` global
 * (`createAgent`, `log`, `result`, `cwd`) and may appear in the docs as the
 * `/af:<name>` family; the runtime command is `/af <name>`.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  listFlowNames,
  readFlowScript,
  resolveFlowFile,
  typeCheckFlowScript,
  validateFlowSyntax,
} from "./discovery.js";
import { runNonTuiFlow, runTuiFlow } from "./orchestrator.js";
import {
  executeFlowScript,
  FLOW_CANCELLED_ERROR,
  FlowRunner,
  renderFlowValue,
  spawnAgentSession,
} from "./runtime.js";

/** Absolute path to this extension's directory. */
const here = dirname(fileURLToPath(import.meta.url));
const DECLARATIONS_PATH = join(here, "agentflow.d.ts");
/**
 * Directory containing the bundled agentflow authoring skill (`SKILL.md`).
 * Relative to the extension so it resolves identically in the repo (npm) and
 * in the Nix-built package output, where the extension and its skill ship
 * together. pi recurses into subdirectories looking for `SKILL.md`, so this
 * points at the `skills/` root and picks up `skills/agentflow/SKILL.md`.
 * Contributed to pi via `resources_discover` (skillPaths).
 */
const SKILLS_PATH = join(here, "skills");

/**
 * Display name of the currently running flow, or undefined. Only one flow
 * runs at a time; a second invocation is refused while one is active.
 */
let activeFlowName: string | undefined;

/**
 * Run an AgentFlow script end-to-end: resolve, validate, gate on trust,
 * execute under the fleet UI (TUI) or non-TUI path, and deliver the recorded
 * result back to the main session. Only one flow runs at a time.
 */
async function runAgentFlow(
  pi: ExtensionAPI,
  flowNameInput: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const name = flowNameInput.trim().replace(/^:/, "");
  if (!name) {
    ctx.ui.notify("Usage: /af <flow-name> — e.g. /af reviewcode", "warning");
    return;
  }

  // Only one flow runs at a time; the fleet widget owns the UI for the run.
  // Claim the slot BEFORE the async validation steps so a concurrent
  // invocation cannot slip through the guard.
  if (activeFlowName) {
    ctx.ui.notify(
      `AgentFlow "${activeFlowName}" is still running — wait for it, or cancel it (↓ to manage, then x on main).`,
      "warning",
    );
    return;
  }
  activeFlowName = name;
  try {
    // 1. Resolve the flow script (project → global, .ts → .js).
    const resolved = resolveFlowFile(name, ctx.cwd);
    if (!resolved) {
      ctx.ui.notify(
        `AgentFlow: no script found for "${name}" in .pi/agentflow/ or ~/.pi/agentflow/`,
        "error",
      );
      return;
    }

    // 2. Gate project-local scripts on project trust.
    if (resolved.isProject && !ctx.isProjectTrusted()) {
      ctx.ui.notify(
        `AgentFlow: project script "${resolved.path}" is not run because the project is not trusted.`,
        "error",
      );
      return;
    }

    // 3. Syntax-validate (aborts before any sub-agent is spawned).
    let transpiled: string;
    try {
      transpiled = validateFlowSyntax(
        readFlowScript(resolved.path),
        resolved.path,
      );
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
      return;
    }

    // 4. Type-check `.ts` scripts against the shipped declarations.
    if (resolved.isTypeScript) {
      try {
        await typeCheckFlowScript(
          resolved.path,
          readFlowScript(resolved.path),
          DECLARATIONS_PATH,
        );
      } catch (err) {
        ctx.ui.notify(
          err instanceof Error ? err.message : String(err),
          "error",
        );
        return;
      }
    }

    // 5. Build the runner and the injected `af` surface.
    const runner = new FlowRunner({
      ctx,
      resolveModel: (spec) => {
        const idx = spec.indexOf("/");
        if (idx === -1) return undefined;
        return ctx.modelRegistry.find(spec.slice(0, idx), spec.slice(idx + 1));
      },
      inheritTools: () => pi.getActiveTools(),
      spawnSession: spawnAgentSession,
    });
    const af = runner.buildAf();

    // Completion promise resolves to an error string, or undefined on success.
    // The listener is attached synchronously here, before `executeFlowScript`
    // below can call `runner.complete()`, so no fast-flow race is possible.
    const completion = new Promise<string | undefined>((resolve) => {
      const unsub = runner.subscribe((event) => {
        if (event.type === "complete") {
          unsub();
          resolve(event.error);
        }
      });
    });

    // 6. Run the script in the background; the fleet UI renders live.
    const scriptRun = executeFlowScript(transpiled, af).then(
      () => runner.complete(),
      (err: unknown) =>
        runner.complete(err instanceof Error ? err.message : String(err)),
    );

    try {
      // 7. Block until the run finishes (TUI) or just drive it (non-TUI).
      if (ctx.hasUI && ctx.mode === "tui") {
        await runTuiFlow(
          ctx,
          runner,
          name,
          completion,
          (agentId) => void stopAgent(runner, agentId),
          (agentId, message) =>
            void steerAgent(runner, agentId, message, (msg, type) =>
              ctx.ui.notify(msg, type),
            ),
          () => runner.cancel(),
        );
      } else {
        await runNonTuiFlow(runner);
      }
      await scriptRun;
    } finally {
      for (const record of runner.agents) record.handle.dispose();
    }

    // 8. Deliver the recorded result (or the error) back to the main session.
    const error = await completion;
    deliverResult(pi, name, runner, error);
  } finally {
    activeFlowName = undefined;
  }
}

/**
 * Stop a running flow-agent: abort it (dropping queued messages so it cannot
 * resurrect) and reject any further messages for this run, so the flow script
 * unwinds instead of silently reviving it.
 */
async function stopAgent(runner: FlowRunner, agentId: string): Promise<void> {
  const record = runner.agents.find((a) => a.id === agentId);
  if (!record) return;
  try {
    await record.handle.stop();
  } finally {
    runner.markStopped(agentId);
  }
}

/** Send a steering message to a running flow-agent. */
async function steerAgent(
  runner: FlowRunner,
  agentId: string,
  message: string,
  notify?: (message: string, type: "info" | "warning" | "error") => void,
): Promise<void> {
  const record = runner.agents.find((a) => a.id === agentId);
  if (!record) return;
  try {
    await record.handle.sendSteer(message);
  } catch (err) {
    notify?.(
      `AgentFlow: steering "${record.name}" failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "warning",
    );
  }
}

/** Inject the flow outcome into the main session as a visible custom message. */
function deliverResult(
  pi: ExtensionAPI,
  name: string,
  runner: FlowRunner,
  error: string | undefined,
): void {
  const { value, set } = runner.recordedResult;
  if (error === FLOW_CANCELLED_ERROR) {
    pi.sendMessage({
      customType: "agentflow",
      content: `AgentFlow "${name}" was cancelled by the user.`,
      display: true,
    });
  } else if (error) {
    pi.sendMessage({
      customType: "agentflow",
      content: `AgentFlow "${name}" failed: ${error}`,
      display: true,
    });
  } else if (set) {
    pi.sendMessage({
      customType: "agentflow",
      content: `AgentFlow "${name}" result:\n\n${renderFlowValue(value)}`,
      display: true,
    });
  } else {
    pi.sendMessage({
      customType: "agentflow",
      content: `AgentFlow "${name}" completed without a result.`,
      display: true,
    });
  }
}

/**
 * Register a `/af:<name>` shortcut command for every discoverable flow.
 * Mirrors pi-taskflow's approach: pi resolves slash commands by exact name but
 * `pi.registerCommand` may be called any time (not just at load), and lookups
 * re-read the registry per call — so registering concrete per-flow names on
 * session start makes `/af:<name>` work for every flow already on disk.
 */
function registerFlowCommands(pi: ExtensionAPI, cwd: string): void {
  for (const name of listFlowNames(cwd)) {
    pi.registerCommand(`af:${name}`, {
      description: `Run AgentFlow script "${name}"`,
      handler: async (_args, ctx) => {
        await runAgentFlow(pi, name, ctx);
      },
    });
  }
}

export default function agentFlowExtension(pi: ExtensionAPI): void {
  // Make pi load the bundled authoring skill whenever this extension is loaded
  // (Nix mounts the extension dir standalone, so the package.json `pi.skills`
  // manifest isn't consulted there; this hook is the single discovery path).
  pi.on("resources_discover", () => ({
    skillPaths: [SKILLS_PATH],
  }));

  pi.registerCommand("af", {
    description:
      "Run an AgentFlow script (usage: /af <flow-name>). Resolves .pi/agentflow/<name>.(ts|js) then ~/.pi/agentflow/<name>.(ts|js).",
    handler: async (args, ctx) => {
      await runAgentFlow(pi, args, ctx);
    },
  });

  // Register `/af:<name>` shortcuts for already-discovered flows. The generic
  // `/af <name>` command above remains the fallback for flows created after
  // session start.
  pi.on("session_start", async (_event, ctx) => {
    registerFlowCommands(pi, ctx.cwd);
  });
}
