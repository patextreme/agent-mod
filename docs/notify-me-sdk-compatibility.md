# Notify-me: locked Pi SDK compatibility

## Source identity and minimum version

The notification contract requires Pi **1.4.0 or newer within major version 1**.
The contract itself dates from 1.1.0: the previous lock selected 1.0.4, whose
`AgentSettledEvent` declared only `type`, and `AgentSession._emitAgentSettled()`
emitted `{ type: "agent_settled" }`. That API cannot distinguish an abort during
retry/compaction or the actionable boundary from ordinary settlement. Do not
substitute `agent_end`. The 1.4.0 lock was adopted to match the Pi host this
package is developed and run against; the semantics below are unchanged, but
the run entry point is now `_startRun(trigger, onStarted)` where 1.1.0 had
`_runAgentPrompt(messages)`.

Evidence below is from the installed **locked npm package**, not the Pi host
running the coding assistant:

- Package: `@earendil-works/pi-coding-agent@1.4.0`.
- Tarball: <https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-1.4.0.tgz>.
- Lock/registry SRI: `sha512-Z41LpZ3yYHSC/UUps6Mr39UMFPwH8elhJBG9DY1P7kuzsE5qSK/6eMj2EHzO5evJRQWLbKSqUMw+4nCNtIyiQg==`.
- Source paths below are relative to that package in `node_modules`.

| File | SHA-256 |
|------|---------|
| `dist/core/extensions/types.d.ts` | `c5038d9410cfb13f5be391f46f13de338bc46ab4c9a7d064f7b962c0dc4a807c` |
| `dist/core/agent-session.js` | `436e8be3bbab2db475ce30bb5d0bb30f0046b19a3476f8cd57b8133e68891162` |
| `dist/core/agent-session-runtime.js` | `928b6528bb17d26273af8f7023a4f98e5f440d5896a4280d060b9b3e1f9a6882` |

## Event signatures and ordering

- **Final settlement:** `extensions/types.d.ts:796–805` declares
  `agent_before_settle` with `BoundaryState.outcome` and `agent_settled` with
  required boolean `aborted`. The outcome union at line 752 is
  `"completed" | "aborted" | "error"`; registrations are declared at
  lines 1210–1211. `agent_settled` is notification-only, not a request to continue.
- **Automatic continuation:** `agent-session.js:1423–1473` (`_startRun`) awaits
  the agent, loops through `_handlePostAgentRun` and
  `_runBeforeSettleBoundary` (lines 1450–1462), and emits settlement only in
  `finally` after the loop (lines 1464–1471). `_handlePostAgentRun`
  (lines 1531–1561) handles retry, compaction/recovery, and queued messages;
  `_runBeforeSettleBoundary` (lines 1566–1588) allows boundary-requested
  continuation. `agent_end` at line 904 is therefore not the final handback.
- **Terminal outcome and reason:** `agent-session.js:487–490`
  (`_dispatchTurnEndBoundary`) derives `_lastActivityOutcome` from the assistant
  `stopReason`, not tool failures. Lines 935–940 forward finalized messages to
  extension `message_end` handlers; `extensions/types.d.ts:848–851` exposes the
  message, and lines 1121–1124 allow a role-preserving replacement. Assistant
  messages expose `stopReason` and optional `errorMessage`. Observe these without
  returning replacements, and reset observations on new work/session boundaries
  so recovery cannot leave an old reason attached to later completion.
- **Abort precedence:** `agent-session.js:1971–1982` (`abort`) sets
  `_agentRunAbortRequested` when a run is active, aborts retry/compaction/branch
  summary, marks an interrupted pre-settle boundary, then awaits idle.
  `_startRun` tests this flag before boundary emission/continuation and still
  reaches its `finally` on abort. `_emitAgentSettled` at lines 683–707 snapshots
  the flag and emits `{ type: "agent_settled", aborted }`.
  Thus the final flag remains authoritative even when `agent_before_settle`
  is skipped, or when its observed outcome predates a deliberate abort.
- **Preflight failures (user-selected retention policy):**
  `agent-session.js:1679–1692` rejects missing model/auth before
  `before_agent_start` and before the `_startRun` call at line 1693.
  Neither failure emits a run settlement. They send nothing and leave the
  notification armed for later actual settlement; do not turn arbitrary UI
  errors into handback events.
- **Session reset and cleanup:** `extensions/types.d.ts:575–581` declares
  `session_start` reasons `startup`, `reload`, `new`, `resume`, and `fork`.
  `agent-session.js:2680` emits the initial event from the configured
  `_sessionStartEvent` (defaulted at line 199) and line 3028 emits reload.
  `agent-session-runtime.js:102–113` (`teardownCurrent`) aborts the outgoing
  run, emits `session_shutdown`, and disposes it before replacement. New/resume/fork
  replacement paths supply new `session_start` events at lines 141, 165, 211,
  229, 246, and 291. Clear session-local pending state on session start.
  `SessionShutdownEvent` at `extensions/types.d.ts:637–642` distinguishes
  `quit`/`reload` from `new`/`resume`/`fork`: session replacement is not process
  exit. Delivery implementation must preserve already dispatched jobs across
  session changes while releasing requests/timers on actual shutdown; pending
  state and dispatched jobs have different ownership.

## Reproducible checks

`extensions/notify-me/sdk-contract.test.ts` is a registration probe (not the
adapter or a live-model test). It registers typed `agent_start`, `message_end`,
`agent_before_settle`, `agent_settled`, `session_start`, and `session_shutdown`
handlers, reads terminal outcome/reason and the required abort boolean, and
checks observations with synthetic events. `npm run typecheck` verifies the
actual overloads against the locked SDK. It would reject `event.aborted` against
1.0.4. Runtime behavior/sequence tests belong to the lifecycle implementation;
`extensions/notify-me/runtime-sequences.test.ts` executes the locked
`_startRun`/post-run/boundary/settlement methods directly, so a rename or
reordering of that outer loop fails the suite instead of silently passing.

Dependency checks performed for this adjustment:

1. `npm install`, then `npm ci` install the locked 1.4.0 SDK family with no
   dependency errors. `npm audit` reports two advisories (one high, one moderate)
   against the `undici` version 1.4.0 pins as a runtime dependency; no released
   SDK version pins a fixed `undici`, so the finding is upstream and tracked
   rather than patched here.
2. Compare all seven locked `@earendil-works/*` SRI values with the registry's
   version-specific `dist.integrity`; every value matches. The generated lock
   carried an integrity value for every entry, so no manual backfill was
   necessary.
3. Refresh `npmDepsHash` using `pkgs.lib.fakeHash` and the reported fixed-output
   hash, then rebuild `checks.x86_64-linux.tsc-check` successfully. The resulting
   hash is `sha256-K028BLElpgR7dit4Ukmh7C/Ur5NnVn83zAZbSt5btQs=`.

The permission extension kept its then-existing `agent_end` bell behavior for
this notification compatibility adjustment; that bell was later removed in
[#84](https://github.com/patextreme/agent-mod/issues/84). This notification
compatibility adjustment changes no permission policy or event registration.
