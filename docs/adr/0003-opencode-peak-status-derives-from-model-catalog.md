# OpenCode peak status derives from the published model catalog

Status: accepted (2026-11-13)

OpenCode Go prices some models differently inside recurring weekday/hour windows (currently 01:00–04:00 and 06:00–10:00 UTC, Monday through Friday), and the console docs can describe those windows. The inference gateway already publishes `GET https://opencode.ai/inference/go/v1/models`, authenticated with the same `opencode-go` provider key Pi holds. Each model's `cost.multipliers` carries the rules that determine when a multiplier applies: a `when` predicate over `utc_days`, `utc_hours`, nested `any`/`all`, or a `date` comparison, plus a `factor`.

We decided the extension derives peak/off-peak state from those catalog multipliers at runtime instead of hardcoding the documented schedule. Only recurring weekday/hour rules make a model eligible; date-based promo rules are ignored so a label cannot outlive a promo. The effective multiplier is the product of matching recurring rules, and a factor above one renders `peak`. The catalog is fetched at most once per process and cached only on success.

Considered alternatives:

- Hardcoding the documented 01:00–04:00 and 06:00–10:00 UTC windows: simple, but it silently becomes wrong when OpenCode changes the windows or applies time-of-day pricing to another model.
- Parsing the public documentation page: brittle markup and still a second source that can drift from the price the gateway actually charges.
- Asking the user to configure windows: duplicates published data and adds configuration for a single provider.
- Falling back to the documented schedule when the catalog is unreachable: hides catalog failures and reintroduces the hardcoded drift this decision avoids.

Consequences:

- The extension depends on a second undocumented endpoint. If either the usage endpoint or the catalog changes or disappears, that data source degrades independently; the catalog failure renders the meters without a tag, and the explicit refresh adds one warning.
- The success-only cache means one catalog read per process in the normal case, but every failed read retries on the next trigger. Failures are never cached into a permanent untagged state.
- UTC windows are interpreted with the process clock. A wrong local clock produces a wrong tag and countdown; timezone configuration and clock validation remain out of scope.
- Date-based multipliers are deliberately not part of the peak schedule. A future model with a mixed date and recurring rule would need this decision revisited.
- Tests cover the pure catalog/peak module and use fixed UTC instants; no network request runs in the gate.
- [ADR 0002](./0002-opencode-usage-reads-undocumented-inference-meters.md) remains accepted: the usage meters still come directly from the undocumented inference endpoint.
