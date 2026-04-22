---
id: TASK-5
title: Support shared and project-scoped chain definitions
status: Done
assignee:
  - coding-agent
created_date: '2026-04-18 14:57'
updated_date: '2026-04-21 04:23'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load chain definitions from both local (`.pi/chains`) and global (`~/.pi/chains`) directories.

- **Precedence:** Local chains take precedence over global ones; global chains remain available when a local directory exists
- **Same-stem priority:** `.yaml` > `.yml` > `.json` is applied per directory, not across directories
- **Shadowing warnings:** No warnings are emitted for chains that exist in both directories (only same-stem priority warnings within a single directory)
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Chains defined in `~/.pi/chains` (global) are loaded and available as chain commands
- [x] #2 Chains defined in `.pi/chains` (local) are loaded and available as chain commands
- [x] #3 A chain defined in both global and local directories uses the local version (local takes precedence)
- [x] #4 Chains unique to the global directory remain available even when a local `.pi/chains` directory exists
- [x] #5 A chain file defined in `~/.pi/chains` with the same name as one in `.pi/chains` is not used instead
- [x] #6 Loading completes without warnings when a chain exists in both directories
- [x] #7 AGENTS.md documents the dual-path loading behaviour, precedence rules, and that cross-directory shadowing produces no warnings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

**Step 1 — Update `extensions/chain/src/index.ts`**
- Import `homedir` from `node:os`
- Change `refreshChainDefinitions(cwd)` to call `loadChainDefinitions` twice: first global (`join(homedir(), '.pi', 'chains')`), then local (`join(cwd, '.pi', 'chains')`)
- Merge with local precedence: `chainDefinitions = { ...globalChains, ...localChains }`
- Merge warnings: `loadWarnings = [...globalWarnings, ...localWarnings]`
- This leverages `loader.ts`'s existing per-directory same-stem priority and naturally suppresses cross-directory shadowing warnings

**Step 2 — Update `AGENTS.md`**
- Expand Chain Definitions section to document dual-path loading, precedence rules, and no cross-directory warnings

**Step 3 — Verify**
- Run `npm run check` and `npm run typecheck`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## CWD Resolution

### Important: use `ctx.cwd`, not `process.cwd()`

`process.cwd()` returns the directory where the pi process was started, which is fixed at extension load time. If the user switches sessions (e.g. `/new`, `/resume`, `/fork`) to a different project directory, the extension would continue looking for chain definitions in the original directory.

`ctx.cwd` (available on `ExtensionContext` and `ExtensionCommandContext`) reflects the **active session's working directory** and is the correct source for resolving project-local resources.

### Path construction

- **Local chains:** `join(ctx.cwd, ".pi", "chains")` → `<session-cwd>/.pi/chains`
- **Global chains:** `join(homedir(), ".pi", "chains")` → `$HOME/.pi/chains`

### Implementation notes

- The `chainsDir` must be resolved lazily (inside the command handler or `resources_discover` event) so it reflects the current session directory, not captured at module load time.
- Global chains can also be derived from `getAgentDir()` (exported by `@mariozechner/pi-coding-agent`), which returns `~/.pi/agent`. Chains live one level above agent-specific files:
  ```typescript
  import { getAgentDir } from "@mariozechner/pi-coding-agent";
  import { dirname } from "node:path";
  const globalChainsDir = join(dirname(getAgentDir()), "chains");
  ```
  Both approaches yield `~/.pi/chains`. Prefer the hardcoded `".pi"` approach for simplicity.

Step 1 complete: Updated `extensions/chain/src/index.ts` to load chain definitions from both `~/.pi/chains` (global) and `<cwd>/.pi/chains` (local). Local chains take precedence via `{ ...globalChains, ...localChains }`. Warnings from both loads are collected in order. Same-stem priority and shadowing warnings remain per-directory as handled by `loader.ts`. Typecheck and biome check pass.

Step 2 complete: Updated AGENTS.md Chain Definitions section to document dual-path loading (`~/.pi/chains` global + `.pi/chains` local), local precedence, per-directory same-stem priority, and no cross-directory shadowing warnings.

Step 3 complete: All checks pass. `npm run check` (biome format + lint) and `npm run typecheck` succeed with no errors. Implementation is complete and ready for verification.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Final Summary

### What changed
Extended chain definition loading to support both local (`.pi/chains`) and global (`~/.pi/chains`) directories.

### Implementation
- **`extensions/chain/src/index.ts`**: Updated `refreshChainDefinitions()` to call `loadChainDefinitions()` twice — first for global (`~/.pi/chains`), then for local (`<cwd>/.pi/chains`). Merged with local precedence via object spread (`{ ...globalChains, ...localChains }`). Collected warnings from both loads in order.
- **Key design decision**: Uses `ctx.cwd` (active session directory), not `process.cwd()`, so chain resolution follows the current session context across `/new`, `/resume`, `/fork`.
- **No cross-directory shadowing warnings**: `loader.ts` handles same-stem priority (`.yaml` > `.yml` > `.json`) per-directory only; merging occurs in `index.ts` so no warnings are emitted when a chain exists in both directories — local simply wins.
- **`AGENTS.md`**: Expanded the Chain Definitions section to document dual-path loading, local precedence, global availability, per-directory same-stem priority, and the no-warnings behavior for cross-directory shadowing.

### Verification
- `npm run check` (Biome format + lint): pass
- `npm run typecheck` (tsc --noEmit): pass

### Risks / Follow-ups
- None. The change is additive and backward-compatible: existing single-directory setups continue to work unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
