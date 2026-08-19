# Proposal: permission-yolo-toggle

## Why

The permission extension prompts on every unmatched command, which is safe but slow for trusted, repetitive work (format-run-test loops, scripted cleanups). Users with full trust in a task need a fast, explicit, and loudly-visible way to suspend all permission checks for the current session — with guardrails so it can never be enabled accidentally or silently persist.

## What Changes

- Add a `/permission-yolo` command that toggles YOLO mode:
  - Bare invocation toggles state; `on` / `off` set it explicitly; any other argument errors with a usage hint.
  - Enabling requires a confirmation dialog; refusing the dialog (or lacking a UI) leaves mode off. Explicit `on` when already on (or `off` when already off) is a no-op.
  - Disabling is immediate with no confirmation.
- While YOLO mode is on, the `tool_call` handler returns early and allows every bash command: `allow`, `ask`, and `deny` rules and the no-match prompt are all bypassed.
- While YOLO mode is on, a persistent yellow warning `⚠️ YOLO MODE ON` is shown in the status bar (via `ctx.ui.setStatus` with the theme `warning` token); it is cleared when the mode turns off.
- YOLO mode resets to off on `session_start`, and `/permission-reset` also disables it.
- No changes to `rules.ts`, its tests, or existing command behavior.

## Capabilities

### New Capabilities

- `permission-yolo`: Session-scoped YOLO mode for the permission extension — command surface (toggle/on/off with confirmation and argument validation), full bypass of all permission checks while enabled, persistent status-bar warning, and lifecycle (session reset, reset-command integration).

### Modified Capabilities

(none — the permission extension has no existing specs; existing commands keep their current behavior except that `/permission-reset` also clears YOLO mode, which is specified within `permission-yolo`.)

## Impact

- **Code**: `extensions/permission/index.ts` only — new module-level YOLO state, early return in the `tool_call` handler, one new `registerCommand`, edits to the `session_start` handler and `permission-reset` command handler.
- **Dependencies**: None. Uses existing pi extension APIs (`ctx.ui.confirm`, `ctx.ui.notify`, `ctx.ui.setStatus`, `ctx.ui.theme`).
- **Tests**: No new unit tests (command logic is UI-bound; per design decision Q7 it stays in `index.ts`). Existing `rules.test.ts` unaffected.
- **Quality gates**: `format → lint → typecheck → test`.
