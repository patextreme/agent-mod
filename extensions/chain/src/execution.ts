import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ChainDefinition, ChainStep } from "./loader.js";

export async function waitForTurnStart(ctx: ExtensionContext) {
  while (ctx.isIdle()) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export async function waitForIdleAndEmptyQueue(ctx: ExtensionCommandContext) {
  while (true) {
    await ctx.waitForIdle();
    if (!ctx.hasPendingMessages()) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function resetContext(ctx: ExtensionCommandContext, initLeafId: string) {
  if (initLeafId) {
    ctx.navigateTree(initLeafId, {
      summarize: false,
      replaceInstructions: true,
    });
  }
}

export function enableTool(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (!active.includes(toolName)) {
    pi.setActiveTools([...active, toolName]);
  }
}

export function disableTool(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (active.includes(toolName)) {
    pi.setActiveTools(active.filter((t) => t !== toolName));
  }
}

export interface ChainState {
  isExitToolCalled: boolean;
  isUserAborted: boolean;
}

/**
 * Evaluate an exit prompt condition by enabling the chain_exit tool,
 * sending the evaluation message, and checking if chain_exit was called.
 * Returns true if the exit condition was met (chain_exit called).
 *
 * Does NOT reset context — the caller decides whether to reset based on the result.
 */
export async function evaluateExitPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: ChainState,
  condition: string,
): Promise<boolean> {
  const messageLeafId = ctx.sessionManager.getLeafId();
  if (!messageLeafId) return false;

  enableTool(pi, "chain_exit");
  const evalPrompt = `You will check the following condition. If the condition is met, please call the chain_exit tool; otherwise, do nothing.

---
Condition: ${condition}
---`;
  pi.sendUserMessage(evalPrompt);
  await waitForTurnStart(ctx);
  await waitForIdleAndEmptyQueue(ctx);
  disableTool(pi, "chain_exit");

  return state.isExitToolCalled;
}

/**
 * Evaluate an exit prompt for step-level use.
 * If the exit condition is NOT met (chain_exit not called), resets context
 * to before the evaluation so the model's context is unaffected.
 * Returns true if the exit condition was met (chain_exit called).
 */
export async function evaluateStepExitPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: ChainState,
  condition: string,
): Promise<boolean> {
  const messageLeafId = ctx.sessionManager.getLeafId();
  const exitCalled = await evaluateExitPrompt(pi, ctx, state, condition);
  if (!exitCalled && messageLeafId) {
    resetContext(ctx, messageLeafId);
  }
  return exitCalled;
}

export async function executeChain(
  pi: ExtensionAPI,
  name: string,
  definition: ChainDefinition,
  args: string,
  ctx: ExtensionCommandContext,
  state: ChainState,
  chainDefinitions: Record<string, ChainDefinition>,
  options?: { depth?: number },
): Promise<void> {
  // Reset exit state for each chain invocation.
  // isUserAborted is NOT reset here — it must propagate across callChain invocations.
  // It is reset in the command handler before the initial executeChain call.
  state.isExitToolCalled = false;

  // Ensure chain_exit is not active at chain start
  disableTool(pi, "chain_exit");

  const chainRootLeafId = ctx.sessionManager.getLeafId();
  if (!chainRootLeafId) return;

  const steps: ChainStep[] = definition.steps.map((step) => {
    if (step.type === "prompt") {
      return {
        ...step,
        prompt: step.prompt.replaceAll("$ARGUMENTS", args),
      };
    }
    if (step.type === "exitPrompt") {
      return {
        ...step,
        exitPrompt: step.exitPrompt.replaceAll("$ARGUMENTS", args),
      };
    }
    if (step.type === "callChain") {
      return {
        ...step,
        argument: (step.argument ?? "").replaceAll("$ARGUMENTS", args),
      };
    }
    return step;
  });

  const loopN = definition.loop ?? 1;
  const totalSteps = steps.length;

  // Execute step/loop
  for (let loopIdx = 0; loopIdx < loopN; loopIdx++) {
    resetContext(ctx, chainRootLeafId);

    await waitForIdleAndEmptyQueue(ctx);
    for (const [stepIdx, step] of steps.entries()) {
      ctx.ui.setStatus(
        "chain",
        `chain: ${name} ${stepIdx + 1}/${totalSteps} step ${loopIdx + 1}/${loopN} loop`,
      );

      if (state.isUserAborted || state.isExitToolCalled) break;

      if (step.type === "prompt") {
        // Send prompt message
        pi.sendUserMessage(step.prompt);
        await waitForTurnStart(ctx);
        await waitForIdleAndEmptyQueue(ctx);
      } else if (step.type === "exitPrompt") {
        // Evaluate exit prompt (step-level)
        const exitCalled = await evaluateStepExitPrompt(
          pi,
          ctx,
          state,
          step.exitPrompt,
        );
        if (exitCalled) break; // Break out of steps loop only — don't affect handoff
      } else if (step.type === "callChain") {
        // Invoke target chain as a subroutine
        const depth = options?.depth ?? 0;
        if (depth >= 10) {
          ctx.ui.notify(
            `[chain] callChain depth limit exceeded (${depth} >= 10), skipping step`,
            "error",
          );
          continue;
        }

        const targetDef = chainDefinitions[step.name];
        if (!targetDef) {
          ctx.ui.notify(
            `[chain] callChain target "${step.name}" not found, skipping step`,
            "error",
          );
          continue;
        }

        const parentLeafId = ctx.sessionManager.getLeafId() ?? chainRootLeafId;
        const savedExitState: boolean = state.isExitToolCalled;
        state.isExitToolCalled = false;

        await executeChain(
          pi,
          step.name,
          targetDef,
          step.argument ?? "",
          ctx,
          state,
          chainDefinitions,
          { depth: depth + 1 },
        );

        state.isExitToolCalled = savedExitState;
        resetContext(ctx, parentLeafId);
      }
    }

    if (state.isUserAborted || state.isExitToolCalled) break;
  }

  // Cleanup: ensure chain_exit is disabled after chain execution,
  // regardless of how the loop exited (normal completion, exit prompt,
  // or abort mid-evaluation).
  disableTool(pi, "chain_exit");
}
