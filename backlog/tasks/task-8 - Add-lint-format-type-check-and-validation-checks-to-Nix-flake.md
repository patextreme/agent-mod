---
id: TASK-8
title: 'Add lint, format, type-check, and validation checks to Nix flake'
status: Done
assignee:
  - pi
created_date: '2026-04-28 10:41'
updated_date: '2026-04-28 18:11'
labels: []
dependencies: []
references:
  - nix/modules/pi-package.nix
  - flake.nix
documentation:
  - AGENTS.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The flake's `checks` attribute currently only replicates the package derivations (copying source files into the Nix store). It does not verify code quality. Add Nix derivation checks that run `biome check` and `tsc --noEmit` so that `nix flake check` catches lint/format violations and type errors.

**Note:** Inside the pure Nix sandbox, `biome` and `tsc` are not available by default. The derivations will need `nativeBuildInputs` with `pkgs.nodejs` and `pkgs.biome` (and potentially `pkgs.typescript` or a `nodePackages.typescript` package) so these tools are present during the build. See AGENTS.md — Biome is not in `node_modules` and requires explicit inclusion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `nix flake check` runs `biome check .` and fails if any lint or format violations exist
- [x] #2 `nix flake check` runs `tsc --noEmit` and fails if any TypeScript type errors exist
- [x] #3 Both checks are implemented as pure Nix derivations in `nix/modules/pi-package.nix` under `checks`
- [x] #4 Existing package derivations and devshell remain unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `rootNodeModules` derivation using `pkgs.buildNpmPackage` with `src = ./../..` to build node_modules from root package-lock.json
2. Add `biome-check` derivation: mkDerivation with src=./../.., nativeBuildInputs=[pkgs.biome], buildPhase runs `biome check .`, installPhase touches $out
3. Add `tsc-check` derivation: mkDerivation with src=./../.., nativeBuildInputs=[pkgs.nodejs pkgs.typescript], copies rootNodeModules + chainNodeModules into place, buildPhase runs `tsc --noEmit`, installPhase touches $out
4. Register both in checks attrset alongside existing entries
5. Verify with nix flake check

Only file modified: nix/modules/pi-package.nix
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Nix flake check output names:
- `biome-check` — runs `biome check .` (lint + format)
- `tsc-check` — runs `tsc --noEmit` (type checking)

Fully qualified: `checks.x86_64-linux.biome-check` and `checks.x86_64-linux.tsc-check`

Added alongside existing checks (`pi-permission`, `pi-chain`, `pi-prompts`) in `nix/modules/pi-package.nix` under `perSystem.checks`.

## Implementation complete

- Added `rootNodeModules` buildNpmPackage derivation (npmDepsHash: sha256-5tp6Nus8hQNwTlNm9jqT2GiQQlEXrBuOh+AvwKrUaO0=)

- Added `biome-check` mkDerivation: runs `biome check .` with pkgs.biome in nativeBuildInputs

- Added `tsc-check` mkDerivation: runs `tsc --noEmit` with pkgs.nodejs + pkgs.typescript, copies rootNodeModules + chainNodeModules into place for type resolution

- Both registered in checks attrset alongside existing pi-permission, pi-chain, pi-prompts

- Verified: nix flake check passes all 5 checks

- Verified: existing packages (pi-permission, pi-chain, pi-prompts) and devshell unchanged

- Verified: tsc-check correctly fails on type errors (tested by injecting `const x: string = 123`)

- Verified: biome-check correctly fails on format violations (tested by injecting bad formatting)

- Only file modified: nix/modules/pi-package.nix
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What Changed

Added two pure Nix derivation checks to `nix/modules/pi-package.nix`:

- **`biome-check`** — runs `biome check .` (lint + format) via `pkgs.biome` in `nativeBuildInputs`
- **`tsc-check`** — runs `tsc --noEmit` via `pkgs.nodejs` + `pkgs.typescript`, with `rootNodeModules` and `chainNodeModules` copied into place for type resolution

Also added a `rootNodeModules` helper derivation (`pkgs.buildNpmPackage`) to provide the root `node_modules` needed by `tsc-check`.

Both checks are registered in `perSystem.checks` alongside the existing `pi-permission`, `pi-chain`, and `pi-prompts` entries. `nix flake check` now runs all 5 checks.

## Why

The flake's `checks` attribute previously only copied source files into the Nix store — it didn't validate code quality. These additions ensure `nix flake check` catches lint/format violations and TypeScript type errors in CI or local development.

## Tests

- `nix flake check` passes all 5 checks (biome-check, tsc-check, pi-permission, pi-chain, pi-prompts)
- Negative test: injecting a type error (`const x: string = 123`) causes `tsc-check` to fail as expected
- Negative test: injecting bad formatting causes `biome-check` to fail as expected
- Existing package derivations and devshell remain unchanged

## Risks / Follow-ups

- `rootNodeModules` uses a hardcoded `npmDepsHash` — any change to `package-lock.json` will require updating this hash
- Only file modified: `nix/modules/pi-package.nix`
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->
