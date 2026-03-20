import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type PermissionAction = "allow" | "ask" | "deny";

interface PermissionRule {
	regex: RegExp;
	action: PermissionAction;
}

// Rules processed in reverse order - later patterns override earlier ones
const PERMISSION_RULES: PermissionRule[] = [
	{ regex: /git commit/, action: "ask" },
	{ regex: /git push/, action: "ask" },
	{ regex: /git rebase/, action: "ask" },
	{ regex: /gh repo view/, action: "allow" },
	{ regex: /gh repo list/, action: "allow" },
	{ regex: /gh issue view/, action: "allow" },
	{ regex: /gh issue list/, action: "allow" },
	{ regex: /gh pr view/, action: "allow" },
	{ regex: /gh pr list/, action: "allow" },
	{ regex: /gh pr checks/, action: "allow" },
	{ regex: /gh pr diff/, action: "allow" },
	{ regex: /gh release view/, action: "allow" },
	{ regex: /gh release list/, action: "allow" },
	{ regex: /gh workflow view/, action: "allow" },
	{ regex: /gh workflow list/, action: "allow" },
	{ regex: /gh run view/, action: "allow" },
	{ regex: /gh run list/, action: "allow" },
	{ regex: /gh run watch/, action: "allow" },
	{ regex: /gh /, action: "ask" },
];

function findMatchingRule(command: string): PermissionRule | undefined {
	for (const rule of [...PERMISSION_RULES].reverse()) {
		if (rule.regex.test(command)) return rule;
	}
	return undefined;
}

export default function permissionExtension(pi: ExtensionAPI): void {
	const isSandbox = process.env.PI_SANDBOX === "true";
	console.log(`Permission extension loaded, sandbox mode: ${isSandbox}`);

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

		// If a rule matches and it's "ask", ask the user
		if (rule && rule.action === "ask") {
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Command matches permission rule ${rule.regex} - no UI for confirmation`,
				};
			}

			const choice = await ctx.ui.select(
				`⚠️ Command matches permission rule ${rule.regex}:\n\n  ${command}\n\nAllow?`,
				["Yes", "No"],
			);

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
}
