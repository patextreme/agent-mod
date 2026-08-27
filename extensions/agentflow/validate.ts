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
  FlowLocatedError,
  pathAliases,
  resolveFlowFile,
  validateResolvedFlow,
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

  // 2. Walk the static import graph (policy + existence + syntax across the
  //    whole graph — this also syntax-validates the entry itself), then
  //    type-check `.ts` scripts against the declarations (raw source, so tsc
  //    sees the TypeScript; graph-aware diagnostics and conditional
  //    declaration injection).
  try {
    await validateResolvedFlow(
      resolved.path,
      resolved.isTypeScript,
      DECLARATIONS_PATH,
    );
  } catch (err) {
    if (err instanceof FlowLocatedError) {
      const entryAliases = pathAliases(resolved.path);
      return {
        ok: false,
        name,
        errors: err.diagnostics.map((d) => {
          // Keep `file` only for imported files. Entry-file errors (and
          // location-less messages) leave it undefined, matching the
          // `FlowValidationError` contract and type-check diagnostics.
          const file =
            d.file !== undefined && !entryAliases.includes(d.file)
              ? d.file
              : undefined;
          return {
            message: d.message,
            line: d.line,
            col: d.col,
            ...(file !== undefined ? { file } : {}),
          };
        }),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, name, errors: [error(message)] };
  }

  return { ok: true, name, errors: [] };
}
