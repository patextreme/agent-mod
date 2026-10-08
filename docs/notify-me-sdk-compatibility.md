# Notify-me: locked Pi SDK compatibility

## Source identity and minimum version

The notification contract requires Pi **1.1.0 or newer within major version 1**.
The previous lock selected 1.0.4; its `AgentSettledEvent` declared only `type`,
and `AgentSession._emitAgentSettled()` emitted `{ type: "agent_settled" }`.
That API cannot distinguish an abort during retry/compaction or the actionable
boundary from ordinary settlement. Do not substitute `agent_end`.

Evidence below is from the installed **locked npm package**, not the Pi host
running the coding assistant:

- Package: `@earendil-works/pi-coding-agent@1.1.0`.
- Tarball: <https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-1.1.0.tgz>.
- Lock/registry SRI: `sha512-SeEi/4hdcHNgA9UWlefZl7ZZpm3dzi2OoxNjDHsBJ9o298LNOtbL4DGKgitlEj6uCTccvtw6f2hlCkTPVJ2RXg==`.
- Source paths below are relative to that package in `node_modules`.

| File | SHA-256 |
|------|---------|
| `dist/core/extensions/types.d.ts` | `61fae1c4347b04a0a486589f96fba1ca9676a89ae0a02e639c677e1f1e061298` |
| `dist/core/agent-session.js` | `0ba5c847b4fd2fd838f71ea84885b9f3a4f15d9bf4b5493e2e88a41d1507e20b` |
| `dist/core/agent-session-runtime.js` | `928b6528bb17d26273af8f7023a4f98e5f440d5896a4280d060b9b3e1f9a6882` |

## Event signatures and ordering

- **Final settlement:** `extensions/types.d.ts:773–780` declares
  `agent_before_settle` with `BoundaryState.outcome` and `agent_settled` with
  required boolean `aborted`. The outcome union at line 728 is
  `"completed" | "aborted" | "error"`; registrations are declared at
  lines 1184–1194. `agent_settled` is notification-only, not a request to continue.
- **Automatic continuation:** `agent-session.js:1380–1413`
  (`_runAgentPrompt`) awaits the agent, loops through `_handlePostAgentRun` and
  `_runBeforeSettleBoundary`, and emits settlement only in `finally` after the
  loop. Lines 1415–1450 handle retry, compaction/recovery, and queued messages;
  lines 1452–1475 allow boundary-requested continuation. `agent_end` at
  lines 884–885 is therefore not the final handback.
- **Terminal outcome and reason:** `agent-session.js:488–490` derives
  `_lastActivityOutcome` from the assistant `stopReason`, not tool failures.
  Lines 916–921 forward finalized messages to extension `message_end` handlers;
  `extensions/types.d.ts:824–826` exposes the message. Assistant messages expose
  `stopReason` and optional `errorMessage`. Observe these without returning
  replacements, and reset observations on new work/session boundaries so
  recovery cannot leave an old reason attached to later completion.
- **Abort precedence:** `agent-session.js:1909–1919` (`abort`) sets
  `_agentRunAbortRequested` when a run is active, aborts retry/compaction/branch
  summary, marks an interrupted pre-settle boundary, then awaits idle.
  `_runAgentPrompt` tests this flag before boundary emission/continuation and
  still reaches its `finally` on abort. `_emitAgentSettled` at lines 684–696
  snapshots the flag and emits `{ type: "agent_settled", aborted }`.
  Thus the final flag remains authoritative even when `agent_before_settle`
  is skipped, or when its observed outcome predates a deliberate abort.
- **Preflight failures (user-selected retention policy):**
  `agent-session.js:1567–1580` rejects missing model/auth before
  `before_agent_start` and before the `_runAgentPrompt` call at line 1631.
  Neither failure emits a run settlement. They send nothing and leave the
  notification armed for later actual settlement; do not turn arbitrary UI
  errors into handback events.
- **Session reset and cleanup:** `extensions/types.d.ts:561–567` declares
  `session_start` reasons `startup`, `reload`, `new`, `resume`, and `fork`.
  `agent-session.js:2618` emits the initial event and line 2966 emits reload.
  `agent-session-runtime.js:101–112` aborts the outgoing run, emits
  `session_shutdown`, and disposes it before replacement. New/resume/fork
  replacement paths supply new `session_start` events at lines 141, 165, 211,
  229, 246, and 291. Clear session-local pending state on session start.
  `SessionShutdownEvent` at `extensions/types.d.ts:623–628` distinguishes
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
this source inspection does not claim those tests already exist.

Dependency checks performed for this adjustment:

1. `npm install`, then `npm ci` install the locked 1.1.0 SDK family with no
   dependency errors or reported vulnerabilities.
2. Compare all eight locked `@earendil-works/*` SRI values with the registry's
   version-specific `dist.integrity`; every value matches. In this installation
   npm supplied every integrity value, so no manual backfill was necessary.
3. Refresh `npmDepsHash` using `pkgs.lib.fakeHash` and the reported fixed-output
   hash, then rebuild `checks.x86_64-linux.tsc-check` successfully. The resulting
   hash is `sha256-sl2eWiozBgs8AvobwWg2t6TxYDfv9WUrP9ENSSMlKEI=`.

The existing permission extension remains on its existing `agent_end` bell
behavior. This notification compatibility adjustment changes no permission
policy or event registration.
