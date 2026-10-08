# Issue-to-PR control flow

`SKILL.md` defines stage contracts and completion gates. The main session executes downstream `orc-*` coordination and runs each delegated worker stage in a separate Agent. Call required SubagentWorkflow scripts from the main session, sequentially rather than inside an outer workflow; child Agents perform worker contracts, not workflow-owning orchestration.

```text
issue = DELEGATE Read and route(requested issue, repository)
ACCEPT resolved identity, requirements, and exact labels
flow = OpenSpec IF labels contain "openspec" ELSE direct edits

state = DELEGATE Provision or resume(issue, flow, request input):
  INSPECT existing worktrees, issue refs, and matching PRs before provisioning
  IF resuming existing worktree/PR:
    DERIVE base from existing worktree/PR state without re-deriving or re-asking, reconciling any conflict with an explicit request base before proceeding
  ELSE IF request input supplies a base:
    USE request-supplied base without prompting
  ELSE:
    REQUEST human confirmation with question/options/recommendation proposing the currently checked out local branch
    ROUTE through ON human-input request below; PAUSE before provisioning
    IN headless runs, REPORT the blocked base question through the same PAUSE contract
  REQUIRE confirmed base before provisioning
  REUSE verified matching state OR PROVISION from freshly fetched origin/<base>
ACCEPT verified worktree/branch, refs, owned changes, PR, and resumable stage
KEEP confirmed base sticky for the run

IF flow = OpenSpec:
  change = DELEGATE Resolve change(issue, worktree)
  IF no unambiguous existing change:
    ASK user to select/provide one; PAUSE
  KEEP resolved change/store sticky

FOR each unfinished stage in the selected flow:
  GUARD expected git state and accepted issue/change identity through delegation
  IF direct edits:
    result = DELEGATE research, plan, implement, and relevant checks
    validation = DELEGATE independent actual-diff and acceptance-criteria checks
  ELSE:
    READ the stage's named orc-* skill and its pseudocode
    result = EXECUTE its coordination in the main session:
      DELEGATE its worker stages under their original contracts
      CALL SubagentWorkflow here where required
      RETAIN stage reports, histories, budgets, and human-input branches
    IF stage = Groom:
      validation = DELEGATE structural validation and readiness assessment
    REQUIRE the stage's completion gates and full evidence
  ACCEPT completion only after delegated evidence establishes it

GUARD expected worktree/refs and authorized changes through delegation
IF flow = OpenSpec:
  finalize = DELEGATE the built-in openspec-archive-change procedure with its
             openspec-sync-specs dependency (same worktree, change, and store identity;
             invocation's explicit sync/archive preauthorization passed to the procedure,
             not used to bypass its prompts)
  IF a prerequisite skill is missing:
    REPORT the missing prerequisite; PAUSE
  IF incomplete artifacts/unchecked tasks, sync conflict, or finalization failure:
    preserve safe work and receipts; REPORT exact blocker; PAUSE
  ACCEPT the procedure's post-sync comparison with no separate finalizer or assessor
  PRESERVE the procedure's built-in no-delta path (no applicable deltas: archive without sync)
  CONFIRM actual archival: source absence + archived presence for the selected target
  IF archival is unconfirmed, failed, ambiguous, or partial:
    surface evidence and blockers; DO NOT dispatch delivery

DELEGATE required validation and merge-base guard against current origin/<base>
IF intended merge base no longer matches current origin/<base>:
  DELEGATE safe reconciliation and rerun affected validation before accepting delivery
delivery = DELEGATE Deliver with PR base <base>, reconciling any partial operation before retries
ACCEPT verified signed commits, push, PR identity/body, and remote head

READ orc-pr-review-repair and its pseudocode
review = EXECUTE its coordination in the main session(exact PR, worktree, issue/change,
         archived change location and relevant main specs when flow = OpenSpec):
  DELEGATE preparation, fresh review, judgment, repair, checks, and publication
  GIVE code-review workers nested Agent access for Standards and Spec axes
  RETAIN run history, thresholds, repair count, and completion gates
ACCEPT complete review/repair outcome, final head, and history receipts
final = DELEGATE final-head delivery gates and state verification
REQUIRE reviewed head = delivered head = final gate head
FINISH with issue/flow/worktree/change/PR, checks, findings,
      finalization receipts (sync results, archived location, delivered contents), and blockers

ON any missing evidence, blocked stage, or human-input request:
  DELEGATE safe missing investigation when existing intent determines it
  OTHERWISE preserve work, sticky identities, reports, and operation receipts
  REPORT exact blocker and question/options/recommendation; PAUSE
  AFTER user reply, DELEGATE state reconciliation and resume the blocked stage
  Retain downstream skill histories and repair budgets; do not replay completed delivery
```

On resume, completion must be re-established against actual issue, artifact, git, PR, and finalization state. A partial or blocked run never reaches the success report. When flow = OpenSpec, reconcile finalization before any re-run: an already-archived change is checked against its archived artifacts and receipts without moving it again or creating a duplicate archive; partially applied synchronization is completed without replaying applied effects; a partially completed delivery is finished from existing receipts instead of repeating completed operations.
