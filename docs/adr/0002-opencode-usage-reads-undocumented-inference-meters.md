# OpenCode usage reads the undocumented inference meter endpoint

Status: accepted (2026-10-23)

OpenCode Go has rolling (five-hour), weekly, and monthly allowances, but no documented usage API. The Console API documents inference and budgets; its usage endpoints expose cost and token totals, and the Go subscription meters (`/console/api/go/status`, `/console/api/activity/go`) require broader workspace permissions or a console session cookie. The inference gateway exposes `GET https://opencode.ai/inference/go/v1/usage`, authenticated with the same `opencode-go` provider key Pi already uses, returning one consumed-percent meter per window with a reset timestamp.

We decided the extension reads that endpoint directly, treats it as undocumented and unstable, and degrades non-throwingly when it changes or disappears.

Considered alternatives:

- Scraping the Console dashboard with a session cookie: not viable for a CLI extension and requires interactive login.
- Reconstructing meters from `/console/api/usage/*`: those endpoints report cost and tokens, not the plan's own windows, so the percentages and reset times would drift.
- Counting tokens locally from Pi sessions: blind to usage from other clients and to the plan's model-specific dollar limits.

Consequences:

- The endpoint can change or disappear without notice; the status slot falls back to `?` and the manual refresh reports the failure.
- Tests cover only the pure response parser; no network request runs in the gate.
- The endpoint should be replaced by a documented usage API if one appears.
