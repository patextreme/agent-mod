# Retired tooling

Two orchestration layers this package once shipped are gone, both as breaking changes with no in-repo replacement:

- **acpx flows** — the five entrypoints `openspec-groom`, `openspec-implement`, `openspec-verify`, `openspec-finalize`, and `openspec-all`, plus the `acpx-flow` authoring skill.
- **OpenSpec workflow skills** — `openspec-review`, `openspec-propose-issue`, `orc-openspec-groom`, `orc-openspec-implement`, `orc-openspec-verify`, `orc-issue-to-pr`, and `cleanup-merged-issues`, together with the OpenSpec specs, change history, and manual semantic suites that supported them.

`pr-review-repair`, documented in the [main README](../README.md), is the surviving skill. [`pi-acp`](../nix/packages/pi-acp/README.md) remains the supported ACP integration.
