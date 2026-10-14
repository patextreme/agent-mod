# Local continuity records

Read during preparation and before creating or reconciling evidence. These are concise templates for ignored working data, not a runtime/schema or published planning artifacts. Fill every field with evidence or an explicit unknown/limitation; omit secrets and personal data. Use stable record IDs and references rather than copying transcripts. Storage admission and writer exclusion are defined in `SKILL.md` and executed in `pseudocode.md`.

## Common envelope and source binding

Every record carries:

```text
record ID/type; timestamp/producer; repository/worktree/change/store/schema
exact human task IDs and CLI-ID mapping; requirements/contracts; boundary
source binding ID and before/after capture references
commands: exact command, cwd, environment assumptions, exit/result, covered scope
limitations/unknowns; related record IDs; remaining work/blockers
statuses: implementation | checks | semantic acceptance | bookkeeping
invalidation reason; affected tasks/boundaries/dependents (or explicitly none)
```

A status is explicit, for example `partial`, `pending`, `passed`, `accepted`, `bookkept`, `invalidated`, `blocked` or `not applicable`, with evidence references. `implementation: done` or `checks: passed` does not imply `semantic acceptance: accepted`; a checked task does not prove any of these statuses. Findings themselves do not constitute acceptance.

Source binding template:

```text
binding ID; capture time; repository/worktree; base revision/HEAD (or unborn)
scope manifest: inspected source + requirements/tasks + shared/prerequisite contracts
per path: deterministic content SHA-256 (or absent/deleted), tracked/untracked,
          index/staged blob/content hash, working-tree hash, dirty/staged state
deletions: path + prior tracked/index identity + explicit absent marker
untracked source: enumerated relevant paths + content hashes, not names alone
dependencies/check configuration: scoped paths/hashes and discovered command mapping
environment/prerequisite assumptions: values or non-secret evidence references
whole-tree inventory/diff reference (optional reconciliation aid, not blanket veto)
before/after hashes; changes during evidence production; scope completeness/limitations
```

Use repository tooling to enumerate tracked/index state (`git ls-files --stage`), dirty/staged/deleted state (`git status --porcelain=v1 -z`, relevant diffs), and untracked source (`git ls-files --others --exclude-standard`), then hash actual relevant bytes deterministically. Include relevant ignored source inputs explicitly if they affect checks/contracts; exclude orchestration ledger churn. Hash relevant index content as well as working contents; an equal HEAD does not capture dirty, untracked, staged or deleted state. Symlinks/non-text inputs require an explicit deterministic representation and target assumptions, or a limitation that prevents unsupported reuse. Compare complete recorded scope and prerequisite/configuration/environment assumptions, not merely files edited by a worker. Record source before and after each check/review. Known checkbox-only changes can be normalized with an explicit reason; changes to task meaning or requirement mapping cannot.

## Plan record

```text
common envelope + source binding
selection/action-context/allowed roots; current CLI state/progress/context paths
ordered groups/chunks: exact IDs, bounded checkpoints, completion/remaining criteria
requirements; dependency edges/contracts; risk classifications/rationale
boundaries/membership/batching rationale; prerequisite release conditions
focused/final checks: commands/cwd/scope/environment + discovery sources
context policy: fresh group workers, chunk limits/checkpoints, fallback
host capabilities: evidence, occupancy units/interpretation/cadence/threshold or unavailable
storage: selected physical ignored per-change path + ignore/tracked-state proof
writer/subprocess state + proof references; unresolved decisions
```

## Handoff record

```text
common envelope + source binding
assigned/implemented/completed/remaining IDs; partial work within an unfinished ID
requirement coverage; actual changed files; current source/task state
commands/results; findings/reproduction references; blockers/next bounded assignment
prerequisite assumptions/accepted unaffected record references
checkpoint reason (assignment end / reliable signal / interruption)
writer identity; confirmed exit evidence or unknown
subprocess inventory: identities, mutation potential, stopped/active/unknown + evidence
quiescence decision; reconciliation required before replacement
```

## Finding record

```text
common envelope + source binding
stable finding ID; violated requirement/task/contract
file/line anchored to content hash; reproduction/failing regression or explicit limitation
expected vs actual behavior; affected contracts/dependents; regression scope
blocking status; repair/investigation references
fresh independent repair reviewer; actual repair/reproduction/contract inspection
reviewer-controlled scope + targeted sufficiency or expansion rationale
retained unaffected evidence/reconciliation reasons; affected final evidence refresh
```

## Acceptance ledger entry

```text
common envelope + source binding
boundary/task/requirement coverage; implementation handoff references
check evidence references + limitations; independent reviewer/inspection references
semantic acceptance decision + rationale; prerequisite release status
bookkeeping IDs/status, checkbox correction reason if any, fresh apply progress
source/assumption reconciliation outcome; retained unaffected evidence + justification
invalidated records/reasons; affected dependents frozen; required refresh/remaining work
writer/subprocess quiescence proof before any bookkeeping/correction
final evidence (when applicable): fresh required repository-wide checks,
independent integrated semantic review, current apply status; before/after bindings
post-repair invalidation/refresh and reviewer scope justification for retained evidence
report reference: filled current-task-status report + evidence/provenance references
```

For reports, apply the authoritative [current-task-status report contract](../SKILL.md#reporting-and-authorization); an unfilled record template is not a current report.

## Reconciliation decision

On resume, before dispatch/acceptance/bookkeeping, compare current scope against bindings and assumptions. If unchanged, retain that evidence with a reconciliation reference. If changed, invalidate only affected checks/acceptance and dependent evidence, or the affected boundary when impact is uncertain; do not discard unrelated acceptance solely because the whole-tree hash changed. Freeze dependents immediately, correct affected previously bookkept task checkboxes/statuses through a serialized quiescent writer, preserve unrelated completed tasks, then refresh checks/independent review and bookkeeping. Lost, incomplete or unbound records require reconstruction. This sequence keeps source truth, evidence truth and task bookkeeping distinct.
