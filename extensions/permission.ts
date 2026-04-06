import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type PermissionAction = "allow" | "ask" | "deny";

interface PermissionRule {
  id: number;
  regex: RegExp;
  action: PermissionAction;
}

// Rules processed in reverse order - later patterns override earlier ones
const PERMISSION_RULES: PermissionRule[] = [
  { id: 1, regex: /git commit/, action: "ask" },
  { id: 2, regex: /git push/, action: "ask" },
  { id: 3, regex: /git rebase/, action: "ask" },
  { id: 4, regex: /gh repo view/, action: "allow" },
  { id: 5, regex: /gh repo list/, action: "allow" },
  { id: 6, regex: /gh issue view/, action: "allow" },
  { id: 7, regex: /gh issue list/, action: "allow" },
  { id: 8, regex: /gh pr view/, action: "allow" },
  { id: 9, regex: /gh pr list/, action: "allow" },
  { id: 10, regex: /gh pr checks/, action: "allow" },
  { id: 11, regex: /gh pr diff/, action: "allow" },
  { id: 12, regex: /gh release view/, action: "allow" },
  { id: 13, regex: /gh release list/, action: "allow" },
  { id: 14, regex: /gh workflow view/, action: "allow" },
  { id: 15, regex: /gh workflow list/, action: "allow" },
  { id: 16, regex: /gh run view/, action: "allow" },
  { id: 17, regex: /gh run list/, action: "allow" },
  { id: 18, regex: /gh run watch/, action: "allow" },
  { id: 19, regex: /gh /, action: "ask" },
];

function findMatchingRule(command: string): PermissionRule | undefined {
  for (const rule of [...PERMISSION_RULES]) {
    if (rule.regex.test(command)) return rule;
  }
  return undefined;
}

export default function permissionExtension(pi: ExtensionAPI): void {
  const isSandbox = process.env.PI_SANDBOX === "true";
  const alwaysAllowed: Set<number> = new Set();

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

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

  // Reset all always-allowed permissions
  pi.registerCommand("permission-reset", {
    description: "Reset all always-allowed permissions",
    handler: async (_args, ctx) => {
      alwaysAllowed.clear();
      ctx.ui.notify("All always-allowed permissions have been reset.", "info");
    },
  });

  // Reset always-allow permissions when a new session starts
  pi.on("session_start", async () => {
    alwaysAllowed.clear();
  });
}
