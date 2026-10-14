# Design

## Context

The notify-me extension holds at most one pending notification in memory (`PendingNotifications` in `pending.ts`: `generation`/`session` guards, `arm()`, `clear()`, `take()`, `resetSession()`). Delivery dispatches on the next final handback (`agent_settled`) and runs as independent bounded-retry jobs that are already detached from pending state. The `/notify-me` handler in `adapter.ts` matches an exact `cancel` argument and, like the rest of the extension, uses `ctx.ui` only for transient toasts — the extension touches no status-bar API. The permission extension (`extensions/permission/index.ts`) is the in-repo precedent for status-bar feedback: a stable status key, one idempotent setter, called from every state transition so the footer never lies, safe in headless runs where `ctx.ui` is a no-op stub.

## Goals / Non-Goals

**Goals:**
- A persistent status-bar readout derived through a minimal nonmutating query of whether `PendingNotifications` has a pending record — set on arm, cleared on every transition where pending state goes away.
- A dedicated `/notify-me-cancel` command that is discoverable in the command list and shares one cancellation code path.
- Removing the `cancel` argument from `/notify-me`'s input space entirely (no reservation, no redirect shim).

**Non-Goals:**
- No changes to delivery lifecycle, retry policy, or dispatch semantics; cancellation continues to clear pending state and invalidate outstanding arm/configuration-validation attempts, never dispatched jobs.
- No new persisted state — the indicator is derived from memory-only pending state and dies with the session, same as the notification itself.
- No ticking countdown or elapsed-time display in the status bar.
- No change to arm-toast or cancel-success toast wording.

## Decisions

- **Mirror pending state, nothing else (no "arming…" / "delivering…" states).** The pending record is the single source of truth; a separate in-flight status would require extra `setStatus` churn around the async configuration read for no lasting value. Alternative considered: an "arming…" entry during configuration validation — rejected as transient noise.
- **Minimal read-only pending query.** Permit a boolean query in `pending.ts` that reports whether the private pending record exists, without consuming it or changing generation/session state. Use it for status rendering and cancellation-toast selection; do not introduce a second pending flag or duplicate state in the adapter. Existing `arm()`, `clear()`, `take()`, and `resetSession()` semantics remain unchanged.
- **Permission-style setter.** One idempotent helper redraws the entry from current state and is called from every state transition — after successful arm (and after a replacement re-arm), after `take()` at handback, after cancellation (`/notify-me-cancel` and the deliberate-abort clear path), and after `resetSession()` on `session_start`/`session_shutdown`. Calling on every transition (rather than only at state changes) keeps the footer truthful without local tracking of whether the entry changed. Alternative considered: `hasUI` gating of writes — rejected; `ctx.ui.setStatus` is a no-op stub without a UI, which the permission extension relies on, so an unconditional call is simpler and avoids stale-footer branches.
- **Stable key and themed text.** Key `notify-me` (dedicated, no collision with `permission-yolo`/`ollama-usage` keys); text `🔔 notify-me armed` colored via the theme's foreground helper, like the YOLO status entry.
- **`/notify-me-cancel` rejects argument noise.** Any nonempty argument is a usage error with no state change, including no generation invalidation; reject it before entering the cancellation path. This preserves the reserved-argument spirit of the old design (best-effort on garbage input is a foot-gun) while keeping `/notify-me` a pure arm command where `cancel` really is just message text.
- **No deprecation redirect for the bare word.** With the reservation removed, `/notify-me cancel` arms a notification reading "cancel". A special-case redirect was rejected per the settled design for simplicity; the ordinary-message interpretation is spec'd explicitly so tests pin it.
- **Accepted option B: cancellation always invalidates outstanding attempts.** For an argument-free `/notify-me-cancel`, query whether a notification is pending before unconditionally calling `clear()` and redrawing status. Show `Pending notification canceled.` if it was pending, otherwise `No armed notification.`. The latter's "no state changes" means pending notification state stays empty, not that the internal generation is unchanged: `clear()` must invalidate outstanding arm/configuration-validation attempts even when no notification is pending. Late success or failure from an invalidated attempt must neither arm nor produce stale confirmation/diagnostics or an armed indicator. Do not return early merely because the pending query is false; already-dispatched delivery remains independent.
- **Shared cancel path in one place.** The `/notify-me-cancel` handler and the abort/reset clear paths all funnel through the same pending-clear + status-redraw sequence; no duplicate status-clear logic sprinkled across call sites. Session reset retains its session-generation behavior, and final `agent_settled` consumption and deliberate-abort handling remain unchanged.

## Risks / Trade-offs

- [Users muscle-memorized `/notify-me cancel`; it now silently arms] → README documents the change; the status bar makes an accidental arm immediately visible, and `/notify-me-cancel` (or replacing the message) fixes it. Accepted per the settled design.
- [Status entry could go stale if a clear path is missed] → the setter runs on every transition of every clear site, and the `setStatus` lifecycle tests assert the exact call sequence for each path, so a missed redraw fails a gate.
- [Status bar assumes at most one pending notification] → true today by design (`PendingNotifications` holds a single record); the indicator-replacement scenario pins the exactly-one-entry behavior so a future multi-pending design must revisit this consciously.

## Migration Plan

None needed: the change ships in one release; the old `cancel` subcommand is removed outright (BREAKING) and documented in README. Rollback is a revert of the single implementation commit.

## Open Questions

None.