---
id: TASK-10
title: Add model field to chain YAML schema for per-chain model selection
status: To Do
assignee: []
created_date: '2026-05-05 07:48'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the chain definition schema to support an optional `model` field (e.g., `ollama-cloud/deepseek-v4-pro`) in chain YAML/JSON files. When specified, the chain execution should switch the agent's model to the requested provider/model before executing steps.

**Why?** Different chains may require different capabilities — a planning chain might use a reasoning-heavy model, while an implementation chain uses a code-specialized one. Currently there's no way to specify this per chain.

**Context:**
- Chain schema is in `extensions/chain/src/schema.ts` (`chainDefinitionSchema`)
- Chain execution logic is in `extensions/chain/src/execution.ts` (`executeChain`)
- Chain command handler is in `extensions/chain/src/index.ts`
- Model switching API: `ctx.modelRegistry.find(provider, modelId)` to resolve, then `pi.setModel(model)` to switch
- Example of model switching: the preset extension at `extensions/preset.ts` uses this pattern
- The `model` string follows the format `provider/modelId` (e.g., `"ollama-cloud/deepseek-v4-pro"`), parsed at the `/` separator
- The `model` field should be an optional string in the chain YAML, defined in the chain's top-level definition
- Model context should be saved before chain execution and restored after chain completion (including handoff)
- `$ARGUMENTS` substitution is NOT needed for the model field (model is a static configuration)

**Scope:**
This is a single focused PR:
1. Add `model` string field to the Zod schema in `schema.ts`
2. Add model resolution and switching logic at the top of `executeChain` in `execution.ts`
3. Restore the original model after chain execution completes (including after handoff chains)
4. Update the chain definition type export
5. Handle edge cases: model not found (warn and continue with current model), provider/model missing after slash (validate in schema)

**Key implementation details:**
- The `Model<Api>` type comes from `@mariozechner/pi-ai`
- `pi.setModel(model)` returns `Promise<boolean>` — false if no API key available
- The model switching should happen BEFORE any steps are executed
- On restoration: after the chain (including any handoff chains) fully completes, restore the original model
- Handoff chains: if a target chain does NOT specify its own `model`, it inherits the parent chain's model setting. The original model (before the outermost chain) is restored after the full handoff chain completes.
- A chain with no `model` field should not change the model at all
- The model change and restoration should be silent (no user notifications), but failures to find/set a model can be logged via `ctx.ui.setStatus('chain', ...)` for troubleshooting

**Edge cases to handle:**
- Model field present but empty string → Zod validation fails, chain skipped with warning
- Model field present but no `/` separator → validation fails, chain skipped with warning
- Model not found in registry → log warning via status, continue with current model
- Model found but `pi.setModel()` returns false (no API key) → log warning, continue with current model
- Nested handoff chains with different models — each chain sets its own model if specified; restore cascades back to original
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new optional `model` field (string) is added to `chainDefinitionSchema` in `extensions/chain/src/schema.ts`
- [ ] #2 The `model` field is validated as a non-empty string in the format `provider/modelId` (containing at least one `/`)
- [ ] #3 At the start of `executeChain`, if `definition.model` is set, the agent switches to that model via `ctx.modelRegistry.find()` and `pi.setModel()`
- [ ] #4 The original model is saved before chain execution and restored after completion (including after handoff chains)
- [ ] #5 If the model is not found in the registry, a warning is shown via status bar and execution continues with the current model
- [ ] #6 If `pi.setModel()` returns false (no API key), a warning is shown via status bar and execution continues with the current model
- [ ] #7 Handoff chains inherit the parent chain's model setting if the target chain doesn't set its own model, and the original model is restored after the full handoff chain completes
- [ ] #8 Chain YAML files with invalid `model` values are skipped with a descriptive validation warning
- [ ] #9 `$ARGUMENTS` is NOT substituted into the model field
- [ ] #10 Model switching is silent (no user-facing notifications for success), only failures are reported via `ctx.ui.setStatus('chain', ...)`
- [ ] #11 Passes `npm run format`, `npm run lint`, `npm run typecheck`, `nix flake check`
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Passes npm run format
- [ ] #2 Passes npm run lint
- [ ] #3 Passes npm run typecheck
- [ ] #4 Passes nix flake check
<!-- DOD:END -->
