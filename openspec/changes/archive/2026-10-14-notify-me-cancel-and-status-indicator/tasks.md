# Tasks

## 1. Make `/notify-me` arm-only (remove the reserved `cancel` subcommand)

- [x] 1.1 In `adapter.ts`, remove the `message === "cancel"` match so every nonempty argument arms as an ordinary message; update the command description and bare-input usage string to `/notify-me <message>` (no "or cancel"). Verify: reading both strings in the registration shows no `cancel` mention.
- [x] 1.2 Rework the exact-match reservation and bare-usage tests in `adapter.test.ts` to assert the new behavior: `cancel` arms normally, bare usage shows the new usage string. Retarget interrupt-while-arming and detached-pending cancellation cases to `/notify-me-cancel` under task 3.2, not to ordinary-message arming. Verify: `npm test` reports these suites green.
- [x] 1.3 Update `README.md` usage block, the reserved-cancel paragraph, and the extension section so no text claims `cancel` is reserved. Verify: `grep -in "cancel" README.md` shows `/notify-me-cancel` references only (plus retry/cancel-after-dispatch wording tied to the new command).

## 2. Armed status-bar indicator

- [x] 2.1 Add a minimal nonmutating boolean pending-state query in `pending.ts` for status rendering and cancellation-toast selection; test that querying does not consume pending state or invalidate an arm generation. Keep the private pending record as the single source of truth, with no adapter-side pending flag and unchanged generation/session, `arm()`, `clear()`, `take()`, and `resetSession()` semantics. In `adapter.ts`, add the stable-key status helper (key `notify-me`, themed `🔔 notify-me armed`) following the permission extension's idempotent-setter pattern, and call it on every pending-state transition: arm, replacement re-arm, `take()` at handback, deliberate-abort clear, and `resetSession()` on `session_start`/`session_shutdown`. Verify: `npm run typecheck` and the query tests via `npm test` pass.
- [x] 2.2 Add `setStatus` lifecycle tests asserting the exact call sequence across arm → cancel → re-arm → delivered → session reset, including the no-op behavior for headless contexts (stubbed `ctx.ui`). Verify: the new tests assert call-by-call status arguments and pass via `npm test`.

## 3. Dedicated `/notify-me-cancel` command

- [x] 3.1 Register `/notify-me-cancel` in `adapter.ts` with a shared cancel path: reject nonempty arguments before any mutation; otherwise query pending state before unconditionally clearing pending and invalidating outstanding arm/configuration-validation attempts, then redraw status. Use the unchanged cancel-success toast if a notification was pending, or `No armed notification.` otherwise; do not skip `clear()` when nothing is pending (option B). Verify: `npm run typecheck` passes.
- [x] 3.2 Add `/notify-me-cancel` tests: success, stray-argument rejection preserving both pending state and outstanding validation, nothing-armed toast, and cancel-after-dispatch leaving dispatched delivery unchanged. Retarget `adapter.test.ts` interrupt-while-arming and detached-pending cases and `integration.test.ts` validated-arming cancellation sequences to the dedicated command. Specifically, with no pending notification and a deferred configuration read, cancel must show `No armed notification.` and invalidate the attempt; resolving it successfully or with failure must produce no pending notification, stale confirmation/diagnostic, armed indicator, or delivery. Verify: suites pass via `npm test`.
- [x] 3.3 Update README's command examples to `/notify-me-cancel` and its cancellation guidance, including invalidation of outstanding validation even when nothing is pending and unchanged already-dispatched delivery. Verify: README renders the new command in the usage block and cancels-what section consistently with 1.3.

## 4. Verification

- [x] 4.1 Confirm the delta is validated and implementation matches: `openspec validate notify-me-cancel-and-status-indicator` passes, and the `setStatus` lifecycle tests exercise every clear path named in the Armed status indicator scenarios. Verify: validate command exits 0 and `npm test` passes.
- [x] 4.2 Run the full quality gates: `npm run check` (biome lint + format), `npm run typecheck`, `npm test`. Verify: all three exit 0.