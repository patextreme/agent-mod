# Tasks

## 1. SDK compatibility and safe configuration

- [x] 1.1 Confirm the locked Pi SDK/runtime supports final settlement, terminal outcome/error capture, abort ordering, and session reset; record source-bound evidence and verify the proposed event registrations typecheck. If a minimum-version adjustment is required, update dependency metadata, lock integrity, and npmDepsHash per project policy, verifying installation and Nix dependency checks before proceeding.
- [x] 1.2 Implement `~/.pi/notify-me.json` and `keyFile` loading with absolute/relative/tilde paths, whitespace trimming, Discord HTTPS endpoint validation, and controlled diagnostics; verify temporary-file tests cover valid setup, malformed/missing/unreadable configuration and secrets, unsafe URLs, and no credential leakage.
- [x] 1.3 Document the fixed config path, separate private credential file, recommended file permissions, and actionable setup errors in README; verify examples match tested path-resolution and schema behavior.

## 2. Pending state and Pi lifecycle adapter

- [x] 2.1 Implement `/notify-me <message>`, replacement, reserved `cancel`, bare usage, arm timestamps, session reset, and generation-safe asynchronous validation; verify tests cover command behavior, invalid replacement preservation, out-of-order reads, cancellation/session changes during reads, and idle/streaming arming.
- [x] 2.2 Implement final-settlement-only consumption, run-scoped outcome/error capture, abort clearing, and permission-pause retention; verify adapter event-sequence tests cover automatic continuation, recovery, compaction, queued work, terminal errors, recovered/tool errors, abort paths, repeated settlement, and stale outcome reset. Include separate missing-model and missing-auth preflight failures before any run starts: assert no send or pending-state consumption, unchanged arming, and subsequent once-only delivery using the later actual settled run's outcome.
- [x] 2.3 Document one-shot semantics, abort/permission behavior, session scope, command reservation, and that missing-model/auth preflight failures before any run starts send nothing and leave the notification armed until later actual final settlement, subject to cancellation/session-reset/abort rules; verify each documented behavior corresponds to a passing adapter test or confirmed runtime evidence.

## 3. Embed rendering and bounded delivery

- [x] 3.1 Implement immutable handback context snapshots and readable completion/error embeds with message, cwd, optional session name, elapsed time, timestamp, and concise sanitized error reason; verify snapshot/payload tests cover both outcomes, missing reasons/names, context changes, credential redaction, and exclusion of transcripts, responses, and generated summaries.
- [x] 3.2 Enforce Discord field/aggregate limits, visible truncation, and disabled mentions; verify boundary tests include long messages, cwd/session/error fields, Unicode, and mention syntax while retaining required context categories.
- [x] 3.3 Implement nonblocking delivery with a 10-second request timeout, five total attempts, 10-second transient delays, Discord rate-limit intervals, permanent-failure classification, redirect refusal, and safe final warnings; verify fake-request/fake-clock tests cover success, network/timeouts/5xx, 429 units and fallback, 4xx, attempt exhaustion, stable retry payloads, and unhandled-rejection prevention without real network calls.
- [x] 3.4 Implement independent dispatched jobs and shutdown cleanup without persistence; verify tests show later arming/cancellation/session switching cannot mutate dispatched jobs, Pi remains interactive during retries, shutdown releases requests/timers, and retries do not keep the process alive unnecessarily.
- [x] 3.5 Document embed context/privacy, elapsed-time meaning, retry policy, finite timeout, duplicate risk, and best-effort in-process delivery; verify documentation matches the tested payload and delivery behavior.

## 4. Packaging and integrated gates

- [x] 4.1 Add the `pi-notify-me` Nix derivation and wire it into both packages and checks; place co-located `*.test.ts` notification tests under `extensions/notify-me/` for automatic discovery by `tests/run.mjs` and the shared `node-tests` flake check, without a per-extension test derivation or root registration edit. Keep extensions excluded from `pi install`; verify the built package contains every runtime helper, the root runner discovers the notification tests, and the shared `node-tests` check passes.
- [x] 4.2 Update README extension inventory/loading examples and AGENTS.md repository layout/conventions; verify names and paths match the packaged extension and commands.
- [x] 4.3 Run focused adapter integration tests spanning validated arming, final handback, embed capture, and delivery with retry/cancel/session interleavings; verify all spec scenarios have test coverage and existing permission behavior is unchanged.
- [x] 4.4 Run quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`) and `nix flake check`; verify all pass, with lockfile integrity/npmDepsHash refreshed only when dependency content changes.
