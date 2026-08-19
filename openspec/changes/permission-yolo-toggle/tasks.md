# Tasks: permission-yolo-toggle

## 1. Core implementation

- [ ] 1.1 In `extensions/permission/index.ts`, add module-level `yoloEnabled` state plus `setYoloStatus`, `enableYolo` (no-UI refusal + confirm dialog), and `disableYolo` helpers per design.md D1–D3, D5
- [ ] 1.2 Add the YOLO early-return at the top of the bash branch of the `tool_call` handler: when enabled, return `undefined` before any rule evaluation, sandbox check, or prompting
- [ ] 1.3 Register `/permission-yolo`: bare toggles; `on`/`off` set explicitly with idempotent no-ops; invalid args error with `Usage: /permission-yolo [on|off]`; no notify on success (status bar is the feedback)

## 2. Lifecycle integration

- [ ] 2.1 In the `session_start` handler, reset `yoloEnabled` to off and clear the status-bar warning
- [ ] 2.2 In `/permission-reset`, also disable YOLO mode (clear flag + warning) alongside clearing always-allowed permissions

## 3. Verification

- [ ] 3.1 Run quality gates: `npm run format`, `npm run lint`, `npm run typecheck`, `npm test` — existing 65 tests must pass unchanged
- [ ] 3.2 Manual smoke test in pi TUI: toggle on (confirm shown), verify `⚠️ YOLO MODE ON` in warning color, run a command that would prompt (e.g. `git push --dry-run`) and confirm it runs unasked, toggle off, verify warning gone and prompt behavior restored; verify invalid arg errors
