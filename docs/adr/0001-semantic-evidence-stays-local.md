# Semantic evidence stays local

Status: accepted (2026-10-07)

Semantic suites (`tests/semantic/<suite>/`) measure live-model behavior of prompt
contracts — most notably the `openspec-review` skill — by running pinned skill
revisions against fixture repositories and grading the outputs by hand. A run costs
dozens of model sessions, is stochastic (one pass of one model is preliminary
evidence, not proof), and its raw artifacts are kept out of the repository by
policy (credentials, runtime privacy, size).

We decided that semantic suites run manually at skill-change decision points and
never as quality gates, and that **all run evidence — raw outputs and result
summaries — stays in the operator workspace, outside version control.** The
repository retains only the fixtures, the grading rubric, the materializer, and
the documented procedure in each suite README. Outcomes may be claimed in prose
(for example, in an OpenSpec change's tasks) without committing the evidence. The
one previously tracked result (2026-10-05) was removed from HEAD under this
policy and remains recoverable in git history.

Considered alternatives:

- Committing pinned-evidence summaries (baseline commit, skill hashes, fixture
  manifest hashes, runtime, grading method) so every run stays auditable.
- Wiring semantic suites into CI as slow, opt-in checks.

Consequences:

- The audit trail is deliberately not durable. A recorded score is only as
  trustworthy as the prose claim plus the hashes in the operator workspace, and
  past comparisons are recoverable only through git history.
- Do not re-propose committing semantic results or running semantic suites in
  CI. If durable evidence ever becomes necessary, revisit this decision whole —
  do not erode it with per-suite exceptions.
