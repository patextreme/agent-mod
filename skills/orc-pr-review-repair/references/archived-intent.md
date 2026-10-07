# Archived OpenSpec review and repair

Read during preparation and before judgment/repair when the caller supplies OpenSpec archived-source context. This is an optional branch of PR review/repair, not a new finalizer or review threshold. Ordinary PRs keep their existing sources and policies. Archived means complete and packaged for review, not merged or exempt from requirements.

## Confirm sources, then review

The preparer receives the originating issue and approved intent, change/schema/planning-root/store identity, exact confirmed archive path and complete artifact inventory (including `.openspec.yaml`), delta-to-main mapping and relevant main-spec paths. Keep installation paths separate from planning paths. An empty delta/main mapping can be legitimate for a no-delta scope; record applicability and reasons rather than fabricate specs. Check the receipt against actual branch files and the entire outgoing PR diff: same target, source absence, complete archive contents and metadata, relevant main specs and authorized ownership. Account for git's rename presentation. After a repair, reconcile current content identity against accepted repair-owned edits rather than demand that all archive hashes remain frozen.

Missing paths, incomplete inventory, mismatched identity, unread required evidence or external-store contents absent from this PR pause preparation/review with exact missing evidence and a scoped question. Only an explicit user decision can authorize limited coverage; disclose the omitted sources and never call it full verification. Retain code-review's issue-tracker prerequisite even with an explicit archive path.

Build **clean sources** for the fresh code-review agent and both nested axes: project instructions/standards, originating issue and approved intent, confirmed archive path/inventory, archived proposal/specs/design/tasks (or schema-equivalent available artifacts), and relevant main specs. Require each axis to read its applicable sources and disclose scope. Supply no previous findings, judgments, repair summaries or history comments. Archival does not make an available artifact optional; legitimately absent/skipped schema artifacts are recorded, not invented. Read archived files directly; do not use active-change status/apply/verify commands, reopen the archive, or run the lifecycle to recover requirements. Judges receive the full current sources **and** prior ledgers/history separately, so old actionable IDs remain accountable.

## Classify the authorized correction

Only the existing material repair threshold permits edits. The judge identifies approved-intent citations, code/archive/main-spec alignment, affected files and the correction class before reserving a repair attempt.

| Class | Required evidence and work |
| --- | --- |
| Code-only | Restore code to established archived/main requirements. Record requirement/scenario citations, actual code-path or regression evidence and affected required checks. Keep archive path/content and main specs unchanged unless evidence-backed bookkeeping is necessary; explain any such edit. |
| Behavior-affecting, within approved intent | Compare actual code, archived proposal/specs/design/tasks and relevant main specs together. Cite existing authorization for the observable correction. Reconcile affected archived documents and main specs when approved behavior or completion evidence changes. Documents already expressing the correction may stay unchanged, with per-document reasons. Preserve unaffected requirements/scenarios and mandatory test expectations. |
| New consequential intent | New requirements, consequential design/risk/public-contract choices or uncertain authority require a scoped user decision. Return finding, investigation/attempted fixes, proposed intent, affected code/doc/spec paths, question, options/consequences and recommendation; preserve safe work and pause before edits/publication. Do not initiate a replacement change automatically. |

Keep the confirmed archive directory in place for all in-scope repairs. No reopening, rearchiving, sync/archive replay or full-lifecycle rerun is needed. Correct implementation toward approved intent; rewriting requirements or weakening tests to excuse unrelated behavior cannot establish acceptance.

## Validate and deliver the correction

A repair report maps each authorized finding to code evidence, archived requirements/design/tasks and relevant main specs. List every affected document as changed with rationale or unchanged with evidence. Independently inspect the actual owned diff and preservation of unrelated requirements/scenarios/tests before delivery.

Run affected regression/behavior tests and all applicable required checks. For behavior-affecting or document edits, validate affected spec form/coherence and compare archived delta effects with current main specs directly, including preserved content. Use resolved files, and main-spec CLI validation where supported, or a **disposable validation fixture** with copies of the archive and required schema/config when active-change CLI validation cannot address an archive. Report actual source paths, fixture mapping, concrete commands/results and limitations; never move/reopen the real archive merely to run a command. No-delta scopes explain why a delta-to-main comparison is inapplicable; failed/unavailable required validation blocks acceptance.

The ordinary repair-start record reserves the attempt before edits; document work consumes the same attempt, not another protocol or fresh budget. Delivery stages only authorized code/test/archive/main-spec changes and independently checks commit contents and the entire outgoing range under existing signing/normal-push policy. A fixing commit invalidates earlier head-bound gates: require fresh full-diff history-free review, history-aware judgment accounting for every actionable ID, affected document/spec validation and required final-head checks at the same delivered/reviewed SHA. Post repair alignment evidence through the existing summary/escalation contracts.

## Model-free archived-repair examples

These declarative traces test documented inputs/receipts and permitted transitions only; they execute no models, commands, repair, commit or publication. `deliver` denotes permitted dispatch, not a delivery receipt. They do not replace independent contract review or operational prerequisite checks.

| Case | Trace | Outcome |
| --- | --- | --- |
| ordinary-pr | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates | verified |
| missing-archive | prepare → pause | escalated |
| incomplete-archive-inventory | prepare → pause | escalated |
| missing-main-spec | prepare → pause | escalated |
| explicitly-limited-sources | prepare → review → judge → final-gates | limited |
| code-only-correction | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates | verified |
| code-only-bookkeeping | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates | verified |
| approved-behavior-reconciled | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates | verified |
| approved-behavior-docs-current | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates | verified |
| document-validation-failed | prepare → review → judge → reserve → repair → validate → pause | escalated |
| new-consequential-intent | prepare → review → judge → pause | escalated |
| stale-final-head-checks | prepare → review → judge → reserve → repair → validate → deliver → fresh-review → final-gates → pause | escalated |

Pauses preserve safe work and reserved accounting; use existing escalation records and report missing receipts directly. Continuation remains governed by the skill's actual-state/history reconciliation, not inferred success from this table.
