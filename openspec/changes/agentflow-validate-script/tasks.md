## 1. Validation module

- [ ] 1.1 Create `extensions/agentflow/validate.ts` with a `FlowValidationReport` type (`{ ok, name, errors: { message, line, col }[] }`) and a `validateFlowFile(name, cwd)` function that resolves the flow via `discovery.resolveFlowFile`, reports "not found" when unresolved, and otherwise runs `validateFlowSyntax` and (for `.ts`) `typeCheckFlowScript`, converting thrown errors into located report errors.
- [ ] 1.2 Add `extensions/agentflow/validate.test.ts` covering: valid script → `ok: true`; syntax error → `ok: false` with located error; `.ts` type error → `ok: false` with located error; unresolvable name → `ok: false` "not found" (mirroring `discovery.test.ts` style, using temp files under `.pi/agentflow/`).

## 2. Tool + command wiring

- [ ] 2.1 In `extensions/agentflow/index.ts`, register an always-on `agentflow_validate` tool (`pi.registerTool`) with a `name` parameter, whose `execute` calls `validateFlowFile` and returns the report as normal text content (never throws on an invalid script).
- [ ] 2.2 In `extensions/agentflow/index.ts`, register a `/af-validate` command that calls `validateFlowFile` and reports the outcome via `ctx.ui.notify` (no trust gate).

## 3. Docs + specs

- [ ] 3.1 Update `extensions/agentflow/skills/agentflow/SKILL.md` — replace the manual `tsc --noEmit` instruction in the "Validation workflow" section with `agentflow_validate` as the authoring-time check.
- [ ] 3.2 Update `README.md` to mention the `agentflow_validate` tool and `/af-validate` command.

## 4. Verification

- [ ] 4.1 Run `npm run check`, `npm run typecheck`, and `npm test`; fix any failures.
- [ ] 4.2 Run `nix flake check`.
- [ ] 4.3 Run `openspec validate` on the change and confirm the delta specs are coherent with the main specs.