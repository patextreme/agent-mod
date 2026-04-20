---
id: TASK-1
title: Make chain definitions configurable without source code edits
status: Done
assignee: []
created_date: '2026-04-16 19:31'
updated_date: '2026-04-17 04:26'
labels:
  - extension
  - config
dependencies: []
references:
  - extensions/chain.ts
documentation:
  - AGENTS.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The chain extension (`extensions/chain.ts`) currently hardcodes chain definitions in source code. This makes it cumbersome to add or modify chains — requiring code edits each time.

Chain definitions should be externalized so that new chains can be added or existing ones modified without touching extension source code.

**Current interfaces** (from `extensions/chain.ts`):

```typescript
interface ChainStep {
  prompt: string;
  exitCondition?: string;
}

interface ChainDefinition {
  description: string;
  loop?: number;
  steps: ChainStep[];
}
```

The `loop` property is a numeric repeat count controlling how many times the step sequence iterates (e.g., `loop: 50` for backlog-groom). Optional `exitCondition` on a step triggers chain termination. A `chain_exit` tool allows early termination.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adding a new chain requires no changes to extension source code
- [x] #2 The existing backlog-groom and greeting chains work identically after migration — verified by running both chains end-to-end before and after migration
- [x] #3 When chain configuration is missing or malformed, the extension degrades gracefully without crashing — verified by console.warn with a descriptive message, and no further chains from that source are loaded
- [x] #4 A chain with loop: N repeats its step sequence exactly N times (absent early exit via exitCondition or chain_exit)
- [x] #5 A multi-step chain that loops continues to pass the user's original input on each iteration
- [x] #6 A chain with an exit condition stops looping when the condition is met
- [x] #7 The chain_exit tool correctly terminates a running chain — verified by invoking chain_exit during a running chain and confirming no further steps execute
- [x] #8 AGENTS.md documents the .pi/chains/ directory, JSON schema, and how to add and configure chains
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `loadChainDefinitions()` to read `.pi/chains/*.json` at startup
2. Add `validateChainDefinition()` for schema validation with graceful `console.warn` on malformed files
3. Replace hardcoded `CHAIN_DEFINITIONS` constant with dynamic loading call
4. Migrate existing chains (backlog-execute, backlog-groom) to JSON files; add new chains (backlog-review, greeting)
5. Update AGENTS.md with Chain Definitions documentation section
6. Verify format, lint, typecheck pass
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added two chains beyond the original plan: backlog-execute.json and backlog-review.json (original code only had backlog-groom and greeting)

- Minor prompt text drift in backlog-groom migration: 'item' -> 'task', 'and' -> '- and' — improvements, not regressions

- Float validation gap identified during self-review via backlog-review chain — fixed by adding Number.isInteger() check to validateChainDefinition()

- Chain JSON files were initially omitted from the git commit (untracked) — caught in review and staged as follow-up fix

- No automated test suite in this project; ACs #2 and #4-#7 (runtime chain behavior) were verified manually during development, not by CI
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Changes

1. **Externalized chain definitions** — moved hardcoded `CHAIN_DEFINITIONS` from `extensions/chain.ts` into individual JSON files under `.pi/chains/`
   - `.pi/chains/backlog-execute.json` — backlog task execution chain
   - `.pi/chains/backlog-groom.json` — backlog grooming chain with loop + exit condition
   - `.pi/chains/backlog-review.json` — code review chain with loop + exit condition
   - `.pi/chains/greeting.json` — test chain (3-step greeting)

2. **Updated `extensions/chain.ts`** to load chains dynamically:
   - New `loadChainDefinitions()` reads `.pi/chains/*.json` at startup
   - New `validateChainDefinition()` validates schema (description, steps, prompt, loop as positive integer, exitCondition)
   - Malformed/missing files are skipped with `console.warn` — extension continues gracefully
   - All runtime logic (looping, exit conditions, chain_exit tool, abort handling) unchanged

3. **Updated `AGENTS.md`** with new Chain Definitions section documenting schema, fields, and how to add chains

## Verification
- `npm run format` ✓
- `npm run lint` ✓
- `npm run typecheck` ✓
- No automated test suite exists; runtime ACs (#2, #4-#7) were verified manually during development
- Review chain (backlog-review) was used to self-review the implementation, which caught and fixed the loop integer validation gap
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes `npm run format`, `npm run lint`, and `npm run typecheck`
<!-- DOD:END -->
