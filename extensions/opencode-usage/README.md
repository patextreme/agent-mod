# OpenCode Usage Extension

Part of [Agent Mod](../../README.md).

Shows OpenCode Go allowance usage in the pi status bar as `opencode-go: 3.0% / 1.0% / 0.0%` (rolling five-hour / weekly / monthly consumed). While the selected model has a recurring time-of-day price multiplier, it also shows the current pricing side and the time to the next change:

```text
opencode-go: 3.0% / 1.0% / 0.0% · peak · 3h01m left
opencode-go: 3.0% / 1.0% / 0.0% · off-peak · 47m left
```

The peak tag uses the theme's warning colour; off-peak and every tagless model stay dim.

## Data sources

- **Usage:** undocumented `GET https://opencode.ai/inference/go/v1/usage` on the inference gateway, parsed by [`parse.ts`](./parse.ts).
- **Peak schedule:** undocumented `GET https://opencode.ai/inference/go/v1/models`, parsed by [`peak.ts`](./peak.ts). Its `cost.multipliers` rules are the only schedule source; there is no hardcoded fallback.
- Both requests reuse pi's resolved `opencode-go` provider key, so no separate configuration is needed.

The catalog is fetched at most once per process and cached only on success. A failed catalog read is retried on the next trigger; there is no polling loop and no fetch from the repaint timer.

## Eligibility and peak state

A model gets a tag only when the catalog lists a **recurring weekday/hour** multiplier for it (`utc_days.in` and/or `utc_hours.gte|lt`, composed under `any`/`all`). Date-only promo multipliers (such as a `date` comparison for a promo expiry) and models absent from the catalog never get a tag, so an expired promo cannot leave the label wrong.

The effective multiplier is the product of every matching recurring rule. A factor greater than `1` renders `peak`; otherwise it renders `off-peak`. The countdown reads to the next state boundary using this ladder:

| Remaining | Text |
|-----------|------|
| at least 1 day | `2d15h left` (a zero secondary unit is elided: `1d left`) |
| 1 hour to 1 day | `3h01m left` |
| under 1 hour | `47m left` |
| under 1 minute | `under a minute left` |

One self-rescheduling timer repaints at the earlier of the next state boundary and the next instant the countdown text changes. It only redraws cached state and never fetches. It is cleared on session shutdown, when the slot is cleared, and when switching to a model without a tag.

## Refresh behaviour

- Refreshes on `session_start` when the current model is already `opencode-go`, on `model_select` for `opencode-go`, and via `/opencode-usage-refresh`.
- Switching to another provider clears the slot, cancels the timer, and discards in-flight results.
- Automatic refreshes are silent. `/opencode-usage-refresh` reports the absolute window, for example `opencode-go: 3.0% / 1.0% / 0.0% · peak until 10:00 UTC (17:00 +07)`, and adds one warning when the catalog is unavailable.

## Failure matrix

| Usage read | Catalog read | Status slot |
|------------|--------------|-------------|
| succeeds | succeeds | meters with `peak`/`off-peak` tag and countdown |
| succeeds | fails | meters with no tag |
| fails | succeeds | `opencode-go: ? / ? / ?` with tag and countdown |
| fails | fails | `opencode-go: ? / ? / ?` with no tag |
| no provider key | no provider key | slot cleared silently |

Every failure path is non-throwing. A failed or partial usage response renders `?` for the affected meter; a malformed catalog is treated as unavailable.

## Non-goals

- Notifying when a boundary crosses mid-session.
- Displaying the doubled burn rate.
- Absolute clock times in the footer; those belong to the explicit refresh output.
- Timezone configuration; UTC windows are interpreted with the process clock.
- Polling, or any hardcoded fallback schedule when the catalog is unreachable.
