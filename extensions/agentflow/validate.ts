/**
 * validate.ts — On-demand validation of a flow script by name.
 *
 * The run path (`runAgentFlow`) already validates a flow script right before it
 * executes: `resolveFlowFile` → `buildImportGraph` (import policy + existence
 * + syntax for every graph file) → (for `.ts`) `typeCheckFlowScript` against
 * the `af` declarations. This module reuses those exact checks as the basis
 * for an *on-demand* entry point so the main-session LLM (via the
 * `agentflow_validate` tool) and humans (via `/af-validate`) can check a draft
 * script while authoring, before it is ever executed. "Validates clean" here
 * means the same as "runs clean" — one source of truth for what a valid flow
 * is.
 *
 * An invalid script is reported as a structured `FlowValidationReport` (never
 * thrown), so a fixable script surfaces as data, not as a tool/command failure.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImportGraph,
  readFlowScript,
  resolveFlowFile,
  typeCheckFlowScript,
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
  /**
   * The file the error is located in, for errors in imported (non-entry)
   * files. Undefined for entry-file errors and location-less messages.
   */
  file?: string;
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
 * Parse location info out of a thrown runner message. The runners emit
 * `line:col` inside their error text (jiti's embedded parse errors, the
 * `  (line:col): message` import-policy form, and the `  line:col\tmessage`
 * blocks from `typeCheckFlowScript`). We take the first `(\d+):(\d+)` we
 * find; when none is present we fall back to `0` locations.
 */
function parseLocation(message: string): { line: number; col: number } {
  const match = /(\d+):(\d+)/.exec(message);
  if (match) return { line: Number(match[1]), col: Number(match[2]) };
  return { line: 0, col: 0 };
}

/**
 * Extract the located per-diag error entries from a `typeCheckFlowScript`
 * message body, which lists diagnostics one per line:
 *   - entry-file diagnostics as `  line:col\tmessage`
 *   - imported-file diagnostics as `  file:line:col\tmessage`
 * Returns an empty array when the message does not match that shape.
 */
function extractLocatedErrors(message: string): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  const lines = message.split("\n");
  // Each diagnostic block starts at a line matching `  [file:]line:col\tmsg`.
  // A chained TypeScript diagnostic spans multiple lines (its message text is
  // joined with "\n"), so any following line that does not itself start with a
  // `line:col\t` loc is a continuation of the previous diagnostic's message —
  // fold it back in instead of dropping it. The optional non-space `file:`
  // prefix captures the importing-file name for non-entry diagnostics.
  const locRe = /^\s*(?:(\S+?):\s*)?(\d+):(\d+)\t(.*)$/;
  for (const line of lines) {
    const m = locRe.exec(line);
    if (m) {
      errors.push({
        message: m[4],
        line: Number(m[2]),
        col: Number(m[3]),
        ...(m[1] !== undefined ? { file: m[1] } : {}),
      });
    } else if (errors.length > 0) {
      errors[errors.length - 1].message += `\n${line}`;
    }
  }
  for (const e of errors) e.message = e.message.replace(/\s+$/, "");
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

  try {
    readFlowScript(resolved.path);
  } catch (err) {
    // `readFlowScript` throws on a directory, unreadable file, etc. Surface it
    // as a structured report so `validateFlowFile` honors its never-throws
    // contract (mirroring the `/af` run path, which guards the same call).
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, name, errors: [error(message)] };
  }

  // 2. Walk the static import graph (policy + existence + syntax across the
  //    whole graph — this also syntax-validates the entry itself), then
  //    type-check `.ts` scripts against the declarations (raw source, so tsc
  //    sees the TypeScript; graph-aware diagnostics and conditional
  //    declaration injection).
  try {
    const graph = buildImportGraph(resolved.path);
    if (resolved.isTypeScript) {
      const entrySource = graph.files.get(resolved.path);
      if (entrySource === undefined) {
        return {
          ok: false,
          name,
          errors: [
            error(
              `internal error: validated graph is missing entry "${resolved.path}"`,
            ),
          ],
        };
      }
      await typeCheckFlowScript(
        resolved.path,
        entrySource,
        DECLARATIONS_PATH,
        graph,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const located = extractLocatedErrors(message);
    if (located.length > 0) {
      return { ok: false, name, errors: located };
    }
    const { line, col } = parseLocation(message);
    return { ok: false, name, errors: [{ message, line, col }] };
  }

  return { ok: true, name, errors: [] };
}
