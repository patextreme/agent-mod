# OpenSpec Grooming

OpenSpec grooming prepares a proposed change for implementation by resolving selected review findings in its planning artifacts.

## Language

**Change grooming**:
Revision of an OpenSpec change's planning artifacts to resolve review findings, distinct from implementing or archiving the change.
_Avoid_: Implementation, autofix

**Gating finding**:
An OpenSpec review finding whose severity is Critical. Blocker designation alone does not make a finding gating in this context.
_Avoid_: Blocker

**Grooming batch**:
The gating findings from a single review, considered together for artifact repair.

**Human escalation**:
A request for human judgment needed to resolve a gating finding, including enough problem context and consequences for the human to make an informed decision.

**Human escalation bridge**:
The channel through which a grooming run presents a decision to a human and receives their answer or confirmed abort. It conveys judgment rather than deciding how a finding should be resolved.

**Escalation queue**:
The pending human escalations awaiting presentation, one at a time. Each escalation retains the workflow and change context needed to distinguish it from other requests.

**Unresolved outcome**:
A grooming outcome in which resolution has not been established. Reaching the iteration limit without convergence is an unresolved outcome, not success.
