# Tasks

## 1. Confirmation lifetime and spec reconciliation

- [x] 1.1 Align cleanup preview, immediate-removal, and resume instructions and add focused inline examples plus discovered documentation-contract tests; verify uninterrupted multi-target, missing assertion, changed evidence/configuration, interrupted/pause, and uncertain/lost-quiescence paths with `node --test tests/gates/cleanup-merged-issues.test.mjs`.
- [x] 1.2 Sync this delta into the current merged-issue-cleanup specification using the resolved repo-local root and specs instructions; verify modified requirement blocks match the delta, preserve untouched guards, and validate change/current spec with OpenSpec.

## 2. Integration verification

- [x] 2.1 Run format, lint, typecheck, and the discovery-based test gate in order; verify owned diffs and unchanged historical/unrelated artifacts, report check results and model-free limitations.

## Workflow follow-up

- Leave this dedicated change active for later review/finalization; do not archive, commit, push, or open a PR during this implementation stage.
