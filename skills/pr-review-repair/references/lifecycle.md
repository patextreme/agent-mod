# Lifecycle guard

Read before preparation, every dispatch/result, resume, and finish. [lifecycle.mjs](./lifecycle.mjs) is a dependency-free transition validator, not an agent runner or evidence evaluator. The orchestrator still inspects actual artifacts, applies the repair policy, and accepts coverage/check evidence under [review scope](./review-scope.md). A true flag is an attestation backed by those artifacts, never a substitute for them.

## Persist before spending

Keep one JSON journal outside the PR's tracked files. Resolve `lifecycle.mjs` relative to this bundled reference, not an installed default skill. Commands (absolute paths in actual calls):

```bash
node lifecycle.mjs init RUN.json CONTRACT.json
node lifecycle.mjs show RUN.json
node lifecycle.mjs apply RUN.json EVENT.json
```

`init` exclusively creates a new journal; it refuses overwrite. `apply` replays the saved prefix, validates one event, and atomically replaces the journal only on success. A revision mismatch, lock, invalid event, or unexpected head is a stop, not permission to dispatch anyway. One writer owns the journal. After a crash, reconcile the journal and any `.next` file before removing a stale `.lock`; never discard the only copy of accepted work.

API: `createRun(contract) -> journal`, `append(journal, event) -> newJournal`, `replay(journal) -> state`. Failed appends leave the original journal untouched. Version 1 journals contain only the immutable contract and ordered boundary events; full reports/diffs stay in their normal audit artifacts, not a second transcript system.

Before the first setup delegate, persist a provisional contract with `runId` (original head SHA), exact `pr` identity, pinned `base` (merge-base SHA), initial aligned `head`, `limit` (default 3; integer 1–3), and accepted `budgets`. Resolve ambiguous PR selection with the user rather than investigating multiple PRs. Accept the sticky preparation contract only after complete preparation evidence. The effective contract includes the following finite defaults, materialized in the journal:

| Stage | Total dispatch attempts for the entire run |
| --- | ---: |
| prepare | 3 |
| review | 6, additionally at most 2 attempts per consumed round |
| judge | 6 |
| investigate | 6 |
| repair | 6 |
| validate | 6 |
| verify | 9 |
| deliver | 24 (each commit, push, comment or recovery attempt spends one) |

Accept any maintainer-selected positive finite integer stage budgets at creation; freeze them thereafter. Delegate with `max_turns` bounded by the contract's `maxTurns` (default 20), including investigation and preparation. Splitting a stage into more agents, tool batches, or continuations spends additional attempts; it is not free bookkeeping. The two independent review axes are one bounded review attempt: each receives that turn bound. Direct orchestration performs boundary checks, not unmetered investigation.

`show` returns stage, active operation, consumed/remaining rounds, all attempt counts, repair-cycle count, failed verifications, stalls, findings, delivery receipts and revision. Include these in every accepted handoff. A repair cycle starts once per authorized repair operation; retrying it spends another attempt but retains its cycle and ID.

## Events at procedure boundaries

Every event supplies `revision` equal to the current journal event count and `observed: {base, head, remoteHead}` freshly checked against the expected phase-specific git/PR state. A complete commit/push result observes its authorized new local/remote head, not the old one. A `pause` can record mismatching actual heads without accepting them. The validator compares these assertions; it does not execute git or fetch GitHub. Dirty files during repair must be attributable to the preserved authorized operation; unrelated changes pause the run.

| Event | Required data and effect |
| --- | --- |
| `start` | `stage`, and for `deliver`, `effect`. Persist **before** dispatch; charges the attempt immediately. Only the expected stage may start. |
| `result` | `complete` boolean, `record` (artifact/receipt locator), plus stage data below. Accept only actual complete evidence. |
| `pause` | `reason`: exact blocker, preserved work and recovery input; retains stage, active operation and counts. |
| `resume` | `runId`, `limit`, `stage`, exact `counts`, `authorization`: reconciled history/input reference. Restores the same operation; allocates nothing. |
| `limit` | `limit`, `authorization`: a smaller **total** discovery limit. If two rounds were consumed and the user asks for one total, keep two consumed, zero remaining, effective limit one. It never grants another round. |
| `reconcile` | While paused, `authorization` and newly verified aligned `observed` heads at the same pinned base. Invalidates old evidence and retains counts/findings. An unfinished preparation or unjudged round remains obligatory. For repair before any delivery effect, additionally require `operation` (original repair ID), `ownershipPreserved: true`, `noEffect: true`, and `record` proving safe ownership reconciliation: keep that repair ID/cycle and retry repair or fresh validation, never skip to review. If commit/push/comment effects already exist, preserve all receipts and escalate for human recovery rather than resetting them or silently rebasing. Base changes require human reconciliation, not an automatic new window. |
| `notice-start` / `notice-result` | While paused, charge a delivery attempt before publishing an escalation record, then save `complete`, `record`, and verified `receipt`. Preserve the separate repair/delivery operation. A failed publication remains bounded; report missing receipts directly if it cannot proceed. A completed notice cannot repeat within that pause. |
| `finish` | No new evidence: checks the previously accepted current-head evidence and verified summary receipt. |

For review and verify, `record` locates the accepted stage manifest: actual absolute paths to each substantive report, `coverage.json`, `coverage-evaluation.json`, saved originals and handoff, plus evaluator exit statuses and the supervisor's manifest/source/check acceptance. Review includes both independent axes; verify includes every recorded ID. Apply the mandatory [coverage evidence evaluation](./coverage-evidence.md) before attesting complete coverage. The lifecycle guard validates transitions and attestations, not these files; the coverage evaluator validates declarations, not substantive review or check success. Pass the actual locators to the next delegate. Preserve complete accepted axis/verifier reports, coverage handoff/evaluation, and the ledger/check/accounting/operation evidence required by Report contracts in the durable audit, not just local paths. Saved original source/diff read outputs remain private recovery artifacts with pinned-source pointers; retain actual exposure evidence for compaction recovery without publishing every source read or the full diff.

Stage-specific complete results:

- `prepare`: `record` points to the complete accepted preparation contract, including sources, identity, history, checks and prerequisites.
- `review`: `evidence: {head, standards: true, spec: true}` only after **both complete full-diff axis reports** and their evaluated coverage have been accepted. Starting a round consumes it even if interrupted. A continuation stays in that same round; it does not buy a new window.
- `judge`: `findings` (the complete reconciled ledger), `checks`. Alternatively `uncertain: true` routes to bounded `investigate`, never to repair. `investigate` returns evidence to a new bounded judgment attempt; uncertainty still present at exhaustion escalates.
- `repair`: `files` lists only repair-owned files/hunks. The preserved repair operation contains its authorized finding IDs; a partial result never replaces that operation.
- `validate`: `evidence: {head, checks}` and `inspected: true` after independent inspection of actual changes and completion of applicable checks. Only this boundary authorizes signed delivery.
- `verify`: `evidence: {head, checks}` and `findings` reconciling **every** recorded ID, including resolved IDs. Accept only after the verifier's evaluated coverage and substantive per-ID inspection under Review scope. It runs only after discovery closes. New in-scope repair-worthy IDs escalate and never become automatic repair scope on a later resume; other newly noticed issues retain policy classification.
- `deliver`: effects are `commit` → `push` → `comment` for a repair, only `comment` for a final summary. Each has its own `start` and `result`. Every result needs a verified `receipt`. Commit additionally needs `commitHead`, `signed: true`, `outgoingVerified: true`; push needs exact `remoteHead`. Receipts are never permission to merge or force-push. The final summary must name the outcome, effective limit and limitations.

Each ledger entry is `{id, status, evidence}`, where `status` is `open`, `resolved`, `deferred`, or `report-only`. Keep full policy justification alongside the evidence locator; the guard validates reconciliation, not severity/scope judgment. `checks` is `pass`, `failed` (PR-caused), or `unrelated` (reported material limitation). Failed checks are repairable only alongside open findings, never completion evidence. Unknown/unavailable required evidence is incomplete. Unrelated failures escalate before discovery closes; afterwards they remain visible limitations and are never called passing. Because this guard validates attestations and not check evidence, it accepts an `unrelated` limitation at any boundary, mid-window or after closure: the answer to the escalation — for example a human "environmental, proceed" decision — is recorded in the `reconcile`/`resume` `authorization`, and the run continues at the same limit. That acceptance closes no discovery, allocates no round or attempt of its own, and can never yield a `verified` outcome.

An incomplete `result` has `complete: false`, `record`, and `progress: [stable completed evidence units]`, such as inspected full-diff files or resolved source questions. Independently verify these units. Merely returning a longer report or renaming units is not progress. No new completed unit pauses immediately; otherwise retry only within the unchanged stage and per-round budgets. Exhaustion preserves the incomplete result and escalates. Neither a partial axis report nor an incomplete final round can become accepted review evidence.

Verification progress means the open set lost at least one ID and gained none. Two non-advancing verifications or three failed verifications of an open ID escalate. A resolved ID reopening counts as regression, not new repair scope. The finite stage budgets also cap advancing loops and repeated interruptions.

## Recovery and durable handoff

Persist every `start` locally before dispatch, every accepted result before the next stage, and the complete transition journal in the collapsed audit of each durable PR record. Include the active comment operation's journal prefix and replayed state inline in the publication evaluator's accounting item under [audit publication](./audit-publication.md#lifecycle-accounting-handoff); read-back then records that comment's own receipt locally. Apply the publication plan/recover gates to both ordinary comments and escalation notices before accepting their result, passing actual input/output/receipt locators in `record`'s delivery manifest. On resume, recover that last receipt from the verified comment URL/ID before any retry. The next record carries the extended prefix. This avoids the self-referential requirement to include a comment's future URL in itself.

Recover the **same** journal from local state and verified paginated PR records. Compare prefixes, retain any reconciled unpublished suffix, and run `show`; never call `init` to resume. If identity, counts, or an unpublished suffix cannot be reconstructed, pause for human reconciliation. Restore original limit/budgets, active stage, ledger, repair ownership and partial delivery, not just the last delivered SHA. A shorter limit is a `limit` event in this history, not a new contract.

After replay and history reconciliation, a terminal journal returns its reconciled existing outcome; it accepts no further events and never allocates a new run. For a nonterminal unpaused journal, persist `pause` with the interruption/recovery reason and actual observed heads **before recovery and guarded resume**. This records the crash boundary without clearing the active attempt, authorized operation or charged effort. An already paused journal retains its existing boundary.

An outstanding `start` already spent its attempt. While paused, recover any completed authorized delivery effect or active escalation notice by independently verified read-back against that same `start` or `notice-start`; append its `result` or `notice-result` without another dispatch. Re-read the state after receipts: a comment receipt can advance the stage, and commit/push receipts update expected heads. External changes beyond the authorized effect still require `reconcile` or honest escalation; a signed delivery is never silently replaced. Since accepted `reconcile` clears the pause, persist a new recovery `pause` with actual observed heads before `resume`. Supply the original `runId` and the exact **current** `limit`, `stage` and `counts`, plus the reconciliation/authorization reference; resume allocates nothing. After interruption, accept its already-produced stage result only with independently verified artifacts. If a worker must be relaunched, record the abandoned attempt's incomplete result, then persist another `start`. For a possibly completed commit, push or comment, first inspect/read-back the actual effect and record its receipt against the existing active attempt; never blindly retry a side effect. A known failed attempt records incomplete output before another bounded start of the same missing effect. Completed effects cannot start again. Resume cannot skip an authorized unfinished repair to begin review.

Any rejected boundary or exhausted budget goes to the control flow's escalation path. Preserve work, journal and missing receipts; use `notice-start` / `notice-result` to post/read-back the escalation record when possible, otherwise disclose the unrecorded state directly. Notice dispatches use the same finite turn bound and delivery budget as other publication. Escalation is an honest outcome, not `finish` success. Remaining rounds are permission, not a quota: a complete clean first round finishes immediately; closing discovery alone proves nothing about unresolved IDs, checks, coverage, signatures or delivery.

## Worked boundaries

Clean first round: `prepare` → `review` (rounds 1/3) → `judge` (empty ledger, passing checks) → `deliver:comment` → `finish verified`. There is no second review.

Maintainer selects one total round: `review` (1/1) → `judge` (F1 open) → `repair` → `validate` → signed `commit`, exact-branch `push`, verified `comment` → `verify` every recorded ID at the delivered head → final `comment` → `finish limited coverage`. A clean verifier is not a clean discovery round.

Interrupted Spec axis: saved `start review` has already consumed round 1 and attempt 1. Resume preserves both. Record incomplete evidence with Standards' actual completed units, then charge attempt 2 for the same full-diff round. If it remains incomplete, escalate rather than accepting partial coverage or starting round 2.

Signed commit succeeded but push response was lost: recover the active push by exact-branch remote SHA read-back. Keep its repair ID, signed commit receipt and attempt count. Publish only the missing comment, then continue the expected review or closed-window verification; never commit again.

Offline gate tests exercise these contracts and invalid boundaries deterministically. They do not demonstrate live model adherence, truth of asserted evidence, signing infrastructure, or GitHub rendering.
