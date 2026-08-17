## 1. De-risk the execution model

- [x] 1.1 Prototype `jiti.import` (fresh instance, `fsCache`/`moduleCache` off) loading a `.ts` entry with a relative import and top-level `await`; confirm both work end-to-end in a scratch script before refactoring (design.md risk #1)

## 2. Import graph walker (discovery.ts)

- [x] 2.1 Implement the recursive import-graph walker: transform each file with jiti, extract remaining value edges from the transpiled output, resolve relative specifiers against the importing file's directory with extension probing, and return the graph (both value and type edges)
- [x] 2.2 Enforce the import policy in the walker with located errors: reject non-relative specifiers, missing targets, value imports of `.d.ts` files, dynamic `import()` expressions (detected via the comment/string-stripped source scan), `module.require`/`module.createRequire`, and `eval()` calls
- [x] 2.3 Remove `hasModuleSyntax` and its rejection path from `validateFlowSyntax` (imports/exports/require no longer banned)
- [x] 2.4 Exclude `.d.ts` files from `listFlowNames` and flow resolution candidates (prevents the phantom `agentflow.d` flow)

## 3. Module-based execution (runner.ts / runtime.ts)

- [x] 3.1 Change `executeFlowScript` to load the entry by path via jiti with `globalThis.af` injected before and deleted in `finally`; update callers and re-exports
- [x] 3.2 Wire the run path (`runAgentFlow` in index.ts) to run the graph walker before execution so policy violations, missing files, and syntax errors in any graph file abort before any sub-agent spawns

## 4. Type-checking (discovery.ts / validate.ts)

- [x] 4.1 Implement conditional declaration injection: include the shipped `agentflow.d.ts` as a program root only when the import graph contains no `agentflow.d.ts`
- [x] 4.2 Widen `getPreEmitDiagnostics` filtering to entry + all graph files; emit `file:line:col\tmessage` for non-entry diagnostics (entry keeps the old shape)
- [x] 4.3 Extend `validate.ts` location parsing (`parseLocation`, `extractLocatedErrors`) and `FlowValidationError` reporting to carry the file for non-entry errors

## 5. `/af-init` command

- [x] 5.1 Implement `generateLocalDeclarations(source)` — pure function that replaces the `typebox` import in the shipped declaration with self-contained structural fallbacks (`TSchema` + loosely typed `af.Type`) while keeping `declare global { const af }`
- [x] 5.2 Register `/af-init` in index.ts: write the generated file to `<cwd>/.pi/agentflow/agentflow.d.ts` (mkdir -p, overwrite), notify the user of the outcome

## 6. Documentation

- [x] 6.1 Update the `agentflow.d.ts` header contract ("SHALL NOT import" → relative-only import policy)
- [x] 6.2 Update the authoring skill (`skills/agentflow/SKILL.md`): import contract, rejected forms, `/af-init`, and the local-declaration workflow; update stale "scripts cannot import" statements (incl. `af.Type` rationale)

## 7. Tests

- [x] 7.1 Update `discovery.test.ts`: replace module-syntax-guard tests with walker tests — relative value import resolves, bare/`node:` specifiers rejected, dynamic `import()` rejected, missing target rejected, `.d.ts` value-import rejected, `../` escape allowed, `.d.ts` files excluded from flow discovery
- [x] 7.2 Update/add `runtime.test.ts` coverage for module-based execution: entry with a relative import runs, imported helper sees `af`, `globalThis.af` removed after the run
- [x] 7.3 Update/add `validate.test.ts` coverage: import-policy errors reported with locations, type errors in imported files reported with file name, conditional injection (import-less script typed by shipped declarations; script importing local `agentflow.d.ts` typed by it without duplicate-global error)
- [x] 7.4 Add unit tests for `generateLocalDeclarations`: no module imports in output, `declare global` retained, typebox fallbacks present

## 8. Quality gates

- [x] 8.1 Run `npm run format && npm run lint && npm run typecheck && npm test` clean
- [x] 8.2 Run `nix flake check` (change touches `extensions/`)
