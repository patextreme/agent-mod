# OpenSpec Automation

Language for automated implementation, verification, and finalization of approved OpenSpec changes.

## Language

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
Syncing an already-verified change's applicable delta specs into the main specs, then archiving the change. Finalization does not perform verification or repairs.

**Spec synchronization**:
Applying a change's delta requirements to the main specs while preserving unaffected requirements and scenarios. Synchronization alone does not archive the change.

**Change archival**:
Moving an active change into the archive while retaining its planning artifacts. Archival is distinct from spec synchronization.

**Blocking verification finding**:
A CRITICAL or WARNING finding that must be resolved before verification acceptance. Explicitly missing required evidence is blocking, rather than evidence of success.

**Inconclusive verification**:
An incomplete or unusable verification report that cannot support classification. It differs from a conclusive report identifying missing evidence as a blocking finding.
