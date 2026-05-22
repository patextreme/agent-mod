/**
 * crof-usage — CrofAI usage tracking extension for pi
 *
 * Registers the /usage-crof command that checks how much usage
 * is left on the crof.ai account via their usage_api endpoint.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

// ─── Constants ──────────────────────────────────────────────────────────────

const USAGE_API_URL = "https://crof.ai/usage_api/";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CrofUsageResponse {
  usable_requests: number | null;
  credits: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the crof.ai API key via pi's model registry.
 * This uses the full priority chain (runtime override → auth.json →
 * OAuth → env var → models.json !cat command), so it works regardless
 * of how the user has configured their key.
 */
async function resolveApiKey(ctx: ExtensionCommandContext): Promise<string> {
  const key = await ctx.modelRegistry.getApiKeyForProvider("crofai");
  if (!key) {
    throw new Error(
      'No API key found for provider "crofai". ' +
        "Configure it in auth.json, models.json, or set the CROFAI_API_KEY env var.",
    );
  }
  return key;
}

/**
 * Fetch usage data from the crof.ai usage API.
 */
async function fetchUsage(apiKey: string): Promise<CrofUsageResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(USAGE_API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `CrofAI usage API returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as CrofUsageResponse;
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Format a number for display, showing up to 4 decimal places, keeping at least 2.
 */
function formatCredit(n: number): string {
  const formatted = n.toFixed(4);
  // Trim trailing zeros after decimal point, keep at least 2 decimals
  const trimmed = formatted.replace(/0+$/, "");
  const [intPart, decPart] = trimmed.split(".");
  return decPart ? `${intPart}.${decPart.padEnd(2, "0")}` : `${intPart}.00`;
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function crofUsageExtension(pi: ExtensionAPI) {
  pi.registerCommand("usage-crof", {
    description: "Check remaining CrofAI usage (requests and credits)",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify("⏳ Fetching CrofAI usage...", "info");

      try {
        const apiKey = await resolveApiKey(ctx);
        const usage = await fetchUsage(apiKey);

        // Build display message
        const lines: string[] = [];

        if (usage.usable_requests !== null) {
          lines.push(
            `Requests left today: ${usage.usable_requests.toLocaleString()}`,
          );
        } else {
          lines.push("Requests left: N/A (no subscription plan)");
        }

        if (usage.credits !== null) {
          lines.push(`Credits: $${formatCredit(usage.credits)}`);
        } else {
          lines.push("Credits: N/A");
        }

        ctx.ui.notify(lines.join("  ·  "), "info");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        ctx.ui.notify(`CrofAI usage: ${message}`, "error");
      }
    },
  });
}
