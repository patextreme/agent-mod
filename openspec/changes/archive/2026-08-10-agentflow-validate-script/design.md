## Context

The AgentFlow extension already validates flow scripts at run time inside `runAgentFlow()` (`index.ts`): `resolveFlowFile` → `validateFlowSyntax` (jiti) → `typeCheckFlowScript` (tsc), the last two in `discovery.ts`. This change reuses those exact checks as the basis for an on-demand path (see `proposal.md`). The extension already registers tools (`/af`) and understands the `pi.registerTool` API; the `af` authoring skill ships in-tree and is the place the LLM learns to author.

## Goals / Non-Goals

**Goals:**
- Reuse the existing `discovery.ts` low-level checks unchanged, so "validates clean" means "runs clean" — one source of truth for what a valid flow is.
- Give the main-session LLM and humans one shared, code-path-identical validation entry point.
- Keep the change small, testable, and dependency-free.

**Non-Goals:**
- No new lint / conventions pass (soft, opinionated checks are out of scope).
- No inline-content validation (Option A: existing file by name only).
- No change to the run path, `submit_result`, or script discovery order.

## Decisions

### Shared `validateFlowFile()` over duplicated logic
Both the tool and the command call one function, `validateFlowFile(name, cwd)` in a new `validate.ts`, returning a structured report `{ ok: boolean; name: string; errors: { message: string; line: number; col: number }[] }`.
- *Why:* one code path → identical behavior across tool and command; trivially unit-testable.
- *Alternative considered:* having `index.ts` call `discovery.ts` functions directly for both surfaces — rejected because it duplicates orchestration (resolve → read → syntax → type) in two places and couples command/tool wiring to discovery internals.

### Reuse `resolveFlowFile` for name resolution
`validateFlowFile` resolves the name via the existing `resolveFlowFile(name, cwd)` (project → global, `.ts` → `.js`), so validation honors the same search order the run path uses. Unresolvable → report `ok: false` with a "no script found" error and no location.
- *Why:* consistency with `/af`; zero new resolution logic.

### Syntax + type-check mirrored from the run path
`validateFlowFile` calls `validateFlowSyntax` (returns transpiled JS or throws) and, for `.ts`, `typeCheckFlowScript`. Both throw; `validateFlowFile` catches and converts thrown messages to located-`{ message, line, col }` errors. Line/col are parsed from the thrown message text where present (the runners already emit `line:col\tmessage`), else `0`.
- *Why:* identical acceptance criteria to the runtime; no new validation engine.
- *Trade-off:* relies on the existing error-message formats for location parsing. Acceptable because both functions are stable and already tested.

### Tool returns report as content, never throws
`agentflow_validate` builds text content from the report ("valid" or the error list) and returns it as a normal tool result. Invalid scripts do not throw from `execute`.
- *Why:* the LLM distinguishes "you called the tool wrong" (throw) from "the script has errors" (data). Throwing would make a fixable script look like a broken tool.

### `/af-validate` is read-only, no trust gate
The command validates by reading + compiling the script; it never executes it, so it does not gate on project trust the way `/af` does. Output goes through `ctx.ui.notify`.
- *Why:* reading a project file is not running it; the earlier trust gate exists to gate execution.

## Risks / Trade-offs

- [Line/col parsing depends on existing error message formats] → Mitigation: keep parsing minimal and defensive; treat unparseable locations as `0`; the existing runners already stabilize these formats.
- [`agentflow_validate` is always-on, consuming a tool slot] → Mitigation: it is cheap and lightweight; if it ever proves noisy we can gate it behind `pi.setActiveTools` as a follow-up.
- [Skill docs could drift from behavior] → Mitigation: the `agentflow-authoring` spec delta pins the skill to document `agentflow_validate`; the skill edit lands in the same change.

## Migration Plan

No migration — additive only. The run path and existing specs are unchanged. Rollback is a revert of the new `validate.ts` module plus the `index.ts` registrations and doc edits.