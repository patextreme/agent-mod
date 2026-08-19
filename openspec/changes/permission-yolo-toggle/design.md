# Design: permission-yolo-toggle

## Context

The permission extension (`extensions/permission/index.ts`) gates bash commands in a single `tool_call` handler: rules from `rules.ts` produce allow/deny/ask outcomes, unmatched commands prompt unless `PI_SANDBOX=true`, and "always allow" answers accumulate in a module-level `Set` that resets on `session_start`. The extension already registers two commands and plays a bell before prompts. See proposal.md for motivation.

Constraints from the confirmed plan: full bypass (including deny rules), confirm-to-enable with no-UI refusal, status-bar-only feedback, reset on session start and via `/permission-reset`, no changes to `rules.ts` or its tests.

## Goals / Non-Goals

**Goals:**
- YOLO state that is obvious at a glance (footer warning) and impossible to enable accidentally (confirm dialog) or persist silently (session reset)
- Minimal diff: one file, one boolean, one early return, one command

**Non-Goals:**
- Persisting YOLO mode across sessions (pi's `appendEntry` session persistence could do it later)
- Any change to rule matching, `rules.ts`, or its test suite
- Extra feedback channels (notifications, bell) beyond the status bar

## Decisions

### D1: Single module-level boolean in `index.ts`
`let yoloEnabled = false` alongside `alwaysAllowed`. The `tool_call` handler checks it first and returns `undefined` (allow) for bash before any rule evaluation, so `allow`/`ask`/`deny` rules, sandbox logic, and no-match prompting are bypassed uniformly by construction.

*Alternative:* put the check in `findMatchingRule` or a `rules.ts` helper — rejected (design Q7): it would make rule matching stateful and pull UI-mode state into a dependency-free, unit-tested module.

### D2: Status updates via `ctx.ui.setStatus` in the command/`session_start` handlers
A small `setYoloStatus(ctx)` helper writes `ctx.ui.setStatus("permission-yolo", theme.fg("warning", "⚠️ YOLO MODE ON"))` when on and `setStatus("permission-yolo", undefined)` when off. Called from every state transition (enable, disable, reset, session start) so the footer never lies. Uses the theme `warning` token — the closest existing token to amber; overriding `warning` in a personal theme recolors it everywhere (design Q8).

*Alternative:* set/clear inside event handlers only — rejected: transitions happen in command handlers, so that's where the write belongs; re-setting on every transition is idempotent and cheap.

### D3: Enable flow — confirm first, then flip
`enableYolo(ctx)`: if `!ctx.hasUI`, error notify and stay off. Otherwise `ctx.ui.confirm("⚠️ Enable YOLO mode? ALL permission checks will be bypassed — every command runs without asking.")` (exact wording from design Q15). On decline, nothing happens. On accept, flip the flag and write the status. No bell — the user just typed the command, unlike mid-run ask prompts (design Q10).

*Alternative:* flip first, confirm after — rejected: a dialog should gate the state change, not decorate it.

### D4: Idempotent explicit set
The command resolves the target state first (`on`/`off`/toggle). If target equals current state, it's a no-op (design Q14); otherwise enable (via D3 flow) or disable (flip + status clear, no confirmation).

### D5: Disable paths share one function
`disableYolo(ctx)` flips the flag and clears the status. Used by `/permission-yolo off`, bare toggle, and `/permission-reset`. It is safe to call when already off (idempotent clear), which keeps `session_start` and reset handlers trivial.

### D6: No new tests
The command and state transitions are UI-bound (`ctx.ui.*`), and the bypass is a one-line early return — no matching logic worth unit-testing (design Q7). The existing 65-rule suite must keep passing.

## Risks / Trade-offs

- [Full bypass includes deny rules → nothing stops a destructive command while on] → Confirm dialog to enable + persistent yellow warning + session-scoped lifetime; users opt in per session with their eyes open.
- [Status bar is ambient; user may stop noticing it] → Accepted: yellow warning token plus ⚠️ glyph is the strongest always-visible signal pi offers; the confirm dialog is the attention gate.
- [Footer status slot could collide with other extensions] → Namespaced key `"permission-yolo"`; pi merges per-key status entries.
- [`tool_call` early return also bypasses future non-bash gates added above the bash check] → The early return sits at the top of the bash-specific path, guarded by `event.toolName !== "bash"` as today, so non-bash tools are untouched.

## Migration Plan

Single-file, backwards-compatible addition; no config or data migration. Rollback = revert the commit. Deploy: standard gates (`format → lint → typecheck → test`).
