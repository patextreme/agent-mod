import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { findMatchingRule, PERMISSION_RULES } from "./rules.js";

// Play the vendored bell sound via pw-play. Best-effort: any failure
// (missing binary, audio daemon down, etc.) is swallowed so audio can
// never block or break the permission prompt.
function playBell(): void {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const soundPath = join(here, "sounds", "message.oga");
    const data = readFileSync(soundPath);
    const proc = spawn("pw-play", ["-"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    proc.on("error", () => {});
    proc.stdin.on("error", () => {});
    proc.stdin.end(data);
  } catch {
    // ignore
  }
}

// YOLO mode: while enabled, every bash command is allowed without
// consulting permission rules or prompting (bypasses allow/ask/deny and
// the no-match prompt). Session-scoped: reset on session_start and by
// /permission-reset, and enabling requires an explicit confirmation.
let yoloEnabled = false;

const YOLO_STATUS_KEY = "permission-yolo";
const YOLO_STATUS_TEXT = "⚠️ YOLO MODE ON";

// Write (or clear) the persistent footer warning. Called from every state
// transition so the footer never lies. Idempotent.
function setYoloStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(
    YOLO_STATUS_KEY,
    yoloEnabled ? ctx.ui.theme.fg("warning", YOLO_STATUS_TEXT) : undefined,
  );
}

// Enable YOLO mode. Refused without a UI (nothing to confirm against);
// otherwise gated on an explicit confirmation dialog.
async function enableYolo(ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify(
      "Cannot enable YOLO mode: no UI available for confirmation.",
      "error",
    );
    return;
  }

  const ok = await ctx.ui.confirm(
    "⚠️ Enable YOLO mode?",
    "ALL permission checks will be bypassed — every command runs without asking.",
  );
  if (!ok) return;

  yoloEnabled = true;
  setYoloStatus(ctx);
}

// Disable YOLO mode and clear the warning. Safe to call when already off.
function disableYolo(ctx: ExtensionContext): void {
  yoloEnabled = false;
  setYoloStatus(ctx);
}

export default function permissionExtension(pi: ExtensionAPI): void {
  const isSandbox = process.env.PI_SANDBOX === "true";
  const alwaysAllowed: Set<number> = new Set();

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    // YOLO mode: allow every bash command before any rule evaluation,
    // sandbox check, or prompting (design D1).
    if (yoloEnabled) return undefined;

    const command = (event.input.command as string) || "";
    const rule = findMatchingRule(command);

    // If a rule matches and it's "allow", proceed without asking
    if (rule && rule.action === "allow") return undefined;

    // If a rule matches and it's "deny", block immediately
    if (rule && rule.action === "deny") {
      return {
        block: true,
        reason: `Command matches deny rule ${rule.regex}: ${command}`,
      };
    }

    // If a rule matches and it's "ask", check always-allow or prompt the user
    if (rule && rule.action === "ask") {
      if (alwaysAllowed.has(rule.id)) {
        return undefined;
      }

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Command matches permission rule ${rule.regex} - no UI for confirmation`,
        };
      }

      playBell();
      const choice = await ctx.ui.select(
        `⚠️ Command matches permission rule ${rule.regex}:\n\n  ${command}\n\nAllow?`,
        ["Yes", "Always allow", "No"],
      );

      if (choice === "Always allow") {
        alwaysAllowed.add(rule.id);
        return undefined;
      }

      if (choice !== "Yes") {
        return {
          block: true,
          reason: `User denied command: ${command}`,
        };
      }

      return undefined;
    }

    // No rule matches - check if we're in a sandbox
    if (isSandbox) {
      // In sandbox, allow by default
      return undefined;
    }

    // Outside sandbox, ask the user
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `No permission rule matches command - no UI for confirmation`,
      };
    }

    playBell();
    const choice = await ctx.ui.select(
      `⚠️ No permission rule matches command:\n\n  ${command}\n\nAllow?`,
      ["Yes", "No"],
    );

    if (choice !== "Yes") {
      return {
        block: true,
        reason: `User denied command: ${command}`,
      };
    }

    return undefined;
  });

  // List all always-allowed command patterns
  pi.registerCommand("permission-list-always-allow", {
    description: "List all currently always-allowed command patterns",
    handler: async (_args, ctx) => {
      if (alwaysAllowed.size === 0) {
        ctx.ui.notify("No commands are currently always-allowed.", "info");
        return;
      }

      const lines = Array.from(alwaysAllowed)
        .sort((a, b) => a - b)
        .map((id) => {
          const rule = PERMISSION_RULES.find((r) => r.id === id);
          return rule ? `  ${rule.regex}` : `  Rule #${id} (not found)`;
        });

      ctx.ui.notify(`Always-allowed patterns:\n${lines.join("\n")}`, "info");
    },
  });

  // Toggle YOLO mode (bypass ALL permission checks for this session)
  pi.registerCommand("permission-yolo", {
    description:
      "Toggle YOLO mode: bypass ALL permission checks (session-scoped)",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg !== "" && arg !== "on" && arg !== "off") {
        ctx.ui.notify("Usage: /permission-yolo [on|off]", "error");
        return;
      }

      // Resolve the target state: bare toggles, on/off set explicitly.
      const target = arg === "" ? !yoloEnabled : arg === "on";

      // Idempotent explicit set is a no-op (design D4). No notify on any
      // successful transition — the status bar is the feedback.
      if (target === yoloEnabled) return;

      if (target) {
        await enableYolo(ctx);
      } else {
        disableYolo(ctx);
      }
    },
  });

  // Reset all always-allowed permissions
  pi.registerCommand("permission-reset", {
    description: "Reset all always-allowed permissions",
    handler: async (_args, ctx) => {
      alwaysAllowed.clear();
      disableYolo(ctx);
      ctx.ui.notify("All always-allowed permissions have been reset.", "info");
    },
  });

  // Reset always-allow permissions when a new session starts, and make
  // sure YOLO mode never survives into a new session unnoticed.
  pi.on("session_start", async (_event, ctx) => {
    alwaysAllowed.clear();
    disableYolo(ctx);
  });

  // Ring the bell when the agent loop ends naturally, so the user knows
  // it's their turn again without watching the screen. Suppress the bell
  // when the user aborted the run — they already know they stopped it.
  // event.messages always contains at least one assistant message: a
  // normal run ends on a final assistant turn, and a failure before any
  // response is synthesized in handleRunFailure with stopReason "aborted"
  // or "error", so iterating from the end is reliable.
  pi.on("agent_end", (event) => {
    for (let i = event.messages.length - 1; i >= 0; i--) {
      const message = event.messages[i];
      if (message.role === "assistant") {
        if (message.stopReason === "aborted") return;
        break;
      }
    }
    playBell();
  });
}
