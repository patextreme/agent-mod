---
id: TASK-7
title: Simplify handoff context reset in chain execution
status: Done
assignee: []
created_date: '2026-04-20 06:51'
updated_date: '2026-04-20 07:20'
labels:
  - refactor
  - chain
dependencies: []
references:
  - extensions/chain/src/execution.ts
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The handoff section of `executeChain` in `extensions/chain/src/execution.ts` had a redundant `resetContext(ctx, preHandoffLeafId)` call that was always overshadowed by the subsequent unconditional `resetContext(ctx, chainRootLeafId)`.

**Problem:**
When evaluating a `handoffExitPrompt`, the code captured `preHandoffLeafId = ctx.sessionManager.getLeafId()` before the evaluation, then called `resetContext(ctx, preHandoffLeafId)` after the evaluation succeeded (handoff proceeds). However, `preHandoffLeafId` is always a descendant of `chainRootLeafId` in the conversation tree, so the later `resetContext(ctx, chainRootLeafId)` already clears all handoff evaluation messages — making the intermediate reset a no-op.

The code comment even acknowledged this redundancy, citing a misleading analogy with `evaluateStepExitPrompt`. In that function the pre-evaluation reset is the only reset (no subsequent broader reset), so the analogy doesn't hold.

**Change:**
- Removed the `preHandoffLeafId` capture and the conditional `resetContext(ctx, preHandoffLeafId)` block after handoff evaluation succeeds.
- Updated the comment on the final `resetContext(ctx, chainRootLeafId)` to note it also clears handoffExitPrompt evaluation messages.

No behavioral change — purely removing dead code and a misleading comment.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 preHandoffLeafId variable and its associated resetContext call are removed from executeChain
- [x] #2 The comment on the final resetContext(ctx, chainRootLeafId) mentions clearing handoffExitPrompt evaluation messages
- [x] #3 Handoff works correctly for chains with handoffExitPrompt, without handoffExitPrompt, and without handoffTarget
- [x] #4 No behavioral change — pure dead code removal
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the redundant `preHandoffLeafId` capture and its associated `resetContext` call in the handoff section of `executeChain`. The subsequent unconditional `resetContext(ctx, chainRootLeafId)` already clears all handoff evaluation messages from the tree since `preHandoffLeafId` is always a descendant of `chainRootLeafId`. Updated the comment to clarify this. No behavioral change.
<!-- SECTION:FINAL_SUMMARY:END -->
