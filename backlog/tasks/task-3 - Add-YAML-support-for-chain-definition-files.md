---
id: TASK-3
title: Add YAML support for chain definition files
status: Done
assignee: []
created_date: '2026-04-17 14:44'
updated_date: '2026-04-19 04:11'
labels: []
dependencies:
  - TASK-1
  - TASK-2
documentation:
  - AGENTS.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently chain definitions can only be authored as JSON files in `.pi/chains/`. YAML is more human-friendly for authoring and maintaining configuration — supporting both JSON and YAML makes chains easier to edit.

**Goal:** Add YAML file support (`.yaml` and `.yml`) alongside existing JSON support so chain authors can choose the format they prefer.

**Priority rule for same-stem conflicts:**
- `.yaml` beats `.yml` beats `.json`
- When a higher-priority file shadows a lower-priority one, a descriptive warning is emitted so the user knows the lower-priority file is ignored

**No changes to chain validation or execution behavior** — only the set of supported file formats expands.

**Dependency context:**
- **TASK-1** provides `loadChainDefinitions()` and `validateChainDefinition()` in `extensions/chain/src/`, the `.pi/chains/` directory with JSON chain files, and command registration (`chain-<name>`).
- **TASK-2** provides Zod schemas (`chainDefinitionSchema`, `chainStepSchema`) in `schema.ts`, the `formatValidationIssues` helper, and the `warn` callback injected into `loadChainDefinitions` for descriptive validation warnings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A valid `.yaml` or `.yml` chain file in `.pi/chains/` produces the same parsed chain definition and registered `chain-<name>` command as a semantically equivalent `.json` file
- [x] #2 Existing JSON-only chain setups load and function identically — no behavior change
- [x] #3 When multiple chain files share the same stem, the priority rule `.yaml` > `.yml` > `.json` is enforced: lower-priority files are skipped with descriptive warnings naming both files and stating which took priority
- [x] #4 Invalid YAML files produce descriptive warnings matching the format used for malformed JSON files — including filename and details for parse errors, and field path / expected constraint / received value for schema validation failures
- [x] #5 AGENTS.md documents `.yaml`/`.yml` as supported formats, the same-stem priority rule, and includes a YAML chain definition example alongside the existing JSON schema
- [x] #6 A YAML example chain file is provided in `.pi/chains/` demonstrating the format alongside existing JSON files
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Steps

### 1. Add `yaml` dependency to the chain extension
- Add `yaml` package to `extensions/chain/package.json` → `dependencies`
- Run `npm install` to update the lockfile

### 2. Add YAML parsing in `loader.ts`
- Import `parse` from the `yaml` library
- Add a `parseYamlFile(content: string, file: string)` helper that calls `parse(content)` and catches parse errors with descriptive messages including filename

### 3. Refactor `loadChainDefinitions` to support both JSON and YAML
- Change directory scan to pick up `.json`, `.yaml`, and `.yml` files
- Build a map keyed by stem (filename without extension)
- Conflict resolution: `.yaml` > `.yml` > `.json` — prefer higher priority, warn via `warn` callback when shadowing occurs
- For each resolved file, pick the correct parser (YAML or JSON), parse, then validate with existing Zod schema — no changes to `schema.ts`
- Returned map keys remain the stem name, command registration (`chain-<name>`) unchanged

### 4. Add a new YAML example chain alongside existing JSON files
- Create `.pi/chains/greeting.yaml` as a YAML version of the greeting chain

### 5. Update `AGENTS.md`
- Document `.yaml` and `.yml` as supported formats alongside `.json`
- Add a YAML example showing the equivalent of the JSON schema
- Document the priority rule: `.yaml` > `.yml` > `.json`
- Update "Adding a new chain" section to mention both formats

### 6. Verify
- `npm run check` passes
- `npm run typecheck` passes
- Manually verify: chains load from `.json`, `.yaml`, and `.yml` files
- Manually verify: when same-stem YAML and JSON files coexist, YAML is loaded and warning is surfaced
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Add YAML support for chain definition files

### What changed
- **`extensions/chain/package.json`** — added `yaml` (^2.8.3) as a dependency
- **`extensions/chain/src/loader.ts`** — added YAML parsing (`parse` from the `yaml` library), unified `parseContent()` helper that dispatches to YAML or JSON parser based on file extension, same-stem conflict resolution (`.yaml` > `.yml` > `.json`) with descriptive shadowing warnings
- **`extensions/chain/src/index.ts`** — added `else` branch in `resources_discover` handler to clear status bar when chain warnings resolve (was missing a clear on success)
- **`.pi/chains/greeting.yaml`** — new YAML example chain demonstrating the format alongside existing JSON files
- **`AGENTS.md`** — documented `.yaml`/`.yml` as supported formats, added YAML example, documented priority rule, updated Repo Layout and Key Conventions sections

### What didn't change
- `schema.ts` — no changes; YAML-parsed values validated by the same Zod schemas as JSON
- `execution.ts` — no changes; chain execution is format-agnostic
- Command registration in `index.ts` — works identically regardless of source format

### Verification
- `npm run check` — passed (biome lint + format)
- `npm run typecheck` — passed (tsc --noEmit)
- `yaml` package confirmed installed and `parse` function verified

### Post-implementation fixes
- **`extensions/chain/src/loader.ts`** — fixed silent skip of empty/null-producing YAML files (empty, whitespace-only, comments-only). Previously `parseYaml()` returned `null` for these and the `raw === null` guard silently continued. Now a descriptive warning is emitted matching the format used for JSON parse errors, satisfying acceptance criterion #4 fully.
- **`extensions/chain/src/index.ts`** — fixed stale status bar: `resources_discover` handler now clears the status when warnings resolve (`ctx.ui.setStatus("chain", undefined)`).

### No remaining follow-ups
- All previously known issues have been resolved.
<!-- SECTION:FINAL_SUMMARY:END -->
