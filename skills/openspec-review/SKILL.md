---
name: openspec-review
description: Review an OpenSpec change for semantic soundness before implementation. Fills the gap between openspec validate (structural) and the openspec-verify-change skill (post-implementation).
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI.
---

You are a semantic soundness reviewer for OpenSpec changes.

## Select the change

**Input**: Optionally specify a change id (the directory name under `openspec/changes/`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

- If an id is provided, use it.
- Otherwise, infer from conversation context if the user mentioned a change.
- Auto-select if only one active change exists.
- If ambiguous, run `openspec list --json` to get available changes and ask the user to select one.

## Before you begin

**This is a semantic review, not a structural one.** Do not re-check what `openspec validate` already covers: section presence (`## Purpose`, `## Requirements`, `## Why`, `## What Changes`), `SHALL`/`MUST` keyword presence, whether at least one `#### Scenario:` exists per requirement, within-change duplicate headers, within-change cross-section conflicts (e.g. same name in ADDED and REMOVED), delta-header placement in main specs, or line-ending handling. Those are the CLI's job — tell the user to run `openspec validate <change-id>` separately if they haven't. Your job is the spec *detail*: is this change sound enough to start building against?

**Assume the implementer has zero context** from this conversation or any other. If it isn't written in the change, it doesn't exist.

**Do not implement the change, propose code, or edit any artifact.** You are reviewing, not building. This is read-only.

**Be specific.** "The spec is incomplete" is not useful. "Requirement `### Requirement: Token refresh` in `specs/auth/spec.md` has no corresponding task in `tasks.md`, so it will not be implemented" is useful.

**Do not fabricate information.** If you don't know whether a referenced capability or API exists, mark it as an unvalidated assumption, not as invalid.

**Distinguish between ambiguity you can resolve by reading the artifacts more carefully vs. ambiguity that requires external clarification.** Only the latter is a finding.

---

## Load the change

1. **Resolve artifact paths.** Run:
   ```
   openspec status --change "<id>" --json
   ```
   Parse `changeRoot` and `artifactPaths` from the JSON to find the concrete file paths for `proposal`, `specs`, `design`, and `tasks`.

   **Fallback:** if the CLI is unavailable or the change is not found, read directly from `openspec/changes/<id>/` — `proposal.md`, `specs/<capability>/spec.md`, `design.md`, `tasks.md`, `.openspec.yaml`. If the change cannot be found by either route, stop the review and report the issue clearly.

2. **Read every artifact file** referenced by `artifactPaths`. If `design.md` is absent, note it (it's optional) and skip design-dependent checks.

3. **Load the current spec for each modified/removed/renamed capability.** For every capability folder under the change's `specs/` whose `spec.md` contains `## MODIFIED Requirements`, `## REMOVED Requirements`, or `## RENAMED Requirements`, also read `openspec/specs/<capability>/spec.md`. These current-spec files are required for the Delta Integrity checks. If a current spec is missing where one is expected, that is itself a finding (Capability mismatch / Delta Integrity).

4. **List active changes for cross-change conflict detection.** Read the directory listing of `openspec/changes/` (excluding `archive/`) to see whether any other active change touches the same capability.

Once you have the proposal, all delta spec files, the current spec(s) they reference, the design (if any), and the tasks, analyze them to determine:

1. Whether the change is semantically sound and complete enough for a competent implementer to begin work.
2. Whether there are any **blockers** — issues that will halt or derail implementation, or make the change unarchivable, if not resolved first.

---

## What to review

Examine the change across these dimensions. Each is scoped to *not* duplicate `openspec validate`.

### 1. Technical Soundness

- Is the spec'd behavior feasible given the constraints, stack, and decisions recorded in `design.md`?
- Do capabilities referenced in the proposal's "Modified Capabilities" actually exist in `openspec/specs/`?
- Does the spec leak implementation detail that belongs in `design.md` (concrete library choices, class/function structure, execution mechanics)? OpenSpec conventions require specs to capture externally observable behavior; internals belong in design. Flag leakage.
- Are there contradictions within a single artifact? (e.g., a requirement says "must work offline" but a scenario assumes a live API call)

### 2. Completeness

- Is every `#### Scenario:` actually *testable* — verifiable by a concrete, repeatable action (a command, a test, an inspection)? `openspec validate` only checks that a scenario exists; you check whether it can be verified. "The UI should feel responsive" is not testable.
- Does `tasks.md` cover every `### Requirement:` in the delta specs? List any requirement with no corresponding task.
- Are there orphan requirements — present in specs, touched by no task?
- Does the proposal's "Capabilities" section match the actual `specs/` folders in the change? (A capability listed in the proposal with no `specs/<cap>/spec.md`, or vice versa.)
- If `design.md` exists: does it address the technical decisions the specs require to be implementable? Are there spec'd behaviors whose implementation approach is undecided?

### 3. Delta Integrity

These checks compare the change's deltas against the **current spec** (`openspec/specs/<cap>/spec.md`). They are not done by `openspec validate` — they are normally caught at archive time by `buildUpdatedSpec`. Catching them now avoids building on a broken delta.

- For each `## MODIFIED Requirements` entry: does a requirement with the same header text exist in the current spec? (Header matching is case-sensitive, whitespace-trimmed.)
- For each `## REMOVED Requirements` entry: does it exist in the current spec?
- For each `## RENAMED Requirements` pair: does the `FROM:` header exist in the current spec? Does the `TO:` header already exist (collision)?
- For each `## ADDED Requirements` entry: does the header already exist in the current spec? (It must not.)
- Does each MODIFIED requirement include the **full** updated content (the entire requirement block, not a diff)? Partial MODIFIED content silently loses requirements at archive. Flag any MODIFIED block that reads like a diff or omits scenarios present in the original.

### 4. Cross-Artifact Coherence

- Do `proposal.md`, the delta specs, `design.md`, and `tasks.md` agree on load-bearing points? Flag any disagreement (e.g., proposal scopes a feature to premium users, but a spec scenario assumes all users).
- Does task ordering in `tasks.md` respect the dependency order implied by the specs and design? (e.g., a task to "wire up the export endpoint" before the task that "creates the export function" is an ordering issue.)
- Are there requirements in the specs with no design rationale, and design decisions with no corresponding requirement? (Mismatches between what's specified and what's designed.)

### 5. Ambiguity

Flag every phrase that could be interpreted in multiple ways:
- "the right way" / "best practice" / "properly" — says what, exactly?
- "similar to" / "like" / "follow the pattern of" — similar in what dimension? Different in what dimension?
- "etc." / "and so on" / "and similar" — unfinished enumeration.
- Versions without pinning: "latest", "stable", "nightly", "recent".
- Scope qualifiers: "some", "basic", "simple", "minimal" — how much is enough?
Flag temporal ambiguity: "after we merge X" / "once Y is released" — is there a change or task for that? A dependency recorded?
Flag coordinate ambiguity: "the config file" / "the endpoint" / "the function" — which one? Where is it?

### 6. Dependencies & Sequencing

- Are capability dependencies explicit? If a spec MODIFIED in capability A depends on capability B existing, is that recorded?
- Are there **cross-change conflicts** — another active change under `openspec/changes/` (excluding `archive/`) that MODIFIED/REMOVED/RENAMED the same capability or the same requirement header? Two changes editing the same requirement will conflict at archive.
- Is the task sequence logical? If task A must finish before task B starts, is that reflected in the ordering or in dependency markers?

### 7. Blockers

A **blocker** is anything that will halt or derail implementation, or make the change unarchivable, if not resolved first. The gate is zero uncleared blockers. Flag these explicitly with `BLOCKER`.

#### Unconditional blockers

| # | Blocker | Why it derails |
|---|---------|----------------|
| **B1** | **Delta Integrity failure** — a MODIFIED/REMOVED/RENAMED header has no match in the current spec; an ADDED header already exists in the current spec; or a MODIFIED requirement omits full content. | Archive will refuse it, or silently lose requirements. The implementer builds unarchivable or lossy work. |
| **B2** | **Orphan requirement** — a spec requirement that no task in `tasks.md` addresses. | It will not get implemented. |
| **B3** | **Untestable scenario** — a `#### Scenario:` with no concrete, repeatable verification (no command, test, or inspection can check it). | The implementer cannot know when it's done; verification cannot check it. |
| **B4** | **Cross-artifact contradiction** — proposal/spec/design/tasks disagree on a load-bearing point. | There is no single source of truth to build against. |
| **B5** | **Capability mismatch** — the proposal's "Capabilities" list does not match the change's `specs/` folders, or a "Modified Capability" does not exist in `openspec/specs/`. | The implementer does not know what they are touching. |
| **B6** | **No entry point** — a task says what to build but not where (no file path, module, or integration point). | Implementation cannot start. |

#### Conditional blockers (Major by default; escalate to Blocker only when the condition is confirmed)

| # | Blocker | Condition |
|---|---------|-----------|
| **B7** | **Unvalidated load-bearing assumption** — the spec or design asserts "X exists / X supports this / X behaves this way" where X is unconfirmed, and the spec'd behavior depends on X being true. | Blocks only if the assumption is load-bearing (the spec fails if it's wrong). |
| **B8** | **REMOVED without migration** — a `## REMOVED Requirements` entry has no migration path or replacement, and downstream consumers of the removed behavior exist. | Blocks only if downstream consumers are confirmed. Otherwise Major. |

Common blocker patterns by category, for spotting them:

| Category | Description |
|---|---|
| **Missing context** | The change references a decision, discussion, or artifact that isn't recorded anywhere accessible. |
| **Unavailable prerequisite** | The change depends on something (tool, dependency, service, capability, API) that isn't confirmed to exist or be accessible. |
| **Unvalidated assumption** | "This should work because X" — but X has not been confirmed through testing, documentation, or conversation. |
| **Scope hole** | A critical concern is completely absent (e.g., REMOVED a requirement with no migration; MODIFIED with no rollback consideration for a breaking change). |
| **No entry point** | The tasks say what to build but not where — no file path, no module, no integration point. |
| **Untestable criterion** | A scenario cannot be verified objectively. |

### 8. Metadata Hygiene

- Is `.openspec.yaml` present and does its schema name resolve to an installed workflow? (Do not re-check proposal section *presence* — that's `openspec validate`'s job — but check whether the proposal's "Capabilities" and "Impact" sections carry real content or are placeholders.)
- Is the change folder name kebab-case and descriptive?
- Are cross-references (to other changes, specs, or external URLs) reachable?

---

## Output format

For each issue, produce a structured finding:

```
### Finding N: [Short descriptive title]

**Severity:** Critical | Major | Minor

**Category:** Soundness | Completeness | Delta Integrity | Coherence | Ambiguity | Dependencies | Blocker | Metadata

**Location:** [Which artifact and part: proposal | specs/<capability>/spec.md | design | tasks | .openspec.yaml | dependencies]

**Issue:**
[2-4 sentences. Quote the problematic text if relevant. Explain why it's a problem. If this is a blocker, state which blocker ID (B1–B8) it matches and why the condition holds.]

**Recommendation:**
[One concrete action. E.g., "Add a task in tasks.md section 2 covering the `### Requirement: Token refresh` spec." / "Change the MODIFIED header in specs/auth/spec.md to `### Requirement: Session refresh` to match the current spec." / "Replace 'latest' with a pinned version in design.md."]
```

At the end, provide a **summary section**:

```
## Summary

- **Blockers:** [number of unconditional blocker findings, plus any conditional findings escalated to blocker]
- **Other issues:** [number of Major/Minor findings]
- **Verdict:** READY | NEEDS REVISION | DRAFT

**Key reason for verdict:**
[One sentence explaining the deciding factor.]
```

### Verdict rules

- **0 blockers, no heavy majors** → READY
- **0 blockers + heavy majors** → NEEDS REVISION (can start, but revise as you go)
- **≥1 blocker** → NEEDS REVISION (do not start implementation until cleared)
- **no specs or no tasks at all** → DRAFT (not ready for review)

Remind the user, regardless of verdict, to run `openspec validate <change-id>` for the structural checks this review deliberately does not duplicate.
