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

const YOLO_STATUS_KEY = "permission-yolo";
const YOLO_STATUS_TEXT = "⚠️ YOLO MODE ON";

export default function permissionExtension(pi: ExtensionAPI): void {
  const isSandbox = process.env.PI_SANDBOX === "true";
  const alwaysAllowed: Set<number> = new Set();

  // --yolo CLI flag: pin YOLO mode on for the entire process run. Unlike
  // the /permission-yolo toggle, the pin is not reset by session_start or
  // /permission-reset, cannot be turned off mid-session, and works in
  // headless runs (-p / --mode json) where there is no UI to prompt — the
  // flag itself is the explicit, typed opt-in.
  pi.registerFlag("yolo", {
    description:
      "Start with YOLO mode pinned on: bypass ALL permission checks (works headless)",
    type: "boolean",
    default: false,
  });

  // Live read: flag values are applied after extension factories run, so
  // this must be evaluated lazily, never captured at init.
  const yoloPinned = (): boolean => pi.getFlag("yolo") === true;

  // YOLO mode: while active, every bash command is allowed without
  // consulting permission rules or prompting (bypasses allow/ask/deny and
  // the no-match prompt). Active when the session toggle is on OR the
  // --yolo flag pinned it. The toggle is session-scoped: reset on
  // session_start and by /permission-reset.
  let yoloEnabled = false;
  const yoloActive = (): boolean => yoloEnabled || yoloPinned();

  // Write (or clear) the persistent footer warning. Called from every state
  // transition so the footer never lies. Idempotent. Safe in headless runs:
  // ctx.ui is a no-op stub when there is no UI.
  function setYoloStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      YOLO_STATUS_KEY,
      yoloActive() ? ctx.ui.theme.fg("warning", YOLO_STATUS_TEXT) : undefined,
    );
  }

  // Enable the session YOLO toggle. No confirmation dialog: the user just
  // typed the /permission-yolo command deliberately, so the command itself
  // is the opt-in and the status-bar warning is the feedback.
  function enableYolo(ctx: ExtensionContext): void {
    yoloEnabled = true;
    setYoloStatus(ctx);
  }

  // Disable the session YOLO toggle and clear the warning. A --yolo pin,
  // if set, keeps YOLO active and re-shows the warning. Safe when off.
  function disableYolo(ctx: ExtensionContext): void {
    yoloEnabled = false;
    setYoloStatus(ctx);
  }

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    // YOLO mode: allow every bash command before any rule evaluation,
    // sandbox check, or prompting (design D1). Covers both the session
    // toggle and the --yolo flag pin.
    if (yoloActive()) return undefined;

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

      // Resolve the target state against the *active* state so bare
      // toggles and idempotent sets account for a --yolo pin too.
      const target = arg === "" ? !yoloActive() : arg === "on";

      // Idempotent explicit set is a no-op (design D4). No notify on any
      // successful transition — the status bar is the feedback.
      if (target === yoloActive()) return;

      if (target) {
        enableYolo(ctx);
      } else if (yoloPinned()) {
        // The pin is a process-scoped opt-in; the session command cannot
        // undo it. Say so instead of silently failing.
        ctx.ui.notify(
          "YOLO mode is pinned on by --yolo for this run.",
          "warning",
        );
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
  // sure the YOLO toggle never survives into a new session unnoticed. A
  // --yolo pin deliberately survives — it was an explicit process-level
  // opt-in, so disableYolo re-asserts the footer warning instead of
  // clearing it.
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
