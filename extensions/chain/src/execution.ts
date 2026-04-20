import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
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
): Promise<void> {
  // Reset exit state for each chain invocation.
  // isUserAborted is NOT reset here — it must propagate across chain handoffs.
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
    return {
      ...step,
      exitPrompt: step.exitPrompt.replaceAll("$ARGUMENTS", args),
    };
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
      } else {
        // Evaluate exit prompt (step-level)
        const exitCalled = await evaluateStepExitPrompt(
          pi,
          ctx,
          state,
          step.exitPrompt,
        );
        if (exitCalled) break; // Break out of steps loop only — don't affect handoff
      }
    }

    if (state.isUserAborted || state.isExitToolCalled) break;
  }

  // Cleanup: disable chain_exit after step execution
  disableTool(pi, "chain_exit");

  // Reset exit state after loop — step-level exit only breaks the loop,
  // it should not prevent handoff
  state.isExitToolCalled = false;

  // Handle handoff
  if (state.isUserAborted) return;

  const handoffTarget = definition.handoffTarget;
  if (handoffTarget === undefined) return; // No handoff — chain stops normally

  // Conditional handoff: evaluate handoffExitPrompt if present
  if (definition.handoffExitPrompt !== undefined) {
    const handoffCondition = definition.handoffExitPrompt.replaceAll(
      "$ARGUMENTS",
      args,
    );

    // Reset exit state before evaluating handoff condition
    state.isExitToolCalled = false;
    const exitCalled = await evaluateExitPrompt(
      pi,
      ctx,
      state,
      handoffCondition,
    );
    disableTool(pi, "chain_exit");
    if (exitCalled) {
      // Handoff skipped — workflow aborts
      return;
    }
    if (state.isUserAborted) {
      // User aborted during handoff evaluation — stop the workflow
      return;
    }
  }

  // Look up target chain
  const targetDefinition = chainDefinitions[handoffTarget];
  if (targetDefinition === undefined) {
    ctx.ui.setStatus("chain", `chain: ${name} → ${handoffTarget} (not found)`);
    return;
  }

  // Show handoff transition
  ctx.ui.setStatus("chain", `chain: ${name} → ${handoffTarget}`);

  if (state.isUserAborted) return;

  // Reset context to this chain's root before handing off, giving the
  // target chain a clean slate (also clears any handoffExitPrompt
  // evaluation messages from the tree)
  resetContext(ctx, chainRootLeafId);

  // Recurse into the target chain
  await executeChain(
    pi,
    handoffTarget,
    targetDefinition,
    args,
    ctx,
    state,
    chainDefinitions,
  );
}
