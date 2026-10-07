# Issue-to-PR control flow

`SKILL.md` defines stage contracts and completion gates. Execute each delegated stage in a separate Agent; nested `orc-*` agents orchestrate their own workers.

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
    result = DELEGATE the stage's named orc-* skill
    IF stage = Groom:
      validation = DELEGATE structural validation and readiness assessment
    REQUIRE the stage's completion gates and full evidence
  ACCEPT completion only after delegated evidence establishes it

GUARD expected worktree/refs and authorized changes through delegation
DELEGATE required validation and merge-base guard against current origin/<base>
IF intended merge base no longer matches current origin/<base>:
  DELEGATE safe reconciliation and rerun affected validation before accepting delivery
delivery = DELEGATE Deliver with PR base <base>, reconciling any partial operation before retries
ACCEPT verified signed commits, push, PR identity/body, and remote head

review = DELEGATE orc-pr-review-repair(exact PR, worktree, issue/change)
ACCEPT complete review/repair outcome, final head, and history receipts
final = DELEGATE final-head delivery gates and state verification
REQUIRE reviewed head = delivered head = final gate head
FINISH with issue/flow/worktree/change/PR, checks, findings, and receipts

ON any missing evidence, blocked stage, or human-input request:
  DELEGATE safe missing investigation when existing intent determines it
  OTHERWISE preserve work, sticky identities, reports, and operation receipts
  REPORT exact blocker and question/options/recommendation; PAUSE
  AFTER user reply, DELEGATE state reconciliation and resume the blocked stage
  Retain nested skill histories and repair budgets; do not replay completed delivery
```

On resume, completion must be re-established against actual issue, artifact, git, and PR state. A partial or blocked run never reaches the success report.
