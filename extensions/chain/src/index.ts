import { join } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type ChainState, disableTool, executeChain } from "./execution.js";
import { type ChainDefinition, loadChainDefinitions } from "./loader.js";

export default function chainExtension(pi: ExtensionAPI): void {
  const chainsDir = join(process.cwd(), ".pi", "chains");
  let loadWarnings: string[] = [];
  const chainDefinitions: Record<string, ChainDefinition> =
    loadChainDefinitions(
      chainsDir,
      (msg) => (loadWarnings = [...loadWarnings, msg]),
    );

  // Shared mutable state for the chain_exit tool and abort detection.
  // isExitToolCalled is reset at the start of each executeChain call.
  // isUserAborted is reset in the command handler before the initial executeChain call,
  // and propagates across chain handoffs (not reset in executeChain).
  const state: ChainState = {
    isUserAborted: false,
    isExitToolCalled: false,
  };

  // Surface chain loading warnings on session start/reload/fork.
  // Commands are registered once at init, so we only reload for warnings —
  // the definitions themselves don't need updating.
  pi.on("resources_discover", (_event, ctx) => {
    loadWarnings = [];
    loadChainDefinitions(
      chainsDir,
      (msg) => (loadWarnings = [...loadWarnings, msg]),
    );
    if (loadWarnings.length > 0) {
      ctx.ui.setStatus("chain", loadWarnings[0]);
    } else {
      ctx.ui.setStatus("chain", undefined);
    }
  });

  pi.registerTool({
    name: "chain_exit",
    label: "Exit Chain",
    description: "Exit the currently running prompt chain early",
    parameters: Type.Object({}),
    execute: async (): Promise<AgentToolResult<undefined>> => {
      state.isExitToolCalled = true;
      return {
        content: [
          {
            type: "text",
            text: "Chain exit requested. The chain will stop after this turn.",
          },
        ],
        details: undefined,
      };
    },
  });

  pi.on("session_start", () => {
    disableTool(pi, "chain_exit");
  });

  pi.on("turn_end", async (event: TurnEndEvent, _ctx: ExtensionContext) => {
    if (
      event.message.role === "assistant" &&
      event.message.stopReason === "aborted"
    ) {
      state.isUserAborted = true;
    }
  });

  for (const [name, definition] of Object.entries(chainDefinitions)) {
    pi.registerCommand(`chain-${name}`, {
      description: definition.description,
      handler: async (args, ctx) => {
        // Reset abort state for each new command invocation.
        // Must be fresh so a previous command's abort doesn't carry over.
        // (isExitToolCalled is reset inside executeChain.)
        state.isUserAborted = false;
        await executeChain(
          pi,
          name,
          definition,
          args,
          ctx,
          state,
          chainDefinitions,
        );
      },
    });
  }
}
