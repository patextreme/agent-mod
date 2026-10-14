# Tasks

## 1. Make `/notify-me` arm-only (remove the reserved `cancel` subcommand)

- [ ] 1.1 In `adapter.ts`, remove the `message === "cancel"` match so every nonempty argument arms as an ordinary message; update the command description and bare-input usage string to `/notify-me <message>` (no "or cancel"). Verify: reading both strings in the registration shows no `cancel` mention.
- [ ] 1.2 Rework reservation-dependent tests in `adapter.test.ts` (exact-match reservation, interrupt-while-arming, detached-pending cases) to assert the new behavior: `cancel` arms normally, stray usage shows the new usage string. Verify: `npm test` reports these suites green.
- [ ] 1.3 Update `README.md` usage block, the reserved-cancel paragraph, and the extension section so no text claims `cancel` is reserved. Verify: `grep -in "cancel" README.md` shows `/notify-me-cancel` references only (plus retry/cancel-after-dispatch wording tied to the new command).

## 2. Armed status-bar indicator

- [ ] 2.1 In `adapter.ts`, add the stable-key status helper (key `notify-me`, themed `🔔 notify-me armed`) following the permission extension's idempotent-setter pattern, and call it on every pending-state transition: arm, replacement re-arm, `take()` at handback, deliberate-abort clear, and `resetSession()` on `session_start`/`session_shutdown`. Verify: `npm run typecheck` passes.
- [ ] 2.2 Add `setStatus` lifecycle tests asserting the exact call sequence across arm → cancel → re-arm → delivered → session reset, including the no-op behavior for headless contexts (stubbed `ctx.ui`). Verify: the new tests assert call-by-call status arguments and pass via `npm test`.

## 3. Dedicated `/notify-me-cancel` command

- [ ] 3.1 Register `/notify-me-cancel` in `adapter.ts` with a shared cancel path: clear pending, redraw status, confirm with the unchanged cancel-success toast; reject nonempty arguments with a usage message; show `No armed notification.` when nothing is pending. Verify: `npm run typecheck` passes.
- [ ] 3.2 Add `/notify-me-cancel` tests: success, stray-argument rejection, nothing-armed toast, cancel-after-dispatch leaves dispatched delivery unchanged (extending the `integration.test.ts` validated-arming cancellation sequences). Verify: suites pass via `npm test`.
- [ ] 3.3 Update README's command examples to `/notify-me-cancel` and its cancellation guidance. Verify: README renders the new command in the usage block and cancels-what section consistently with 1.3.

## 4. Verification

- [ ] 4.1 Confirm the delta is validated and implementation matches: `openspec validate notify-me-cancel-and-status-indicator` passes, and the `setStatus` lifecycle tests exercise every clear path named in the Armed status indicator scenarios. Verify: validate command exits 0 and `npm test` passes.
- [ ] 4.2 Run the full quality gates: `npm run check` (biome lint + format), `npm run typecheck`, `npm test`. Verify: all three exit 0.