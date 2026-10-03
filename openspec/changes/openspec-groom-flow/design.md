# Design

## Context

See `proposal.md` for motivation and `specs/openspec-groom/spec.md` for the behavior contract. This repository has no existing flows, acpx dependency, or flow typechecking. Current tests use `tsx --test`; Nix mirrors quality gates and pins the npm dependency hash.

Research against acpx 0.19.4 found TypeScript `defineFlow`, ACP, decision, compute/action nodes, switch routing, and backward edges. Its checkpoint pauses without an installed CLI resume operation, so it cannot implement interactive steering continuation. Pi ACP is available locally. The update skill currently mandates per-artifact confirmation and forbids creating missing artifacts.

Reference: https://acpx.sh/flows.html and its linked CLI/config documentation. Implementation must check the installed dependency's API instead of assuming undocumented flow controls.

## Goals / Non-Goals

**Goals:**
- Separate deterministic budget, validation, and outcome handling from model judgments.
- Use constrained decision outputs without replacing the review skill's prose contract.
- Make interactive steering cancellable and testable without a live model.
- Keep authorization limited to the current repair cycle and target artifacts.

**Non-Goals:**
- Resume after checkpoints or process termination; alternate stores; implementation editing.
- Carry reviewer/agent memory between phases or rounds; deduplicate repeated findings across rounds.
- Guarantee implementation readiness from zero Critical findings.
- Add a grooming extension or extension-specific flake package: this is a flow, not a Pi extension.

## Decisions

### 1. Explicit graph with deterministic cycle accounting

Implement `flows/openspec-groom.flow.ts` with small testable helpers. The graph is:

```text
preflight -> validate
validate(valid) -> review -> classify
classify(clear) -> success
classify(inconclusive) -> failure
validate(invalid) or classify(critical) -> budget gate -> assess
assess(missing artifact required) -> failure
assess(autonomous) -> update
assess(needs steering) -> human input -> update
update -> validate
budget gate(exhausted) -> limit_reached
```

Validation occurs again after each update, even after attempt ten. A valid final cycle receives review before budget exhaustion can be selected. Operational validation failure is not a repairable validation result: malformed output, failed process launch, or unexpected errors terminate as failures. Count updater dispatches, not successful filesystem changes. Failed update attempts terminate immediately with their count retained. No automatic retries or early-stop heuristic for recurring findings.

Alternative: ten reviews. Rejected because it would prevent checking the tenth revision. Alternative: model-managed loop counters. Rejected because the budget must be deterministic.

### 2. Preflight membership and path resolution

Validate input shape and resolve the invocation directory's local OpenSpec root. Check active membership and reject store-backed or archived targets before using `openspec status --change <id> --json` to obtain artifact paths. Do not infer membership solely from `openspec validate --type change`, which can report nonexistent changes as generic delta errors.

Run targeted validation with JSON output and no interactive prompts, using explicit change type and strict checks. Build an allowlist of existing planning artifacts from schema-resolved paths; exclude implementation code, unrelated changes, and project-wide configuration. Do not turn a missing artifact into a creation task.

Alternative: concatenate user input into paths or shell commands. Rejected; use argument-safe execution and resolved containment checks.

### 3. Prose review and constrained decisions

Invoke `openspec-review` in a fresh Pi ACP session, passing only `changeId` as run-specific reviewer input. Keep its Markdown/prose output unchanged. A fresh decision node receives the current review and must choose `critical`, `clear`, or `inconclusive`; ambiguous, failed, or unusable output is never success. Inspect actual findings, not a substring match on the conclusion.

A fresh assessment phase receives current validation errors or Critical findings and the change ID. It identifies proposed resolutions and human-dependent issues with stable current-cycle IDs. Use constrained decisions for routing and validated structured fields where deterministic steering completeness checks require them. An inconclusive assessment fails closed. Non-Critical findings can be retained for final reporting but do not become independent update targets.

Alternative: force JSON from the reviewer. Rejected by the user in favor of decision nodes reading prose. Alternative: reuse a shared ACP session. Rejected to avoid memory carryover. Configure fresh sessions for every node invocation, including loop revisits; test the actual session lifecycle rather than assuming a static isolated-node setting guarantees this.

### 4. Escalate once, then update together

Assess autonomous repairs against existing intent and conventions. Require steering for architecture, design, product, high-stakes changes, or materially different alternatives. Gather all escalated issue answers before any update, including when other corrections could be autonomous.

Implement the human step with a compute/function action using `node:readline/promises`, stdin input, and stderr prompts. Check terminal availability, display each issue and recommendation, collect an answer per issue, and reject blank answers. Set `timeoutMs` to 604800000 (seven days); use the node cancellation signal and close readline on cancellation, EOF, timeout, and completion. Do not run ACP tool-permission prompts concurrently with human steering. Agent phases retain acpx's ordinary timeout.

Alternative: checkpoint. Rejected because current CLI resume support is absent. Alternative: apply autonomous fixes before steering. Rejected because human decisions may invalidate them.

### 5. Explicit, narrow update-skill authorization

Revise `.pi/skills/openspec-update-change/SKILL.md` to document a grooming authorization section supplied by this flow. The normal per-artifact confirmation policy remains unchanged unless explicit current-cycle authorization is present. Authorized updates receive the change ID, assessed resolutions, any complete steering, and resolved edit scope; they do not receive previous-cycle transcripts.

The exemption covers structural and Critical repairs only. It neither creates missing artifacts nor overrides tool permissions. Pass the authorized invocation to a fresh Pi session using the actual skill-expansion mechanism supported by Pi ACP. Verify that the project skill is discoverable from the flow invocation context; do not rely on a same-named skill silently shadowing it.

Alternative: contradictory prompt instructions against the unmodified skill. Rejected because behavior would be unreliable. Alternative: globally relax confirmation. Rejected because ordinary invocations must retain human control.

### 6. Outcomes, persistence, and permission separation

Use structured terminal results with at least `changeId`, `outcome`, `updateAttempts`, summary, and available remaining findings/errors. Terminal outcomes distinguish `success`, `limit_reached`, `needs_human`, `cancelled`, and `failed`; steering timeout is a failed outcome with an explicit timeout reason. Success alone exits zero. Ensure terminal routing maps non-success to an actual nonzero CLI exit, not a successful node containing a failure label. Handle cancellation and process errors without rollback.

acpx persists the run history and transcripts. Write no additional report files. No commits, stashes, or restoration of artifacts. Existing dirty edits remain the starting state. Tool permission approval must be configured separately; do not silently enable permission YOLO. Document permission prerequisites for unattended autonomous edits.

### 7. Repository integration and verification

Add acpx as a development dependency so `acpx/flows` resolves for TypeScript and tests. Include flow TypeScript in checks and flow helper tests in npm/Nix test wiring. Refresh lockfile integrity and `npmDepsHash` as required. Use injected agent/command/terminal boundaries to test routing without real model calls, plus CLI-level checks that terminal failure routes exit nonzero.

Document invocation:

```bash
acpx flow run ./flows/openspec-groom.flow.ts --input-json '{"changeId":"example-change"}'
```

Document Pi adapter setup, skill discovery, permissions, terminal limitations, seven-day wait, and the distinction between successful grooming and implementation readiness.

## Risks / Trade-offs

- Model decisions can miss Critical findings or misjudge stakes → constrained outputs, fresh sessions, explicit assessment criteria, inconclusive failure, and escalation tests; correctness is not guaranteed by the enum alone.
- Prompt-scoped edit authorization is not an OS sandbox → use explicit resolved allowlists and inspect changed paths in integration tests; do not advertise security isolation.
- Long-lived steering can retain a process for seven days → explicit timeout/cancellation, no concurrent stdin readers, and documented lack of resume support.
- Fresh sessions can rediscover the same findings → accept repetition and rely on the shared ten-attempt cap.
- Partial updater failure can leave revisions → preserve and report them; no rollback by design.
- acpx exit semantics and loop session behavior are version-sensitive → verify with the installed dependency and add integration regression coverage.
- Adding a dependency can invalidate Nix builds → update integrity/hash and run `nix flake check`.

## Migration Plan

1. Add dependency/check integration and flow helpers, then graph and scoped skill policy.
2. Add deterministic and adapter-level tests plus README invocation guidance.
3. Run format, lint, typecheck, tests, and Nix flake checks before delivery.
4. Users opt in by explicitly running the new flow; ordinary update invocations remain unchanged.
5. Rollback removes the flow and scoped exemption and restores dependency/check changes. It does not reverse artifacts edited by earlier grooming runs.
