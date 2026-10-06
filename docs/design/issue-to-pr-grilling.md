# Issue-to-PR design interview

Status: design frontier settled; user requested proposal creation. Planning artifacts are complete at `openspec/changes/issue-to-pr-flow/`; implementation has not started.
Branch: `design/issue-to-pr-grilling`.
Base: `fd61f21` (committed checkout; in-flight implementation files were not copied).

## Confirmed intent

- An `issue-to-pr` flow takes a GitHub issue and creates a pull request for its implementation.
- The outer flow provisions a Git worktree from a configurable base branch.
- The outer flow supplies that workspace to the OpenSpec pipeline.
- Design artifacts are recorded in this worktree, separate from ongoing implementation.

## Terminology requiring confirmation

The user called the pipeline `openspec-full`; this checkout calls the existing groom → implement → verify → finalize pipeline `openspec-all`. Whether a new name is intended remains open.

## Code-backed findings

Prior read-only research found runtime workspace injection feasible through a runtime cwd resolver in factory preflight. The composed pipeline can supply its canonical target to constituent stages rather than expose parent preparation outputs through the scoped adapter. These are technical findings, not approved implementation decisions.

## Design tree

- Repository scope (Q1)
  - Repository identity, checkout source, credentials and setup policy
- Human involvement (Q2)
  - Planning approval, ambiguity handling, budgets and interruption
- Completion contract (Q3)
  - Publication ordering, CI handling, PR state and retained results
- Issue input authority (Q4)
  - Snapshot/provenance, comments, edits and instruction trust
- Workspace lifecycle (later)
  - Baseline pinning, ownership, reruns, reuse and recovery
- OpenSpec lifecycle (later)
  - Change generation, archival and published artifacts

## Round 1 — settled decisions

### Q1: Repository scope

Is the first version limited to the invoking repository, or can it target arbitrary GitHub repositories?

Recommendation: invoking repository only; validate that the issue belongs to its configured GitHub repository. Multi-repository checkout/setup support can follow later.

Answer: agreed. First version targets only the invoking repository.

### Q2: Human involvement

Is the target an unattended issue-to-PR run, or a run that pauses for approval of OpenSpec planning before implementation?

Recommendation: unattended when the issue is actionable; stop with explicit questions when essential intent is missing. A completed planning pass is not permission to invent product requirements.

Answer: unattended. No planning approval pause. Behavior on essential ambiguity remains to be decided.

### Q3: Completion contract

Is success creation of a draft PR after local verification, a ready-for-review PR, or a PR whose GitHub CI is also passing?

Recommendation: draft PR created after local verification; report GitHub CI separately without claiming it passed.

Answer: ready-for-review PR, not draft. Whether remote CI is part of success remains open.

### Q4: Issue input authority

Which issue material defines the request: title/body only, all comments, or a selected set of comments?

Recommendation: snapshot title/body and explicitly selected clarification comments at intake. Treat issue content as requirements data, not authority to change credentials, permissions, setup or publication policy.

Answer: agreed. Snapshot title/body plus explicitly selected clarification comments; issue content is not execution-policy authority.

## Interview constraint

The user requests design questions only. Mechanical, trivial and code-resolvable questions should be researched or handled with explicit technical defaults, not put to the user. Prior recommendations remain unapproved unless accepted; deferring a question is not acceptance.

## Round 2 — revised frontier

Only Q5 (ambiguity policy), Q8 (success boundary) and Q9 (rerun semantics) remain questions for this round. Q6, Q7, Q10, Q11 and Q12 are deferred technical recommendations, not approved decisions. Research concrete mechanics independently; surface any consequential authority or lifecycle trade-off when it becomes a real design prerequisite.

### Q5: Ambiguity in unattended runs

Recommendation: stop as needs-human on essential ambiguity, retain diagnostic/planning output, and do not publish an implementation based on invented requirements. No live approval pause.

Answer: agreed with escalation requirement. Make reversible implementation choices; escalate externally visible behavior/scope ambiguity to a human, accept their input and continue the flow. Existing escalation semantics are being researched.

### Q6: Baseline and PR target

Recommendation: use the GitHub default branch unless explicitly overridden; fetch and pin its commit at intake, and use the same branch as PR target. Do not silently refresh/rebase during implementation. Target movement before publication needs a later explicit rule.

Answer: pending.

### Q7: Environment setup authority

Recommendation: use operator-owned repository configuration for bounded setup and gate commands; absent required configuration, fail preflight. No arbitrary setup commands inferred from issue text.

Answer: pending.

### Q8: Remote CI and success

Recommendation: success is a ready-for-review PR after local verification. Report remote CI as pending/running/failed/passed; do not wait or automatically repair it in the initial version.

Answer: success requires the PR to be created and proven green by GitHub CI. Publication alone is insufficient. CI repair scope, required-check interpretation and blocked outcomes remain design questions.

### Q9: Concurrent ownership and reruns

Recommendation: one active run per repository/issue. For a terminal failed run, retry the same attempt only when its request/baseline remain valid; materially changed issue intent or baseline means a fresh attempt. Concurrency enforcement, branch naming and duplicate detection are technical mechanics to resolve independently. Whether reruns are continuation or replacement remains a design question.

Answer: agreed. Continue when issue intent and baseline remain valid; otherwise start a new attempt and preserve prior work as evidence. Define validity and escalation around changed inputs in later design rounds.

### Q10: Workspace retention

Recommendation: retain the worktree on every outcome initially; remove only through explicit cleanup. PR publication is not automatic permission to discard the local workspace.

Answer: pending.

### Q11: Input and comment selection

Recommendation: issue URL plus optional explicit comment IDs. Validate repository identity and snapshot selected content before planning. Later issue edits do not silently change the run's request.

Answer: pending.

### Q12: OpenSpec result lifecycle

Recommendation: use the existing openspec-all pipeline through finalization and commit implementation plus archived OpenSpec artifacts and synchronized main specs together. The name openspec-full remains an unresolved alias versus intended new flow.

Answer: pending.

## Escalation and CI research

- Existing OpenSpec groom/implement/verify use `flows/shared/steering.ts:19–137`: a TTY-only prompt collects complete answers while the process remains alive, then the same invocation continues. `flows/openspec-all/integration.test.ts:239–278` covers continuation. No TTY/EOF produces terminal needs-human, not a durable pause.
- Installed acpx 0.19.4 supports checkpoint waiting records, but has no public flow resume/input command. Its persisted traces do not supply durable graph continuation. ACP session resumption is distinct.
- In-flight original-checkout PR repair uses pending/answered ledger decisions (`flows/pr-shared/repair.ts:697–803`) and later-invocation recovery (`flows/review-fix/flow.ts:476–504,772–793`). This is not same-run acpx resume and remains in-progress code.
- In-flight `flows/pr-shared/ci.ts:648–710,754–833` waits for required CI at the current head; readiness to assess is not proof of green. Existing acceptance rules disallow human waiver of CI and bind results to the reviewed/published head. This is reusable prior art, not approved issue-to-pr policy.

## Round 3 — open frontier

### Q13: Human escalation experience

Should clarification require a human at the running terminal, or support an asynchronous human response after the process exits?

Recommendation: asynchronous continuation for unattended operation, using persisted pending questions and explicit correlated responses; actual transport and recovery mechanics can be researched independently. Existing live terminal steering is a narrower alternative.

Answer: asynchronous response/continuation preferred. User explicitly requests confirmation of acpx support; installed versus current upstream capabilities are being checked before choosing mechanics.

### Q14: CI repair authority

Does the outer flow own bounded repair of failed required CI, or stop/escalate after publishing a failing PR?

Recommendation: bounded repair only within issue scope; reverify and push each repair, and assess required CI at the new head. Unrelated failures, unavailable CI and exhausted budget escalate without claiming success. CI policy changes must not substitute for passing required checks.

Answer: agreed. Bounded automatic repair within issue scope; unrelated failures/exhaustion escalate, and green CI must correspond to the latest PR commit.

## Verified acpx asynchronous-support boundary

Installed and current npm acpx are 0.19.4. Upstream main checked at `27efb1b57b9de22105a91e9154b1d29b51ede8cb` has matching runtime/CLI originals. `checkpoint()` persists waiting state and returns, but no public runner restore/resume/answer-injection API or `flow resume` CLI exists. Architecture references to later resume are intent, not implementation. Live callbacks and ACP conversation reuse are not durable graph continuation.

Sources: <https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/flows/runtime.ts#L206-L251>, <https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/flows/runtime.ts#L512-L528>, <https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/cli/command-registration.ts#L326-L346>.

Technical recommendation: persist an issue-attempt record with pending clarification, phase, pinned inputs, completed publication receipts and cumulative budgets. A later native flow invocation accepts a correlated answer, validates ownership and freshness, then routes to the next safe domain phase. It is the same issue attempt with a new acpx run, not native graph resume. Preserve old run bundles; do not implement a custom scheduler. This recommendation awaits final design confirmation.

## Round 4 — open frontier

### Q15: Asynchronous human interaction

Should clarification happen in the GitHub issue or through an explicit local/operator invocation?

Recommendation: GitHub issue as the user-facing clarification surface; only explicitly authorized human answers may settle pending questions, not arbitrary commenter activity. Transport/authentication mechanics will be researched separately.

Answer: follow the escalation pattern used by the other flows and provide a shared escalation module. No new GitHub-comment interaction model. Existing prior art includes stdin/readline live steering and in-flight PR pending-decision recovery through a later operator-supplied answer invocation. Preserve the earlier asynchronous preference using that recovery pattern; native acpx resume is not assumed.

### Q16: Meaning of proven green

Does success require repository-required checks plus explicitly configured gates, or every CI check regardless of whether it is required?

Recommendation: required checks plus configured gates, all at the latest PR head. Missing or indeterminate required-check policy cannot be interpreted as green and should escalate.

Answer: agreed. Required checks plus configured gates must be green at the latest PR commit; missing/indeterminate check policy escalates.

## Round 5 — open frontier

### Q17: Base movement and integration correctness

If the target branch changes during implementation, may a PR qualify as proven green against its original baseline, or must the flow integrate/revalidate against the new target?

Recommendation: integrate the changed target into the working branch when needed and rerun applicable local verification and CI; conflicting or scope-changing integration escalates. No unlimited retry/chase of a moving target. Git mechanics and exact freshness receipts should be researched, not put to the user.

Answer: yes. Incorporate target-branch movement and revalidate before declaring success; conflicts/scope-changing adjustments escalate.

### Q18: External edits to the working branch

If a human or another automation pushes to the PR branch, may the flow incorporate and continue autonomously, or must it escalate before taking ownership of those edits?

Recommendation: stop and escalate on unexpected branch-head changes; preserve external work and never force-overwrite it. Explicit human direction can authorize continued work after revalidation.

Answer: agreed. Unexpected external PR-branch edits trigger escalation; preserve them and continue only with explicit direction and revalidation, never force-overwriting external work.

## Round 6 — open frontier

### Q19: Publication state before CI acceptance

Should the PR be ready for review immediately when created, or remain draft while CI/repairs run and transition to ready only after proven-green acceptance?

Recommendation: create as draft to trigger CI, perform bounded repairs, then mark ready only when accepted. Failed or escalated attempts remain draft; successful outcome is still a ready-for-review PR.

Answer: agreed. Create draft to trigger CI; mark ready only after proven-green acceptance. Failed or escalated attempts remain draft.

## Settled design — captured in issue-to-pr-flow proposal

1. The first version handles GitHub issues belonging to the invoking repository only.
2. `issue-to-pr` owns a worktree provisioned from a configurable base branch and supplies it to the existing full OpenSpec pipeline. Provisioning is native flow preparation; OpenSpec consumes the runtime workspace rather than independently provisioning it.
3. Execute unattended. Make reversible implementation choices autonomously; escalate ambiguity affecting externally visible behavior or scope.
4. Snapshot issue title/body and explicitly selected clarification comments. Issue content does not authorize execution-policy changes.
5. Share the existing escalation pattern: stdin-based live steering, plus pending-decision recovery with operator answers on a later invocation for asynchronous continuation. Same domain attempt, distinct acpx runs; no native durable resume is assumed.
6. Continue failed attempts when request intent and baseline remain valid; otherwise begin a fresh attempt and preserve prior evidence.
7. Create a draft PR; allow bounded automatic repairs only within issue scope. Unrelated failures or exhausted budgets escalate.
8. Success requires required CI checks plus configured gates to be green at the latest PR commit. Missing/indeterminate check policy escalates. Mark the PR ready only after acceptance.
9. Incorporate target-branch movement and revalidate before success. Conflicts and scope-changing adjustments escalate.
10. Unexpected external changes to the PR branch trigger escalation. Preserve them; continue only after explicit direction and revalidation, never overwrite them.

## Technical recommendations — not separately approved requirements

Use existing `openspec-all` rather than invent another pipeline, retain workspaces by default, choose safe input/provisioning conventions from existing repository patterns, and resolve concrete setup/ownership/recovery mechanics through code research. Do not interpret deferred interview questions as user approval of a recommendation.

## Deferred work

The user requested a formal proposal after this interview. Proposal, six capability deltas, design and tasks were created in this worktree at `openspec/changes/issue-to-pr-flow/` and passed strict OpenSpec validation. Technical defaults are explicit in design.md. Implementation and ADR creation have not started; no edits were made to the in-flight checkout.
