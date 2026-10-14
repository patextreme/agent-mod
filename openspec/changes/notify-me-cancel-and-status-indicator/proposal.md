# Proposal

## Why

Arming a notify-me notification gives only a transient toast; the user has no persistent indication that a notification is armed while work continues. Cancellation is hidden inside `/notify-me cancel` and is undiscoverable from the command list. A persistent status-bar indicator and a dedicated cancellation command make the armed state visible and cancellation explicit.

## What Changes

- Add a persistent armed status indicator: while a notification is pending, the status-bar entry `notify-me` shows `🔔 notify-me armed` (theme-colored); it clears whenever pending state goes away (delivery, cancellation, deliberate abort, session reset). No "arming in flight" or "delivering" states — the status mirrors pending state only.
- **BREAKING** Remove the reserved `cancel` subcommand argument: `message === "cancel"` no longer clears pending state; `/notify-me` becomes arm-only. The word `cancel` becomes an ordinary message that arms a notification with that text (no redirect hint, no special case).
- Add the dedicated slash command `/notify-me-cancel`: clears the pending notification through the same cancellation path (pending state only — already-dispatched delivery is unchanged). Nonempty arguments are rejected with a usage message and no state change; with nothing armed it shows an informational toast (`No armed notification.`).
- Update user-facing strings: command description and bare-`/notify-me` usage become `/notify-me <message>` (no "or cancel"). Arm toast and cancel-success toast text stay unchanged; cancel with nothing armed adds `No armed notification.`
- Update README (usage block, reserved-cancel paragraph, extension section) and rework the cancel-related tests, adding status-bar call-sequence coverage.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `notify-me`: the "Explicit one-shot arming" requirement loses its `/notify-me cancel` clause (cancellation moves to a dedicated `/notify-me-cancel` command requirement) and gains the armed status-indicator behavior; the "Nonblocking independent delivery" requirement's "Cancel after dispatch" scenario is reworded to reference `/notify-me-cancel`.

## Impact

- `extensions/notify-me/adapter.ts` — command registration (`/notify-me` description/usage), removal of the `cancel` argument match, new `/notify-me-cancel` registration and handler, status-bar setter wiring (set on arm / take / cancel / reset, using the ctx.ui `setStatus` API; unconditional writes are no-ops in headless mode).
- `extensions/notify-me/adapter.ts` status helper — the permission extension is the in-repo precedent (stable key, one idempotent setter, redrawn on every transition).
- `extensions/notify-me/` co-located tests (`adapter.test.ts`, `integration.test.ts`) — cancel paths reworked to `/notify-me-cancel`; new `setStatus` lifecycle assertions.
- `README.md` "Notify-me Extension" section — usage block and reserved-cancel paragraph.
- No changes to `pending.ts`, `delivery.ts`, `jobs.ts`, or dispatch semantics.