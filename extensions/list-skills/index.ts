/**
 * list-skills — Skill disclosure tool for pi
 *
 * Registers a `list-skills` tool that displays the available skills in the
 * same format as the system prompt's skill disclosure section. Some models
 * don't reliably attend to system prompt content, so exposing skills as a
 * callable tool gives the model another path to discover them.
 *
 * The tool reads the skill list from the before_agent_start event's
 * systemPromptOptions (which mirrors what pi uses to build the system
 * prompt) and formats it using the same XML-based format.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Subset of Skill fields we need. Avoids importing the full Skill type
 *  since the skill objects come from pi's runtime, not our own loading. */
interface SkillLike {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format skills into the same XML disclosure format used in the system prompt.
 * Mirrors pi's built-in `formatSkillsForPrompt` but is self-contained so the
 * extension works even if the exact Skill type shape changes slightly.
 */
function formatSkillsForPrompt(skills: SkillLike[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

  if (visibleSkills.length === 0) {
    return "No skills are currently available.";
  }

  const lines: string[] = [
    "The following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function listSkillsExtension(pi: ExtensionAPI): void {
  // Most-recently captured skills, refreshed every turn.
  let currentSkills: SkillLike[] = [];

  // Capture skills on before_agent_start (has systemPromptOptions with the
  // full skill list, exactly what pi uses to build the system prompt).
  pi.on("before_agent_start", (event) => {
    if (event.systemPromptOptions?.skills) {
      currentSkills = event.systemPromptOptions.skills as SkillLike[];
    }
  });

  // Also capture on session_start so the tool works immediately before the
  // first user prompt. ctx.getSystemPromptOptions() is available in command
  // context but not in event context — we use before_agent_start for that.
  // On session_start we simply keep whatever was captured before (which
  // covers reload/resume).

  pi.registerTool({
    name: "list-skills",
    label: "List Skills",
    description:
      "Display the available skills for the current session. Shows skill names, " +
      "descriptions, and file locations in the same XML format as the system prompt " +
      "skill disclosure. Use this tool when you need to remind yourself what skills " +
      "are available, or when the system prompt skill section may not have been " +
      "fully attended to.",
    promptSnippet:
      "Display available skills (names, descriptions, file locations)",
    promptGuidelines: [
      "Use list-skills when the task might benefit from a skill but you are unsure which skills are available or what they do.",
      "Use list-skills if you need to refresh your memory of available skills after a long conversation.",
    ],
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ) {
      // If we haven't captured skills yet (e.g. tool called before first
      // before_agent_start), try to get them from the command context.
      let skills = currentSkills;

      if (skills.length === 0) {
        // Fall back: attempt to read systemPromptOptions via ctx if available.
        // ExtensionCommandContext has getSystemPromptOptions, but
        // ExtensionContext doesn't. We still try in case the runtime
        // provides it.
        const ctxWithOpts = ctx as ExtensionContext & {
          getSystemPromptOptions?: () => { skills?: SkillLike[] };
        };
        if (typeof ctxWithOpts.getSystemPromptOptions === "function") {
          try {
            const opts = ctxWithOpts.getSystemPromptOptions();
            if (opts?.skills) {
              skills = opts.skills;
            }
          } catch {
            // Ignore — not available in this context
          }
        }
      }

      const text = formatSkillsForPrompt(skills);

      return {
        content: [{ type: "text" as const, text }],
        details: {
          skillCount: skills.filter((s) => !s.disableModelInvocation).length,
          skills: skills.map((s) => ({
            name: s.name,
            filePath: s.filePath,
          })),
        },
      };
    },
  });
}
