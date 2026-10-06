# OpenSpec Automation

Language for issue-to-PR automation and the implementation, verification, and finalization of approved OpenSpec changes.

## Language

### OpenSpec lifecycle

**Implementation completion**:
All change tasks are complete, supported by implementation evidence and passing applicable quality gates. An implementer's summary or checked task boxes alone are not proof of completion.

**Repairable pause**:
Unfinished implementation or an implementation error that can be resolved within the approved design without a consequential human decision.
_Avoid_: Auto-fixable issue

**Escalation-required pause**:
An implementation blocker requiring human input, including ambiguous requirements, design changes, destructive actions, or missing external access.

**Human steering**:
Explicit human guidance for resolving an escalation-required pause. It authorizes changes to the approved plan only when those changes are explicitly within its scope.

**Verification finding**:
An issue identified when checking an implemented change against its OpenSpec artifacts, classified as CRITICAL, WARNING, or SUGGESTION.

**Verification acceptance**:
A conclusive verification result with no CRITICAL or WARNING findings and no missing required evidence. SUGGESTION findings may remain; acceptance does not mean the change has been synced or archived.

**Change finalization**:
Synchronizing an already-verified change's applicable delta specs into the main specs, accepting that synchronization independently, then archiving the change. Finalization does not perform implementation verification or repairs.

**Spec synchronization**:
Applying a change's delta requirements to the main specs while preserving unaffected requirements and scenarios. Synchronization alone does not archive the change.

**Synchronization acceptance**:
A conclusive independent assessment that every applicable delta's intended effects are represented and unaffected main-spec content is preserved. It is distinct from implementation verification acceptance and does not by itself mean the change has been archived.

**Change archival**:
Moving an active change into the archive while retaining its planning artifacts. Archival is distinct from spec synchronization.

**Blocking verification finding**:
A CRITICAL or WARNING finding that must be resolved before verification acceptance. Explicitly missing required evidence is blocking, rather than evidence of success.

**Inconclusive verification**:
An incomplete or unusable verification report that cannot support classification. It differs from a conclusive report identifying missing evidence as a blocking finding.

### Issue-to-PR

**Base branch**:
The branch selected as the starting point for the issue's implementation.
_Avoid_: Working branch

**Issue workspace**:
The isolated checkout in which one issue's planning and implementation take place.
_Avoid_: Caller checkout

**Issue request**:
The captured issue title, body and explicitly selected clarification comments that define the requested work for a run.
_Avoid_: Live issue state

**Issue attempt**:
One effort to implement an issue request from a selected baseline, including any clarification or repair continuations that preserve that request and baseline's validity.
_Avoid_: Flow run (a single execution, not necessarily the whole attempt)

**Escalation**:
A request for explicit human direction when an issue attempt cannot safely proceed autonomously.
_Avoid_: Failure (an escalation may allow the attempt to continue)
