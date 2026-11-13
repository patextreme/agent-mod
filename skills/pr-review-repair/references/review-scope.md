# Review and verification scope

Read before briefing a reviewer or verifier. [Control flow](./pseudocode.md) owns transitions; this contract owns what each delegate sees and what counts as an acceptable answer.

## Reviewer brief

Use fresh, read-only, history-free reviewers, with parallel Standards and Spec axes. Supply only PR/worktree identity, project instructions, absolute `code-review` path, this scope/evidence contract, clean requirements/standards sources and justified impact context, the required coverage manifest, pinned refs, explicit full scope/range, and current head. Exclude prior reports, judgments, repair rationale/summaries, and history comments from the review delegate and both axis prompts. The separate judge owns prior-finding reconciliation.

- **Scope:** the entire PR diff from the pinned merge-base to current head, including repairs delivered so far. Retain `code-review`'s full PR comparison, its two-axis method, and its required sources.
- **Required sources:** applicable current requirements/spec and standards, including project instructions and `code-review`'s baseline. Name their selected versions/locations and why they apply. An explicitly authorized absent spec stays a visible coverage limitation, never an invented source or unqualified pass.
- **Required impact:** inspect relevant affected callers, interfaces, contracts, tests, and dependencies far enough to assess the diff's behavior and compatibility. Name the concrete impact rationale; unchanged code may be required when the diff affects it.
- **Optional context:** historical source versions, superseded documents, and unrelated discussions are not automatically required. Add a mandatory source only for an identifiable requirement, instruction, or concrete impact rationale. An expanding source/version inventory is not a completion criterion; selected current sources plus relevant impact define a demanding but finite review surface. Prior review reports remain excluded even as optional context.
- **No partial mode:** there is no delta or changed-lines-only review, no fourth round, and no review beyond the effective accepted limit (default three, optionally one or two). The cap replaces incremental review: rounds are few and complete, rather than many and narrow.
- **Return** complete axis reports with reviewed SHA/range, sources and inspected impact, substantive conclusions, checks/results, justified scope additions, skipped coverage, and uncertainties, plus the evidence handoff below. Unread required material, a mid-file stop, unfinished semantic inspection, or unresolved investigation is incomplete coverage, never a clean pass.
- **Report budget:** the report is published inline as the round's audit item, next to `coverage.json`, the saved originals, the check evidence and the ledger. Keep it under roughly 10 KB of Markdown (1,200–1,800 words) and complete by conclusion, not by inventory: per-finding severity, `file:line`, quoted hunk or spec line, consequence and verification, plus the axis verdict. Do not restate the per-source fingerprints and coverage accounts (they belong in `coverage.json`), the check commands and results (the checks item), or the dispositions (the ledger). A report that duplicates those artifacts bloats every later record and can exceed the publication limit; verbosity is not thoroughness.

Verification-sourced issues are not reviewers' business during discovery; report everything Standards and Spec find, and let judgment classify it.

## Verifier brief

Verification runs only after the discovery window closes. Use a fresh, read-only Agent with the recorded IDs (open and already resolved), each ID's fixing commits, the affected files/contracts, and the required check definitions. Give it no license to survey the PR.

Its question is narrow: **does the current head resolve each open ID, keep every resolved ID resolved, and did the fix break what it touched?** Checking already-resolved IDs is what stops one repair from silently undoing an earlier one.

- **Resolved:** cite the code or check that satisfies the ID.
- **Unresolved:** cite what is still missing; keep the ID open.
- **Regression:** a fix breaks a caller, dependency, test, required check, or previously resolved ID; keep the affected ID open.
- **New issue:** any other problem noticed. Never repaired after the window. Classify it before recording:
  - repair-worthy and outside the PR's intended scope → deferred under Report contracts; name the ticket, decision, or measurement that unblocks it;
  - repair-worthy and inside the PR's intent → keep the ID open and escalate: the closed window authorizes no repair;
  - below the repair threshold → report-only, recorded as evidence and never deferred.

- **Budget:** a verifier report is published inline with the next record too. Keep it to the per-ID verdicts and their evidence pointers (well under 6 KB), not a second pass over the PR.

Verification **confirms, denies, or regresses; it never discovers.** A verifier that returns new work as repair scope is out of contract; route that output through the classification above without repairing it. Required checks still run mechanically at every delivered head, and a check failure traceable to a repair commit is a regression, not a deferral. An unrelated or environmental check failure is a material limitation on the evidence, never deferred work.

## Coverage acceptance and recovery

Before briefing, give each delegate its required coverage manifest: the full pinned diff and applicable sources/impact for each reviewer axis; only recorded IDs, required sources, and affected fix contracts for the verifier. Keep optional history separately labeled. The supervisor owns completeness of this finite manifest, not an exhaustive historical-version inventory or read-certification ledger.

Read [Coverage evidence](./coverage-evidence.md) before briefing so each delegate receives its schema and bundled examples. Before accepting either axis report or a verifier report, apply that contract's persisted `coverage.json`/reviewer handoff and mandatory evaluator command. Match the returned manifest to the brief and inspect the actual evidence and substantive report; a green declaration alone is insufficient. Keep fresh independent reading and semantic inspection for each axis. A verifier uses the same evidence distinctions without expanding into a fresh PR survey or new repair authority.

Distinguish four layers: a requested read; completeness of the original saved result and its delivery to that reviewer; later compaction-summary clipping; and substantive review completion. A request proves neither delivery nor review. A complete saved output supports exposure only when the reviewer received it, and exposure alone cannot certify semantic completion. A summary omission marker alone cannot invalidate supported prior exposure.

After compaction, check original evidence and the concise reviewer handoff before selecting recovery. Preserve supported completed work at matching pins/sources. Target genuinely missing output, unread required material, unfinished analysis, stale inputs, or open investigations using the evaluator's gap actions. Shortened summaries alone require no wholesale rereading. If original evidence or the handoff cannot support completion, keep the actual gap explicit and recover it or escalate under the control flow. Recovery continues the same delegate's interrupted inspection; another round's historical report cannot replace a fresh review.

## Evidence reuse

Reuse preparation results (source locations/content fingerprints, pinned refs, check definitions) only while inputs match. At stage boundaries, recheck git/PR state, refresh relevant history, and revalidate source discovery/fingerprints, including added or removed requirements/standards files. Every reviewer and verifier still reads required sources and performs its own semantic inspection; reuse of setup metadata or checks never reuses another reviewer's exposure or conclusions. Keep historical reports with the supervisor/judge, outside the fresh axis briefs.

Reuse check evidence only for matching source, configuration, dependencies, and relevant environment required by that check. Record the original SHA, command, result, inputs, and acceptance rationale. Rerun affected checks and every required check without matching evidence. Verification may reuse valid check evidence only at the same unchanged head, but performs its own per-ID inspection.
