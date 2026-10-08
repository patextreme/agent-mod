# Design

## Context

See proposal.md for motivation and issue #73 for the settled product contract. This is a TypeScript Pi extension with no build step; extensions ship exclusively through Nix outputs. Existing code provides a permission bell on `agent_end`, but that event can precede automatic continuation and is not a suitable final notification boundary.

Pi's installed documentation exposes `agent_settled` as the notification-only final boundary, with an `aborted` flag, and `agent_before_settle` with completed/aborted/error outcome. Terminal assistant messages provide error reasons. The repository declares Pi ^1.0.4; locally installed modules are not reliable evidence of that locked version. The first implementation task must confirm event signatures and ordering against the locked SDK/runtime. Do not substitute `agent_end` for final settlement.

## Goals / Non-Goals

**Goals:** Isolate lifecycle policy from configuration, rendering, and delivery; make timers and HTTP behavior deterministically testable; keep credentials and untrusted response text out of diagnostics.

**Non-Goals:** No persistent state, delivery SDK, additional service abstraction, model-generated summaries, or changes to permission behavior. Do not use extension callbacks to request further model work.

## Decisions

### 1. Thin Pi adapter and independently testable policy

Use `extensions/notify-me/index.ts` as the registration adapter, backed by cohesive helpers for pending state/configuration, Discord payloads, and delivery. Keep helper interfaces narrow, and inject clock, request, and delay dependencies for tests rather than registering internal modules as extensions. Node filesystem and built-in fetch are sufficient; a Discord SDK would add dependencies without useful behavior.

Pending state holds a generation/session identity, message, arm timestamp, and validated webhook credential. Validate asynchronously before replacing state. Check the generation again before committing an arm so a late config read cannot resurrect state after cancellation, replacement, or session change. Bare command shows usage; the exact `cancel` argument is reserved. Clearing pending state does not mutate a dispatched job.

### 2. Final settlement with run-scoped outcome capture

Capture candidate terminal outcome from `agent_before_settle` and sanitized terminal assistant error information from message events. Treat these as observations only: intermediate runs and recoverable failures cannot themselves dispatch. Dispatch exclusively on `agent_settled`; its aborted flag takes precedence and clears pending state without delivery. Reset outcome tracking at the start of new work and on session boundaries so a prior error cannot contaminate later completion. Avoid treating tool failures or assistant prose as terminal errors.

At final settlement, atomically detach the pending state and snapshot cwd, available session name, elapsed time, timestamp, final outcome, and concise error reason. Repeated events then find no pending notification. If a reason is missing, use an honest unavailable-reason fallback. Missing-model/auth preflight failures before any run starts send nothing and leave the one-shot armed; they neither consume pending state nor constitute an errored handback. A later actual final settlement consumes it under the normal outcome and abort rules. Do not treat arbitrary UI errors as completion. Cover both missing-model and missing-auth failures followed by a later settled run in adapter tests, and document this behavior explicitly.

Use the real runtime event contract to cover abort paths that bypass `agent_before_settle`, queued continuation, retries, and compaction. If the locked API cannot establish this boundary, resolve SDK compatibility before implementation rather than weakening the spec.

### 3. Read configuration when arming, then retain the validated credential

Read the fixed path `~/.pi/notify-me.json`. Resolve `keyFile` against `~/.pi` unless absolute; expand leading `~/` and trim the UTF-8 file content. Validate a recognized Discord HTTPS webhook route containing its identifier/token. Reject arbitrary hosts, userinfo, malformed routes, and non-HTTPS destinations. Disable redirects during requests. Reading at arming gives immediate actionable failure and fixes a dispatched notification's destination even if files later change.

Do not echo raw parse input, webhook URLs, request errors, or Discord response bodies. Generate controlled configuration and delivery diagnostics; sanitize notification error reasons using the known credential and URL. Documentation recommends private credential files (for example mode 0600) outside repositories. The JSON contains the path, not the credential. No credential-setup command is necessary.

### 4. Stable, bounded embeds rather than free-form summaries

Use one embed with a prominent message, distinct completion/error presentation, compact context fields, and an ISO handback timestamp. Render `Agent finished`, not `Task succeeded`. Keep error explanations concise, excluding stack traces and transcripts. Omit unavailable session name; use full cwd when it fits. Enforce Discord title/description/field/aggregate limits using deterministic truncation with visible ellipses and preserve the status/context categories. Set `allowed_mentions` to disable parsing. Capture once and reuse the identical payload on every retry; do not read a later session's context.

### 5. In-memory delivery job with bounded requests and delays

Start delivery without awaiting its completion from the settlement handler, and always catch asynchronous failures. Use a 10-second per-request timeout and at most five total attempts. Retry transport errors/timeouts and HTTP 5xx after 10 seconds. Retry HTTP 429 after the maximum of 10 seconds and a valid Discord retry-after interval, with correct units and support for applicable header/body values. Invalid rate-limit metadata falls back to the normal delay. Treat other permanent HTTP 4xx and redirects as final failure. Any 2xx ends delivery.

Each dispatched job owns its immutable payload and credential; later arming/cancellation and session changes affect pending state only. Use unreferenced delay timers where supported so background delivery does not keep an otherwise exiting process alive. On shutdown abort outstanding requests and clear timers without persisting work. Warn safely after final failure when the originating UI is still appropriate; do not report an old session's failure as a new session's task error.

Retries improve reachability but cannot guarantee exactly-once remote delivery. Discord may accept a request before a timeout; the user explicitly accepts duplicate notifications in that case. No durable queue or background service is introduced.

### 6. Package with existing extension conventions

Add the `pi-notify-me` derivation in `nix/modules/pi-package.nix`, wire it into both `packages` and `checks`, and copy all runtime helpers into the package. Place unit and adapter tests as co-located `*.test.ts` files under `extensions/notify-me/` for automatic discovery by `tests/run.mjs` and the shared `node-tests` flake check; no per-extension test derivation or root registration edit is needed. Keep extensions excluded from package.json's `pi` resources. Update README and AGENTS.md. Dependency/lockfile changes are needed only if the compatibility check demands them; follow the project's integrity and npmDepsHash policy whenever dependency content changes.

## Risks / Trade-offs

- [Intermediate events resemble completion] → Dispatch only at final settlement and test actual adapter sequences, not just a state helper.
- [Outcome information becomes stale after recovery] → Scope observations to current work and prefer final observed outcome; test recovered errors.
- [Config reads race with cancel/session changes] → Generation checks before committing newly armed state.
- [Full cwd and session names disclose context] → Explicitly document the accepted payload; never include transcript or generated summary.
- [Error strings or response bodies contain credentials] → Controlled diagnostics and sanitized terminal reasons; adversarial secret-leak tests.
- [Discord limits reject oversized content] → Central payload budgeting and tests with Unicode and long fields.
- [Timeout retries duplicate delivery] → Accepted limitation; bounded attempts and documentation, not an exactly-once claim.
- [Process exits during retry] → No persistence; abort/cleanup and document best-effort in-process delivery.

## Migration Plan

No existing behavior changes. Publish the new Nix output, document loading it, and show configuration plus a separate private webhook-URL file. Run the focused tests and repository quality gates, including flake checks for packaging changes. Rollback consists of unloading the extension; it requires no stored-state migration.
