## Why

AgentFlow scripts today are sealed single files: the body runs inside a `new Function` where only the injected `af` global is in scope, and any `import`/`export`/`require` is rejected before execution. This forces authors to inline every helper and every shared type into each flow, so two flows that want the same result shape or the same helper functions must duplicate code — and there is no way to share a type definition at all. Separately, because a script can never import the `af` type declarations, external editors (VS Code) have no way to type the `af` global, so authoring outside pi gets no type safety even though the in-pi type-checker enforces it.

## What Changes

- **Runtime value imports**: flow scripts may `import` from other files. Execution switches from the `new Function("af", body)` sandbox to loading the entry script as a real module via the jiti loader, with `af` injected as a global (`globalThis.af`) so both the entry and every imported helper see it. `.ts` and `.js` both work; `export` statements are tolerated; top-level `await` continues to work.
- **Relative-only import policy**: every import specifier in a flow's import graph must start with `./` or `../`. Bare/npm specifiers and `node:` builtins are rejected. Relative paths may escape the flow directory (no confinement). CJS `require("./x")` edges are tolerated and walked; the former module-syntax guard is removed.
- **No dynamic `import()`**: dynamic import expressions are rejected at validation time so the relative-only guarantee cannot be bypassed.
- **Graph-aware validation**: before any sub-agent spawns, validation recursively walks the entry's static import graph — verifying every imported file exists and transforms cleanly — and type-checking reports diagnostics across all files in the graph (not just the entry). "Validates clean = runs clean" holds with imports.
- **Conditional declaration injection**: the shipped `agentflow.d.ts` is type-check-injected only when the script's import graph does not already contain an `agentflow.d.ts`; scripts that import their local copy get `af` from that single source.
- **`.d.ts` excluded from flow discovery**: declaration files in a flow directory are never treated as runnable flows (prevents a phantom `agentflow.d` flow).
- **New `/af-init` command**: writes a self-contained local copy of the `af` declarations to the project's `.pi/agentflow/agentflow.d.ts` so scripts can `import type` the API surface and external editors can type `af`. Generated from the shipped declaration with the `typebox` import replaced by structural fallbacks; `declare global` retained; overwrites any existing file and notifies.
- **Docs**: `agentflow.d.ts` header and the bundled authoring skill are updated from "scripts SHALL NOT import" to the new import contract, and document `/af-init`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agentflow-runtime`: the execution model becomes module-based (jiti loader, `af` as global); flow scripts gain relative-only value imports enforced by an import-graph walk; dynamic `import()` is rejected; `.d.ts` files are excluded from flow discovery/resolution.
- `agentflow-validation`: validation becomes graph-aware (syntax across the whole import graph, type-check diagnostics for all graph files); the shipped declarations are injected conditionally.
- `agentflow-authoring`: adds the `/af-init` command and the locally-generated self-contained declaration file; the authoring skill documents the import contract and `/af-init`.

## Impact

- **Code**: `extensions/agentflow/discovery.ts` (graph walk, relative-only enforcement, `.d.ts` exclusion, guard removal, conditional declaration injection), `runtime.ts` / `runner.ts` (module-based execution, `af` global injection), `validate.ts` (graph-wide diagnostics), `index.ts` (`/af-init` registration).
- **Declarations & docs**: `extensions/agentflow/agentflow.d.ts` (header contract), `extensions/agentflow/skills/agentflow/SKILL.md`.
- **Tests**: `discovery.test.ts`, `runtime.test.ts`, `validate.test.ts` updated; new coverage for the import graph, relative-only rejection, dynamic-import rejection, `.d.ts` exclusion, conditional injection, and `/af-init` generation.
- **Dependencies**: none added (jiti and typescript are already dependencies).
- **Compatibility**: import-less flows keep working unchanged; the `af` scripting surface is unchanged.
