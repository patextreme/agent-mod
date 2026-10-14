# Design

## Context

See proposal.md for motivation. The skill is an agent-consumed procedure, not an executable cleanup controller. Its immediate-removal instruction currently says to reconfirm with the operator; the current spec's recheck and continuation scenarios do not clearly separate checking applicability from asking again. Git's status check and recursive deletion remain non-atomic.

## Goals / Non-Goals

**Goals:** Co-locate the continuing assertion rule with preview, immediate checks, and resume instructions; expose the distinct paths in concise examples.

**Non-Goals:** Add no modeled runtime state machine, inspection helper, or locking mechanism. Existing safety commands and eligibility rules remain the authority.

## Decisions

- Record snapshot approval and a continuing assertion separately. Generic consent retains otherwise unchanged snapshot approval while requesting only the missing assertion. A single assertion can name all selected targets, so moving between them is not an invalidation event. Repeating the whole approval would recreate the reported friction.
- Replace automatic reconfirmation with an immediate applicability assessment. An interruption/pause renews the assertion for remaining removals; changed bound evidence/configuration invalidates affected approval and permits fresh approval only after reconciliation establishes eligibility and safe configuration. Merely pruning or rechecking unchanged evidence does neither. A watcher resuming requires reconciliation even with unchanged refs.
- Use an issue-specific OpenSpec delta and direct spec sync under the repo-local planning root. Do not select the sole unrelated active change or rewrite historical artifacts. Leave this change active for later finalization.
- Add inline confirmation examples and a discovered gate suite that checks documentation/scenario contracts and safety guard text. Avoid a fake executable policy model: testing such a model would not test the actual skill.

## Risks / Trade-offs

- Text checks cannot establish live agent adherence → explicitly disclose their model-free scope; no model eval or real cleanup runs are claimed.
- Reusing an assertion despite changed context could permit unsafe deletion → bind configuration applicability evidence/context, require immediate checks, and renew on pauses or uncertain/lost quiescence.
- Human assertions do not enforce writer inactivity or atomic deletion → retain the existing non-atomic disclosure and all refusal/preservation guards.

## Migration Plan

Distribute the updated skill together with the synchronized current specification and focused gate examples. If reverted, restore both the skill and current spec consistently. Existing archived changes remain historical evidence.
