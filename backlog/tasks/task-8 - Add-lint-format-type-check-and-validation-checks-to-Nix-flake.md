---
id: TASK-8
title: 'Add lint, format, type-check, and validation checks to Nix flake'
status: To Do
assignee: []
created_date: '2026-04-28 10:41'
updated_date: '2026-04-28 12:03'
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
- [ ] #1 `nix flake check` runs `biome check .` and fails if any lint or format violations exist
- [ ] #2 `nix flake check` runs `tsc --noEmit` and fails if any TypeScript type errors exist
- [ ] #3 Both checks are implemented as pure Nix derivations in `nix/modules/pi-package.nix` under `checks`
- [ ] #4 Existing package derivations and devshell remain unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Passes npm run format
- [ ] #2 Passes npm run lint
- [ ] #3 Passes npm run typecheck
<!-- DOD:END -->
