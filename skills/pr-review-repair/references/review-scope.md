# Review and verification scope

Read before briefing a reviewer or verifier. [Control flow](./pseudocode.md) owns transitions; this contract owns what each delegate sees and what counts as an acceptable answer.

## Reviewer brief

Use fresh, read-only, history-free reviewers, with parallel Standards and Spec axes. Supply only PR/worktree identity, project instructions, absolute `code-review` path, clean requirements/standards sources, pinned refs, explicit full scope/range, and current head. Exclude prior reports, judgments, repair rationale/summaries, and history comments from the review delegate and both axis prompts. The separate judge owns prior-finding reconciliation.

- **Scope:** the entire PR diff from the pinned merge-base to current head, including repairs delivered so far. Retain `code-review`'s full PR comparison, its two-axis method, and its required sources.
- **No partial mode:** there is no delta or changed-lines-only review, and no fourth round. The cap replaces incremental review: rounds are few and complete, rather than many and narrow.
- **Return** complete reports with scope expansions, skipped coverage, and uncertainties. A round that inspects the full diff but stops mid-file is incomplete.

Verification-sourced issues are not reviewers' business during discovery; report everything Standards and Spec find, and let judgment classify it.

## Verifier brief

Verification runs only after the discovery window closes. Use a fresh, read-only Agent with the open IDs, each ID's fixing commits, the affected files/contracts, and the required check definitions. Give it no license to survey the PR.

Its question is narrow: **does the current head resolve each open ID, keep every resolved ID resolved, and did the fix break what it touched?** Checking already-resolved IDs is what stops one repair from silently undoing an earlier one.

- **Resolved:** cite the code or check that satisfies the ID.
- **Unresolved:** cite what is still missing; keep the ID open.
- **Regression:** a fix breaks a caller, dependency, test, required check, or previously resolved ID; keep the affected ID open.
- **New issue:** any other problem noticed. Never repaired after the window; record it as deferred under Report contracts.

Verification **confirms, denies, or regresses; it never discovers.** A verifier that returns new work as repair scope is out of contract; route that output to the deferred list without repairing it. Required checks still run mechanically at every delivered head, and a check failure traceable to a repair commit is a regression, not a deferral.

## Evidence reuse

Reuse preparation results (source locations/content fingerprints, pinned refs, check definitions) only while inputs match. At stage boundaries, recheck git/PR state, refresh relevant history, and revalidate source discovery/fingerprints, including added or removed requirements/standards files. Every reviewer and verifier still reads required sources.

Reuse check evidence only for matching source, configuration, dependencies, and relevant environment required by that check. Record the original SHA, command, result, inputs, and acceptance rationale. Rerun affected checks and every required check without matching evidence. Verification may reuse valid check evidence only at the same unchanged head, but performs its own per-ID inspection.
