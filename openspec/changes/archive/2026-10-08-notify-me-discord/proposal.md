# Proposal

## Why

Users running long Pi tasks need to leave the terminal without missing the final handback. A one-shot Discord notification provides an explicit, privacy-conscious reminder without creating a persistent subscription.

Originating issue: https://github.com/patextreme/agent-mod/issues/73.

## What Changes

- Add `/notify-me <message>` to arm one notification; replacement and `/notify-me cancel` manage pending state.
- Notify only after automatic continuation settles, including errors; deliberate aborts clear the notification and permission pauses leave it armed. Missing-model/auth preflight failures before any run starts send nothing and leave it armed for a later actual final settlement.
- Load `~/.pi/notify-me.json` with a `keyFile` pointing to a separate file containing the Discord webhook URL.
- Send a readable Discord embed with the supplied message, status, cwd, available session name, elapsed time, timestamp, and concise error reason when applicable.
- Deliver asynchronously with five total attempts, 10-second retry delays, Discord rate-limit handling, secret-safe local warnings, and no durable retry queue.
- Add co-located tests discovered by the shared gate runner, usage documentation, and the extension's Nix package/check wiring.

## Capabilities

### New Capabilities

- `notify-me`: Session-scoped one-shot notification arming, final-handback recognition, credential-file configuration, and bounded Discord embed delivery.

### Modified Capabilities

None. Existing permission and orchestration requirements remain unchanged.

## Impact

New code and co-located `*.test.ts` tests under `extensions/notify-me/`; updates to Nix packages/checks, README, and AGENTS.md during implementation. Tests run automatically through `tests/run.mjs` and the shared `node-tests` flake check; no root test registration edit or per-extension test derivation is needed. Use Pi extension lifecycle APIs and Node networking/filesystem facilities; no additional Discord SDK is expected. Confirm the required settlement API against the repository's dependency version before implementing and adjust the minimum supported version if necessary.

The supplied message, full cwd, and selected session context deliberately leave the machine for Discord. Webhook credentials must never enter diagnostics or embeds. Slack, Signal, executable hooks, generated task summaries, transcript forwarding, and persistent subscriptions/queues are out of scope.
