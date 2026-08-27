## Context

Flow scripts currently execute inside `new Function("af", body)` after jiti transpiles the source to a JS string (`discovery.ts` → `runner.ts:executeFlowScript`). Only `af` is in scope; `hasModuleSyntax` rejects any `import`/`export`/`require` in the source. Type-checking (`typeCheckFlowScript`) builds a tsc program with roots `[scriptPath, agentflow.d.ts]` and a file-map overlay, filtering diagnostics to the entry file. `validate.ts` reuses both checks for `agentflow_validate` / `/af-validate` and parses error locations from the thrown message text (`line:col\tmessage` blocks). jiti and typescript are already dependencies. See proposal.md for motivation; the specs state the required behavior.

## Goals / Non-Goals

**Goals:**
- One execution path for all flows (with/without imports, `.ts`/`.js`) that preserves "validates clean = runs clean".
- Import policy enforced statically at validation time with located errors, before any sub-agent spawns.
- Backward compatibility: import-less flows behave exactly as today; the `af` surface is unchanged.

**Non-Goals:**
- No bare/npm imports, no `node:` builtins, no dynamic `import()`, no directory confinement (all decided; see specs).
- No global-scope `/af-init` (project only), no LLM-callable init tool.
- No bundling, no per-flow `node_modules`, no tsconfig generation.

## Decisions

### D1: jiti as the module loader, `af` via `globalThis`
The entry script is loaded with `await jiti.import(flowPath)` instead of `new Function`. Before loading, `globalThis.af = af`; afterwards (in `finally`) the global is deleted. jiti handles TS transpilation, ESM/CJS interop, and top-level await, and it already transforms each file the same way validation does.

- Alternatives: keep `new Function` + bundle imports (needs a bundler dependency); custom module loader (reimplements jiti). Both rejected.
- Consequence: `executeFlowScript(transpiledSource, af)` becomes path-based (`executeFlowScript(flowPath, af)`); `validateFlowSyntax` no longer returns the string that gets executed — validation and execution are separate jiti passes.
- A fresh jiti instance per run/validate call with `fsCache: false, moduleCache: false` (same as today's `validateFlowSyntax`) so edits are picked up on re-run.

### D2: Relative-only enforcement via a graph walk over transpiled output
A recursive walker transforms each file with jiti and extracts the *remaining* module edges from the transpiled output: `import type` and other type-only constructs are erased by the TS transform, so what remains (CJS `require("./x")` calls in jiti's output) is exactly the runtime/value edge set. Per edge, the walker:

- rejects specifiers not starting with `./` or `../` (catches bare npm names, `node:` builtins, absolute paths) with a located error naming the specifier and the importing file;
- resolves relative specifiers against the importing file's directory (probing jiti's extension list), rejecting missing targets and `.d.ts` targets (value-importing a declaration file);
- transforms each target (syntax errors surface with location) and recurses.

Direct `require("./x")` calls in author source are tolerated and walked like imports; jiti has no resolution hook to block bare specifiers at load time, which is why enforcement is static. Dynamic `import()` can't be walked, so it is rejected outright: detected with the existing comment/string-stripping scan (`stripCommentsAndStrings`) applied to each file's source (`/\bimport\s*\(/` on stripped code).

- Alternative: parse an AST per file — heavier machinery for the same outcome; the transpiled-output scan reuses what jiti already produces.

### D3: One execution path, guard removed
`hasModuleSyntax` is deleted. All flows load via D1; `export` statements are harmless. No `new Function` fallback for import-less flows — two paths would double the test surface for no behavioral gain.

### D4: Conditional declaration injection
`typeCheckFlowScript` gains the entry's import graph (from the D2 walker, type-edge view: tsc follows `import type` too — the walker reports both edge kinds). The shipped `agentflow.d.ts` is added as a program root only when no file in the graph is named `agentflow.d.ts`. Detection by basename is sufficient: `/af-init` controls the generated file's name, and a hand-named `agentflow.d.ts` anywhere in the graph signals the same intent.

### D5: Graph-wide diagnostics
`getPreEmitDiagnostics` filtering widens from "entry file only" to "entry file + every file in the import graph" (node_modules never enters the graph by D2). Diagnostic formatting gains a file component for non-entry files (`file:line:col\tmessage` for those; the entry keeps `line:col\tmessage` to stay diff-friendly), and `validate.ts`'s `parseLocation`/`extractLocatedErrors` parsing is extended to match. Errors thrown by `typeCheckFlowScript` carry a `file` prefix so `validate.ts` can surface it.

### D6: `/af-init` as generation, not copy
`/af-init` reads the shipped `agentflow.d.ts`, performs two textual surgeries — replace the `import { type TSchema, Type } from "typebox";` line with self-contained fallback declarations (structural `TSchema` interface + a loosely typed `Type` builder standing in for `typeof Type`), keeping `declare global { const af }` intact — and writes the result to `.pi/agentflow/agentflow.d.ts` (mkdir -p, overwrite, `ctx.ui.notify` of the outcome). The surgery is a pure function (`generateLocalDeclarations(source): string`) in its own module so it is unit-testable without a command context.

- Alternatives: verbatim copy (typebox import unresolved in-project → editor errors, `TSchema` collapses to `any` under skipLibCheck); vendor typebox's `.d.mts` tree (~600KB, hundreds of files); keep the import and hope the project has typebox. All rejected.
- Fidelity split is deliberate and documented: in-pi type-checking uses the shipped file with full typebox fidelity; the local copy is for imports and external editors and is looser only on `resultSchema`/`af.Type`.

### D7: `.d.ts` exclusion in discovery
`listFlowNames` and flow resolution skip files ending in `.d.ts` (the current regex captures `agentflow.d` as a flow name otherwise).

## Risks / Trade-offs

- **Top-level await through jiti module loading** (the main unknown): jiti handles ESM+TLA via its native-eval fallback; interaction with relative imports on that path is unverified here → prototype `jiti.import` of a TLA flow with a relative import in the first implementation task, before refactoring `runner.ts`. Fallback if broken: wrap the transformed entry to force jiti's async CJS path.
- **Transpiled-output edge scan is a heuristic** (same lineage as the old guard): unusual syntax could hide an edge. → Acceptable: the runtime itself is the final authority (jiti fails loudly at load time on anything the walker missed), and validation errors stay advisory-but-strict for the common cases.
- **`af` as a real global during runs**: any other code running concurrently in the process during a flow could see `globalThis.af`. → Only the flow runs at a time (existing one-flow guard) and sub-agents are separate sessions; delete in `finally`.
- **Diagnostic format change** could break `validate.ts` parsing. → Change format and parser in the same task; keep entry-file errors in the old shape.
- **Stale local declaration copy** after an extension upgrade. → Documented: re-run `/af-init` (overwrite is the re-sync mechanism).

## Migration Plan

No migration: import-less flows keep working; existing flows need no changes. `/af-init` is opt-in per project. Rollback = revert the change; nothing persists beyond the user-created `.pi/agentflow/agentflow.d.ts`, which is inert without the feature.
