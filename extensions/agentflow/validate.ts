/**
 * validate.ts — On-demand validation of a flow script by name.
 *
 * The run path (`runAgentFlow`) already validates a flow script right before it
 * executes: `resolveFlowFile` → `validateFlowSyntax` (jiti) → (for `.ts`)
 * `typeCheckFlowScript`. This module reuses those exact checks as the basis for
 * an *on-demand* entry point so the main-session LLM (via the
 * `agentflow_validate` tool) and humans (via `/af-validate`) can check a draft
 * script while authoring, before it is ever executed. "Validates clean" here
 * means the same as "runs clean" — one source of truth for what a valid flow is.
 *
 * An invalid script is reported as a structured `FlowValidationReport` (never
 * thrown), so a fixable script surfaces as data, not as a tool/command failure.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFlowScript,
  resolveFlowFile,
  typeCheckFlowScript,
  validateFlowSyntax,
} from "./discovery.js";

/** Absolute path to this module's directory. */
const here = dirname(fileURLToPath(import.meta.url));
/** The shipped `af` declarations, used to type-check `.ts` flows. */
const DECLARATIONS_PATH = join(here, "agentflow.d.ts");

/** One located validation error. */
export interface FlowValidationError {
  message: string;
  /** 1-based line, or 0 when the message carries no location. */
  line: number;
  /** 1-based column, or 0 when the message carries no location. */
  col: number;
}

/** The structured outcome of validating a flow script by name. */
export interface FlowValidationReport {
  ok: boolean;
  name: string;
  errors: FlowValidationError[];
}

/** Location-less error factory. */
function error(message: string): FlowValidationError {
  return { message, line: 0, col: 0 };
}

/**
 * Parse location info out of a thrown runner message. The existing runners emit
 * `line:col` inside their error text (jiti's embedded parse errors and the
 * `  line:col\tmessage` blocks from `typeCheckFlowScript`). We take the first
 * `(\d+):(\d+)` we find; when none is present we fall back to `0` locations.
 */
function parseLocation(message: string): { line: number; col: number } {
  const match = /(\d+):(\d+)/.exec(message);
  if (match) return { line: Number(match[1]), col: Number(match[2]) };
  return { line: 0, col: 0 };
}

/**
 * Extract the located per-diag error entries from a `typeCheckFlowScript`
 * message body, which lists diagnostics one per line as `  line:col\tmessage`.
 * Returns an empty array when the message does not match that shape.
 */
function extractLocatedErrors(message: string): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  const re = /^\s*(\d+):(\d+)\t(.+)$/gm;
  for (const match of message.matchAll(re)) {
    errors.push({
      message: match[3],
      line: Number(match[1]),
      col: Number(match[2]),
    });
  }
  return errors;
}

/**
 * Validate a flow script by name, reusing the run path's exact checks and
 * search order (project → global, `.ts` → `.js`). Never throws: an invalid or
 * unresolvable script is reported as a structured `FlowValidationReport`.
 */
export async function validateFlowFile(
  name: string,
  cwd: string,
): Promise<FlowValidationReport> {
  // 1. Resolve the script (same search order as `/af`).
  const resolved = resolveFlowFile(name, cwd);
  if (!resolved) {
    return {
      ok: false,
      name,
      errors: [error(`no flow script found for "${name}"`)],
    };
  }

  const source = readFlowScript(resolved.path);

  // 2. Syntax-validate (both `.ts` and `.js`).
  try {
    validateFlowSyntax(source, resolved.path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { line, col } = parseLocation(message);
    return { ok: false, name, errors: [{ message, line, col }] };
  }

  // 3. Type-check `.ts` scripts against the shipped declarations (raw source,
  // so tsc sees the TypeScript, not the transpiled JS).
  if (resolved.isTypeScript) {
    try {
      await typeCheckFlowScript(resolved.path, source, DECLARATIONS_PATH);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const located = extractLocatedErrors(message);
      const errors =
        located.length > 0
          ? located
          : [{ message: error(message).message, line: 0, col: 0 }];
      return { ok: false, name, errors };
    }
  }

  return { ok: true, name, errors: [] };
}
