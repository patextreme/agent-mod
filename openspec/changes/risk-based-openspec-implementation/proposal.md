# Proposal

## Why

Issue [#70](https://github.com/patextreme/agent-mod/issues/70) describes valuable independent semantic review accompanied by excessive context loading and repeated broad checks. The current per-task-group verification contract conflates planning headings, worker lifetime, and prerequisite release; separating them reduces overhead without weakening correctness.

## What Changes

- Replace mandatory per-group review with explicit dependency/risk-based review boundaries, retaining sequential implementation and mandatory independent acceptance before consuming high-risk or uncertain prerequisites.
- Permit justified lower-risk batching while keeping task-checkbox bookkeeping pending until the applicable boundary passes.
- Separate focused executable checks from independent semantic inspection; discover existing repository check commands during preparation.
- Default repair verification to findings and affected contracts, with reviewer-controlled expansion when architecture, scope, or evidence validity changes.
- Bound worker lifetime with fresh workers per group, explicit task-ID chunks for large groups, configurable reliable context signals, and durable handoffs that prevent overlapping writers.
- Bind reusable evidence to inspected source and assumptions, selectively invalidate affected records, and distinguish implementation, checks, acceptance, and bookkeeping.
- Require fresh final repository-wide checks, integrated semantic review, and current apply status.
- Add structural contract tests and manual semantic fixtures without introducing an orchestration runtime or committing run evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec-skill-orchestration`: Dependency/risk-based implementation review scheduling, bounded worker handoffs, source-bound evidence reuse, targeted repair acceptance, and final integrated completion.

## Impact

Primary implementation targets are `skills/orc-openspec-implement/SKILL.md` and `skills/orc-openspec-implement/references/pseudocode.md`, with ownerless tests under `tests/gates/` and manual fixtures/procedure under `tests/semantic/`. This changes the existing requirement that every group must be independently verified before any subsequent group starts. Other orchestration stages and delivery policies are not expanded; commits, pushes, synchronization, and archival retain their existing authorization requirements. No dependencies, runtime, automatic writer concurrency, or host termination/telemetry APIs are added. Local orchestration records are gitignored working data, not planning artifacts or published evidence.
