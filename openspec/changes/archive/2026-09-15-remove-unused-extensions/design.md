## Context

See `proposal.md` — Why. Three extensions are unmounted with no successor. Two constraints shape the approach:

- **OpenSpec has no whole-capability removal.** `archive` rebuilds a capability's spec by applying the delta, then refuses to write a spec with zero requirements unless the change declares `retire_capabilities: true`. Retirement therefore requires enumerating *every* requirement the capability currently has — an incomplete list silently leaves the capability alive with the residue.
- **Dependency removal is not a pure source deletion.** `jiti` + `typebox` are runtime `dependencies`, `@earendil-works/pi-ai` and `@earendil-works/pi-tui` are `devDependencies`, and `pi-tui` is also a `peerDependencies` entry. Dropping them rewrites `package-lock.json` and invalidates the `rootNodeModules` `npmDepsHash` that every flake check consumes.

The unarchived-but-complete `agentflow-script-imports` change adds a third: its MODIFIED/ADDED deltas were never applied to the main specs, so the set of requirements to retire is ambiguous until it is archived.

## Goals / Non-Goals

**Goals:**

- Leave the repository describing exactly what it ships: two extensions, their flake outputs, and their tests.
- Retire the four AgentFlow capabilities completely, with an archive record that explains the withdrawal.
- Keep each removal independently revertable.

**Non-Goals:**

- Porting `.pi/agentflow/review-pr.ts` to another runner. It is deleted as dead code; no successor is claimed.
- Introducing a parked-extension directory or deprecated flake aliases. Git is the archive.
- Changing the per-extension flake-output model, or the README's framing beyond the claims this change falsifies.
- Fixing the dotfiles' dangling `${agent-mod.pi-prompts}/openspec-review.md` reference (separate repository).

## Decisions

**D1 — Delete outright rather than park the code.** A `parked/<name>/` tree rots: it is excluded from `tsconfig`, from the flake checks, and from CI, so it drifts against pi's SDK until it is worse than a rewrite. The repository has revived extensions before (`crof-usage` → `crof`) and did so by re-adding, not by restoring. Git already holds the code at the parent commit.
*Alternatives considered:* a parked directory (rejected — untested code that still looks supported); deprecated flake aliases for one cycle (rejected — the only consumer is the author's dotfiles, which never referenced these outputs).

**D2 — Retire the capabilities by delta, archiving `agentflow-script-imports` first.** Archiving the stale change applies its +5/~7 deltas to the main specs, which is what makes the retirement's requirement list unambiguous (42 requirements: 11 + 7 + 19 + 5). The retirement delta then lists every requirement by name under `## REMOVED Requirements`, and the change's `.openspec.yaml` sets `retire_capabilities: true` so `archive` deletes the spec files instead of aborting. Requirement bodies are not copied into the delta — the text is recoverable from the parent commit, and REMOVED entries need only the name.
*Alternatives considered:* retiring against the pre-archive spec state (rejected — it races an unapplied delta and would leave the ADDED requirements alive); leaving `agentflow-script-imports` active (rejected — it would end up pointing at capabilities that no longer exist); hand-deleting the spec files (rejected — bypasses the archive record and leaves no `Reason`/`Migration`).

**D3 — `.pi/agentflow/` goes with the extension.** `review-pr.ts` and `agentflow.d.ts` are committed in this repository and only execute with `pi-agentflow` mounted. Keeping them would leave `tsconfig`'s `.pi/agentflow/**/*.ts` include type-checking files whose runtime no longer exists.

**D4 — Drop the orphaned dependencies, including the `pi-tui` peer entry.** A `peerDependencies` entry is a claim about what consumers must supply; with no importer that claim is false. `dependencies` and `peerDependencies` are separate edits to the same concern. This lands in its own commit because it is the only step that rewrites the lockfile and the `npmDepsHash`, and a bisect should land on a buildable tree at each extension removal.
*Alternatives considered:* folding each dependency into the removal commit that orphans it (rejected — `jiti`/`typebox`/`pi-tui` die with AgentFlow and `pi-ai` with TPS, so the commits would be non-uniform and the hash refresh would straddle them).

**D5 — One commit per extension, plus dedicated commits for dependencies, docs, and the removal convention.** Each extension's removal is a self-contained revert; the docs commit also documents `ollama-usage`, which the removals did not touch; the `AGENTS.md` commit codifies the procedure so the next removal does not rediscover it.

## Risks / Trade-offs

- **`npm install` strips `integrity` from `@earendil-works/*` lockfile entries** (its published shrinkwrap omits them) → verify every `@earendil-works/*` entry after regenerating, and backfill the hashes from the registry before refreshing `npmDepsHash`.
- **`npmDepsHash` mismatch fails every flake check at once, not just one** → set it to `pkgs.lib.fakeHash`, build a single check, and copy the reported `got:` value back before running the full `nix flake check`.
- **An incomplete `## REMOVED Requirements` list silently keeps the capability** → generate the list from the main specs *after* archiving `agentflow-script-imports`, and confirm `openspec validate --all --strict` reports the capability specs gone after archive.
- **The retirement delta touches specs that are then deleted**, so the archive's spec content is churn that only history sees → accepted: the alternative is an archive record that contradicts the tree it was built from.
- **`retire_capabilities: true` deletes specs irreversibly** → the change and its deltas are preserved under `openspec/changes/archive/2026-09-15-remove-unused-extensions/`, and the deleted spec bodies remain in the parent commit.

## Migration Plan

Commits, in order: archive `agentflow-script-imports` → author this change → remove `crof` → remove `tps` → remove `agentflow` → drop orphaned dependencies → document `ollama-usage` and re-frame the README → codify the removal procedure in `AGENTS.md` → archive this change (deletes the four capability specs).

Gates: `openspec validate remove-unused-extensions --strict` before the code removals; `nix flake check` after them; `openspec validate --all --strict` after archiving.

Rollback is per-commit revert — no migration of user data is involved, and no flow scripts exist outside this repository's own `.pi/agentflow/`.
