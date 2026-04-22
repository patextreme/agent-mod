import { homedir } from "node:os";
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
  // Shared mutable state for the chain_exit tool and abort detection.
  // isExitToolCalled is reset at the start of each executeChain call.
  // isUserAborted is reset in the command handler before the initial executeChain call,
  // and propagates across chain handoffs (not reset in executeChain).
  const state: ChainState = {
    isUserAborted: false,
    isExitToolCalled: false,
  };

  let loadWarnings: string[] = [];
  let chainDefinitions: Record<string, ChainDefinition> = {};
  const registeredChains = new Set<string>();

  function refreshChainDefinitions(cwd: string) {
    const globalChainsDir = join(homedir(), ".pi", "chains");
    const localChainsDir = join(cwd, ".pi", "chains");

    let globalWarnings: string[] = [];
    const globalChains = loadChainDefinitions(
      globalChainsDir,
      (msg) => (globalWarnings = [...globalWarnings, msg]),
    );

    let localWarnings: string[] = [];
    const localChains = loadChainDefinitions(
      localChainsDir,
      (msg) => (localWarnings = [...localWarnings, msg]),
    );

    loadWarnings = [...globalWarnings, ...localWarnings];
    chainDefinitions = { ...globalChains, ...localChains };
  }

  function registerMissingChainCommands() {
    for (const [name, definition] of Object.entries(chainDefinitions)) {
      if (registeredChains.has(name)) {
        continue;
      }
      registeredChains.add(name);
      pi.registerCommand(`chain-${name}`, {
        description: definition.description,
        handler: async (args, ctx) => {
          const def = chainDefinitions[name];
          if (!def) {
            ctx.ui.notify(`Chain "${name}" is no longer available.`, "error");
            return;
          }

          // Reset abort state for each new command invocation.
          // Must be fresh so a previous command's abort doesn't carry over.
          // (isExitToolCalled is reset inside executeChain.)
          state.isUserAborted = false;
          await executeChain(pi, name, def, args, ctx, state, chainDefinitions);
        },
      });
    }
  }

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

  // Re-scan chains whenever resources are discovered (startup / reload).
  pi.on("resources_discover", (event, ctx) => {
    refreshChainDefinitions(event.cwd);
    registerMissingChainCommands();
    if (loadWarnings.length > 0) {
      ctx.ui.setStatus("chain", loadWarnings[0]);
    } else {
      ctx.ui.setStatus("chain", undefined);
    }
  });

  pi.on("turn_end", async (event: TurnEndEvent, _ctx: ExtensionContext) => {
    if (
      event.message.role === "assistant" &&
      event.message.stopReason === "aborted"
    ) {
      state.isUserAborted = true;
    }
  });
}
