# Notify Me Extension

Part of [Agent Mod](../../README.md).

Build and load the extension with Pi 1.4.0 or newer:

```bash
nix build .#pi-notify-me
pi --extension ./result/index.ts
```

The output contains the entrypoint and all runtime helpers, not tests or
credentials. For persistent loading, add the output directory's absolute path
to the `extensions` array in `~/.pi/agent/settings.json` (or trusted project
`.pi/settings.json`), then run `/reload`. This extension is **not** installed by
`pi install`; configuration below is separate from Pi's extension settings.

## Configuration

Notify-me reads the fixed **`~/.pi/notify-me.json`** path when arming a
notification. This is not `~/.pi/agent/notify-me.json`, a project-local config,
or a path relocated by `PI_CODING_AGENT_DIR`. The JSON stores only a path to a
separate private UTF-8 file:

```json
{ "keyFile": "discord-webhook-url" }
```

For this example, save the **complete Discord webhook URL** in
`~/.pi/discord-webhook-url` using your editor. The URL already contains the
credential; no separate token is needed. Keep that file outside repositories,
never paste its contents into issues or logs, and restrict access:

```bash
mkdir -p ~/.pi
chmod 700 ~/.pi
# Create ~/.pi/notify-me.json and ~/.pi/discord-webhook-url using your editor.
chmod 600 ~/.pi/notify-me.json ~/.pi/discord-webhook-url
```

`keyFile` must be a nonempty string. Surrounding path whitespace is trimmed.
Paths resolve as follows (independent of Pi's working directory):

| `keyFile` example | Credential file |
|-------------------|-----------------|
| `"discord-webhook-url"` | `~/.pi/discord-webhook-url` (relative to `~/.pi`) |
| `"~/.config/pi/discord-webhook-url"` | Your home directory's `.config/pi/discord-webhook-url` (`~/` expansion) |
| `"/private/path/discord-webhook-url"` | That absolute path |

The loader trims surrounding whitespace in the credential file. It accepts
HTTPS webhook endpoints on `discord.com` or legacy `discordapp.com`, with a
numeric webhook ID and token at `/api/webhooks/<id>/<token>` or
`/api/v10/webhooks/<id>/<token>` (other positive API versions also work).
Port 443 is allowed; other ports, arbitrary/subdomain hosts, userinfo, query
strings, fragments, and malformed routes are rejected. Store the endpoint
itself, not a JSON object or a link with `?wait=true` appended.

Setup errors are controlled guidance, never raw parser/filesystem errors or
credential contents:

- **Cannot read config:** create `~/.pi/notify-me.json` and check that Pi can read it.
- **Invalid JSON/configuration:** use the JSON object above with a nonempty string `keyFile`.
- **Cannot read credential file:** check the resolved file exists and is readable by the Pi process.
- **Empty/invalid credential:** save the complete supported HTTPS webhook URL in the private file.

Configuration is read anew on each arm attempt; a successful arm retains its
validated destination. Invalid configuration does not arm a new notification or
replace an existing valid one. Local diagnostics never echo the supplied path
or webhook URL. See [configuration tests](./config.test.ts)
for the schema and path examples.

## One-shot commands and lifecycle

```text
/notify-me Remember to check the result
/notify-me A replacement reminder
/notify-me-cancel
```

- A nonempty message arms **one notification for the current session's next
  final handback**, whether Pi is idle, streaming, or waiting on a permission
  prompt. The command itself performs no model work or delivery.
- A valid replacement changes the pending message/destination and restarts
  elapsed time when validation succeeds. Invalid configuration preserves the
  previous arming. Out-of-order configuration reads cannot revive superseded
  work; cancellation or session reset also invalidates outstanding reads.
- `/notify-me <message>` is arm-only: every nonempty argument is ordinary
  reminder text, with no reserved words. Bare `/notify-me` shows
  `Usage: /notify-me <message>` without changing pending state.
- Use `/notify-me-cancel` without arguments to clear pending state and invalidate
  outstanding arm/configuration-validation attempts. This also invalidates a
  read still in progress when nothing is armed: late success or failure cannot
  arm a notification or show stale confirmation/diagnostics. It shows
  `Pending notification canceled.` when armed, or the informational
  `No armed notification.` otherwise. Nonempty arguments show usage without
  changing pending state or invalidating outstanding validation.
  Already-dispatched delivery is unchanged.
- Completion and terminal errors consume the one-shot **only at
  `agent_settled`**, after automatic continuation, retries, recovery, compaction,
  and queued work finish. Intermediate `agent_end` events do not notify.
  Recovered errors, tool failures, and assistant prose do not by themselves
  constitute an errored handback. A finished agent is not proof of task success.
- Deliberate aborts (including during retry, compaction, or the pre-settle
  boundary) clear pending state without sending. Permission or other blocking
  UI prompts leave it armed for eventual settlement.
- **Missing-model or missing-auth preflight failures before any run starts send
  nothing and leave the notification armed unchanged.** After configuration or
  login is fixed, a later actual final settlement consumes it once with that
  later run's outcome, not the earlier preflight error. Cancellation, session
  reset, or deliberate abort can still clear it first.
- Pending state is memory-only and session-scoped: new/resumed/forked sessions,
  reload, or process restart start unarmed. It is never saved in the transcript.

These semantics are covered by the registered-adapter sequences in
[`adapter.test.ts`](./adapter.test.ts), including separate
locked-runtime missing-model and missing-auth preflight checks.
[`runtime-sequences.test.ts`](./runtime-sequences.test.ts)
also exercises the locked SDK's outer continuation and settlement loop with
model-free fixtures. Runtime event ordering and the minimum SDK version are documented in the
[compatibility evidence](../../docs/notify-me-sdk-compatibility.md).

## Discord context, privacy, and delivery

The single embed prominently shows your supplied message and **Agent finished**
(green) or **Agent errored** (red), not a claim that the task succeeded. It
includes the **full working-directory path**, an available session name, elapsed
time, and an ISO final-handback timestamp. Elapsed time runs from successful
arming/replacement validation to final settlement, including idle time, permission
pauses, automatic continuation, and recovery; network/retry time is excluded.
An error includes only a concise first-line reason (no stack trace), or the honest
fallback **Reason unavailable.** No transcript, generated summary, or automatic
agent response is included.

**Your message, cwd, session name, and terminal error reason leave this machine
for Discord.** Consider sensitive paths/names and message contents before arming.
The known webhook URL/token is redacted from every outgoing text category; this
is not general-purpose redaction of unrelated secrets. Snapshot capture occurs
once at handback, before asynchronous delivery. All retries use identical JSON
and the credential validated when arming, even after files or sessions change.

Discord title/description/field/aggregate limits are enforced with conservative
UTF-16 budgets that never split a surrogate pair. Oversized text ends with a
visible **…**; status, cwd, elapsed time, timestamp, and applicable session/error
categories are retained. The message budget is 3000 units, cwd/session 1024 each,
and error reason 512, reserving room under the 6000-unit aggregate limit. Missing
session names are omitted. Mention parsing, explicit user/role mentions, and
reply mentions are disabled, including `@everyone` and supplied `<@...>` syntax.

Delivery is nonblocking, best-effort, and **in-process only**:

- Each request (including a rate-limit response body) has a **10-second timeout**.
- There are **at most five total attempts**. Network errors, timeouts, and HTTP
  5xx retry after **10 seconds**. Any HTTP 2xx ends delivery.
- HTTP 429 waits at least 10 seconds and the largest valid Discord interval:
  JSON `retry_after`, `Retry-After` seconds/HTTP date, or rate-limit reset headers.
  Discord JSON/reset intervals are seconds, including fractions. Invalid metadata
  falls back to 10 seconds; each rate-limited request counts as an attempt.
- Other HTTP failures (including credential/webhook/payload 4xx) and redirects
  stop immediately. Redirects are never followed. Response text and raw transport
  errors never enter local diagnostics.
- Final failure produces a controlled warning only while the originating UI is
  still current; obsolete-session or headless UI warnings are suppressed.

`/notify-me-cancel` and replacement affect pending work only (cancellation also
invalidates outstanding validation). Already-dispatched jobs remain independent
across new/resumed/forked sessions; changing sessions suppresses their obsolete
UI warnings, not delivery. Actual quit or extension-runtime reload
aborts requests and clears retry timers. Timers are unreferenced so retries do
not keep an otherwise exiting process alive. Nothing is persisted or resumed
on restart, and no background service or durable queue exists.

**Duplicates are possible:** Discord may accept a request before its response is
lost or times out, then accept a retry. Bounded retries improve reachability but
provide neither guaranteed delivery nor exactly-once delivery. See the
[payload tests](./payload.test.ts),
[transport tests](./delivery.test.ts), and
[job lifecycle tests](./jobs.test.ts) for model/network-free
coverage of these contracts.
