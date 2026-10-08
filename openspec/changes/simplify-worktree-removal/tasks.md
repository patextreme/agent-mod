# Tasks

## 1. Skill update

- [ ] 1.1 `skills/cleanup-merged-issues/SKILL.md` Inspect: shrink step 2 to record worktree path/lock state/main-vs-session detection, plus informational `git status --porcelain --ignored` per candidate worktree; delete the step 5 content gate (verify: no sentence gates eligibility on untracked/ignored files or initialized submodules)
- [ ] 1.2 `skills/cleanup-merged-issues/SKILL.md` Preview and confirm: add per-candidate ignored-path lines ("deleted by removal") and extend approval binding to the listed ignored-path listings (verify: preview section names ignored paths; binding sentence lists them)
- [ ] 1.3 `skills/cleanup-merged-issues/SKILL.md` Clean up approved candidates: new first step runs refspec inspection then `git fetch --prune` on the verified remote before removals; shrink the pre-removal recheck to identity, PR merge state, tips, worktree path/lock state, and exclusions, treating a git refusal as fresh evidence never retried; reword "recursive filesystem deletion" to "direct filesystem deletion"; delete the old post-removals prune step (verify: prune appears exactly once, before removals; recheck list matches spec; no "recursive" wording remains)
- [ ] 1.4 `skills/cleanup-merged-issues/SKILL.md` Finish and resume: recognize completed effects (pruning and removals) after interruption (verify: the interruption sentence covers pruning)

## 2. Verification

- [ ] 2.1 `openspec validate simplify-worktree-removal --strict` exits 0 (verify: command output reports valid)
- [ ] 2.2 Spec/skill coherence pass: re-read the delta and the edited SKILL.md side by side; confirm each MODIFIED requirement has a mirrored skill section and no skill sentence contradicts the delta (verify: written note in run summary mapping delta requirements to skill sections)
- [ ] 2.3 Repo gates: `npm run check` (biome) and `npm test` — factory-skills gate asserts packaging/frontmatter only and must stay green (verify: both commands exit 0; no test edits made)

## Workflow follow-up

- Archive via `openspec-archive-change` after implementation and verification; the archive procedure syncs the delta into `openspec/specs/merged-issue-cleanup/spec.md` (inverting the "Ignored build output remains" scenario, among the four MODIFIED requirements).
- No PR, merge, or implementation beyond the skill edit is in scope for this change; delivery follows the issue's `openspec` route.
