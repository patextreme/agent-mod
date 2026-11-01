# OpenCode Usage Extension

Part of [Agent Mod](../../README.md).

Shows OpenCode Go allowance usage in the pi status bar as `opencode-go: 3.0% / 1.0% / 0.0%` (rolling five-hour / weekly / monthly consumed).

- Reads OpenCode Go's undocumented `GET /inference/go/v1/usage` endpoint on the inference gateway and shows the consumed percentage of each allowance window with one decimal place. The endpoint is undocumented and may change or disappear without notice; it is intentionally isolated behind the pure parser in [`parse.ts`](./parse.ts).
- Refreshes whenever an opencode-go model is selected — `/model`, Ctrl+P cycling, and session restore — and via `/opencode-usage-refresh`. There is no polling and no timer.
- Switching to a non-opencode-go model clears the slot and discards any in-flight fetch.
- Reuses pi's resolved opencode-go provider key, so no separate configuration is needed.
- Failure paths are non-throwing: a failed fetch renders the dim placeholder `opencode-go: ? / ? / ?`, a window whose status is not `ok` renders `?` only for that window, and a missing provider key silently clears the slot.
