/**
 * init.ts — `/af-init` support: generating the self-contained local copy of
 * the `af` declarations.
 *
 * The shipped `agentflow.d.ts` imports `typebox` (fine inside this extension,
 * which depends on it). A local copy dropped into a user project must not: an
 * in-project `import { TSchema } from "typebox"` would be unresolved for
 * editors and type-checkers outside this extension. `generateLocalDeclarations`
 * replaces that import with self-contained structural fallbacks
 * (`TSchema` + a loosely typed `Type` builder), keeping `declare global
 * { const af }` intact so the file both imports cleanly and types the `af`
 * global for editors.
 *
 * The fidelity split is deliberate: in-pi type-checking uses the shipped file
 * with full typebox fidelity; the local copy is for `import type` usage and
 * external editors, and is looser only on `resultSchema`/`af.Type`. Re-run
 * `/af-init` after an extension upgrade to re-sync the copy (it overwrites).
 */

/**
 * Self-contained fallback declarations replacing the `typebox` import. They
 * stand in for `TSchema` (structural: any schema-shaped object) and
 * `typeof Type` (a namespace whose methods build schemas), which is all flow
 * scripts need to build `resultSchema` values and type-check against them.
 */
const TYPEBOX_FALLBACKS = `/**
 * Structural stand-in for TypeBox's \`TSchema\` (this local copy has no module
 * imports): any schema-shaped object is assignable, so \`resultSchema\` values
 * built with \`af.Type\` type-check without typebox's exact definition.
 */
interface TSchema {
  readonly [key: string]: unknown;
}

/**
 * Loose stand-in for TypeBox's \`Type\` builder namespace: every method
 * (Object, String, Number, ...) accepts anything and returns a \`TSchema\`.
 */
declare const Type: { [method: string]: (...args: unknown[]) => TSchema };
`;

/** The exact shape of the typebox import the surgery knows how to replace. */
const TYPEBOX_IMPORT_RE =
  /^import\s*\{[^}]*\}\s*from\s*["']typebox["'];?[^\n]*\n?/m;

/**
 * Generate the local declarations file from the shipped source: replace the
 * `typebox` import with the self-contained fallbacks, leaving everything else
 * (including `declare global { const af }`) verbatim.
 *
 * @throws Error when the shipped source no longer matches the expected import
 *   shape (the surgery, and `/af-init` with it, needs updating).
 */
export function generateLocalDeclarations(source: string): string {
  if (!TYPEBOX_IMPORT_RE.test(source)) {
    throw new Error(
      "AgentFlow: the shipped declarations no longer contain the expected typebox import — /af-init needs updating.",
    );
  }
  return source.replace(TYPEBOX_IMPORT_RE, TYPEBOX_FALLBACKS);
}
