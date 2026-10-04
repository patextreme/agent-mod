# Proposal

## Why

OpenSpec changes currently require manually coordinating semantic review, decisions, and planning-artifact revisions. A bounded grooming flow can repair Critical findings and structural errors autonomously while preserving human control over consequential decisions.

## What Changes

- Add an acpx flow named `openspec-groom` at `flows/openspec-groom.flow.ts`, accepting an existing active local `changeId`.
- Validate and repair existing planning artifacts, then review with `openspec-review`; use a decision node to classify prose as Critical, clear, or inconclusive.
- Escalate architectural, design, product, and high-stakes decisions before applying all approved fixes together; allow seven days for interactive steering.
- Run every agent phase in a fresh Pi session, sharing a ten-update-attempt budget across structural and semantic repairs, followed by final verification.
- Use a dedicated flow-owned updater prompt with explicit, narrowly scoped current-cycle authorization; leave the built-in `openspec-update-change` skill and its ordinary confirmations unchanged.
- Add flow typechecking, deterministic tests, invocation documentation, and acpx development-dependency/Nix integration.

## Capabilities

### New Capabilities

- `openspec-groom`: Bounded validation, review, escalation, and repair of existing OpenSpec planning artifacts, including flow-scoped update authorization and observable outcomes.

### Modified Capabilities

None. The existing `permission-yolo` capability is unrelated and remains unchanged.

## Impact

- New `flows/` flow, helpers, and tests; README usage and prerequisites.
- Flow-owned updater instructions in `flows/`; no modifications to OpenSpec-generated skills, and existing review criteria remain unchanged.
- `package.json`, `package-lock.json`, `tsconfig.json`, and `nix/modules/pi-package.nix` dependency hashes/check wiring as needed.
- Requires acpx, OpenSpec, Pi, and a working Pi ACP adapter. Tool permission approval remains separate from artifact-revision authorization.
- No implementation-code editing by the grooming flow, Git automation, alternate stores, checkpoint/resume machinery, or separate report files.
