# Issue-to-PR control flow

`SKILL.md` defines stage contracts and completion gates. Execute each delegated stage in a separate Agent; nested `orc-*` agents orchestrate their own workers.

```text
issue = DELEGATE Read and route(requested issue, repository)
ACCEPT resolved identity, requirements, and exact labels
flow = OpenSpec IF labels contain "openspec" ELSE direct edits

state = DELEGATE Provision or resume(issue, flow)
ACCEPT verified worktree/branch, refs, owned changes, PR, and resumable stage
IF flow = OpenSpec AND (explicit resume or interrupted operation):
  READ recovery-and-receipts.md; DELEGATE read-only actual-state/receipt reconciliation
  REQUIRE same identity/scope, current prerequisites, full predecessor and operation evidence
  DETERMINE only remaining stages; ambiguous paths/history/refs PAUSE before writes
  Confirmed matching archive advances to remaining delivery, never active-stage replay

IF flow = OpenSpec:
  IF resume reconciliation confirms the same complete archived target:
    change = RECOVER sticky roots/authoritative inventory from receipts and direct files
    REQUIRE current predecessor/comparison/move evidence; no active-change commands
  ELSE:
    change = DELEGATE Resolve change(issue, worktree)
    IF no unambiguous existing change:
      ASK user to select/provide one; PAUSE
  KEEP resolved change/store/schema/planning roots and artifact inventory sticky
  RESOLVE and READ installed apply/verify/archive/sync and packaged review procedures
  REQUIRE actual nested tools, host opt-in/depth and authorized planning/delivery roots
  IF main specs/archive cannot belong to this authorized PR:
    ASK for scoped delivery reconciliation; PAUSE before writes
  RECORD invocation choice: Sync now if needed; Archive now if already synced

FOR each unfinished implementation stage (direct edits OR Groom, Implement, Verify):
  GUARD expected git state and accepted issue/change identity through delegation
  IF direct edits:
    result = DELEGATE research, plan, implement, and relevant checks
    validation = DELEGATE independent actual-diff and acceptance-criteria checks
  ELSE:
    result = DELEGATE the stage's named orc-* skill
    IF stage = Groom:
      validation = DELEGATE structural validation and readiness assessment
    REQUIRE the stage's completion gates and full evidence
  ACCEPT completion only after delegated evidence establishes it

IF OpenSpec and finalization unfinished:
  GUARD current complete zero-Critical/zero-Warning verification and required checks
  finalization = DELEGATE installed archive using openspec-finalization.md
    Same target/roots/store; accepted verification; explicit invocation choice
    Installed inline sync reuses valid rules snapshot and waits synchronously
    Archive performs full selected-capability comparison before whole-directory move
  REQUIRE complete current preflight, accepted sync or already-synced/no-delta assessment
  REQUIRE source absent and complete matching destination inventory/content
  RETAIN authorized code/main-spec/archive/active-deletion delivery brief

GUARD expected worktree/refs and authorized changes through delegation
DELEGATE required validation and reconciliation of current origin/develop
IF OpenSpec: REQUIRE confirmed finalization and authorized delivery brief
delivery = DELEGATE Deliver, reconciling any partial operation before retries
  IF OpenSpec:
    After owned staging: DELEGATE independent actual staged-diff inspection
    After signed commit and before publication: DELEGATE entire outgoing-range inspection
    REQUIRE owned implementation, applicable main specs, whole archive and active deletions
      No unrelated baseline/user changes; no cross-repository staging
  ELSE: retain direct edits' existing owned-change scope and outgoing-content checks
ACCEPT content receipts, verified signed/DCO commits, normal push, PR identity/body, remote head

review = DELEGATE orc-pr-review-repair(exact PR, worktree, issue/change)
  IF OpenSpec: PASS confirmed archive path/inventory/identity, delta-to-main mapping,
    relevant main specs, originating issue/approved intent and delivery content receipts
    REQUIRE clean direct-file archived sources for fresh axes, history only for judge/accounting
    KEEP in-scope repairs archived; REQUIRE code/archive/main-spec alignment and affected validation
    PAUSE new consequential intent for scoped authorization; no lifecycle replay or weakened tests
ACCEPT complete review/repair outcome, final head, alignment evidence when applicable, and history receipts
final = DELEGATE final-head delivery gates and state verification
REQUIRE reviewed head = delivered head = final gate head
FINISH with issue/flow/worktree/change/PR, checks, findings, and receipts
  OpenSpec: separate attempted sync/comparison acceptance, exact whole-archive inventory,
    authorized delivered inclusion, completed/missing operations and final reviewed/delivered/gate SHA
  Archive confirmation alone is packaged-for-review evidence, not Finish or merge

ON any missing evidence, blocked stage, or human-input request:
  DELEGATE safe missing investigation when existing intent determines it
  OTHERWISE preserve work, sticky identities, reports, and operation receipts
  REPORT exact blocker and question/options/recommendation; PAUSE
  AFTER user reply, DELEGATE state reconciliation and resume the blocked stage
  Retain nested skill histories and repair budgets; do not replay completed delivery
```

On an OpenSpec explicit resume, follow [Recovery and receipts](./recovery-and-receipts.md); direct edits retain their existing evidence-based resume policy without archive prerequisites. Re-establish affected acceptance against actual issue, artifact, git and PR state; observe complete moves/commits/pushes/PRs rather than replay them. Pass the same run/ledger/reservation to the nested PR repair continuation and finish its incomplete attempt before a new review. A partial or blocked run never reaches the success report; these prompt receipts are not native checkpoints or transactional guarantees.
