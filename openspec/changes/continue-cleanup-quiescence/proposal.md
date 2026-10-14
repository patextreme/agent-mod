# Proposal

## Why

[Issue #78](https://github.com/patextreme/agent-mod/issues/78) reports redundant stopped-writers prompts after approved pruning and unchanged evidence checks. A continuing assertion can cover uninterrupted removal without pretending repeated human prompts make Git's check and deletion atomic.

## What Changes

- Bind one explicit snapshot approval and continuing stopped-writers assertion to every selected target explicitly covered by the assertion.
- Keep immediate automated evidence/configuration checks; assess the recorded assertion's applicability instead of prompting again after routine checks, pruning, or unchanged-target transitions.
- Request only the missing assertion after generic approval. Renew applicable confirmation after interruption/pause, changed bound evidence/configuration, or uncertain/lost quiescence, without bypassing any safety prerequisite.
- Add focused documentation examples and model-free gate coverage, explicitly not evidence of live agent adherence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `merged-issue-cleanup`: Clarify snapshot-bound confirmation, immediate assertion applicability checks, and continuation after pauses.

## Impact

Only the cleanup skill, focused gate tests, and the current cleanup specification change. Reconcile the spec through this dedicated delta and spec sync; leave historical archives and `generalize-pr-base-branch` unchanged. No runtime/helper, dependency, locking, deletion authority, or preview redesign is introduced. Exact PR/head matching, exclusions, ignored-path preview, non-atomic disclosure, restricted pruning, normal removal, and branch preservation stay intact. No commit, push, PR, or archival is part of this implementation stage.
