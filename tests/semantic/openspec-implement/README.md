# OpenSpec implementation semantic fixtures

Manual, bounded scheduling/review/continuity probes for `orc-openspec-implement`.
Cases 01–04 exercise compatible lower-risk batching, high-risk prerequisite release,
unknown risk, and green checks missing a semantic admission defect. Cases 05–14
exercise context fallback/thresholds, storage admission, safe/interrupted writer
handoff, unchanged-scope reuse, and dirty/config/untracked/deleted-source invalidation.
Cases 15–21 exercise bounded/expanded repair scope, missing reproduction,
final technical defects, resumed all-done, separate delivery authorization and
recurring no-progress findings. These are not workflow mocks or an orchestration runtime. They test a model's source-grounded
plan/next-action decisions; they do **not** prove live worker dispatch, writer
exclusion, or independent acceptance. Report proposed steps separately from
actions actually observed.

This suite never runs as a quality gate. Under
[ADR 0001](../../../docs/adr/0001-semantic-evidence-stays-local.md), all generated
inputs, transcripts, grades and result summaries stay in an operator workspace
outside version control. Only fixture inputs, materializer, rubric and procedure
are tracked. Do not add evidence to planning artifacts or commits.

## Materialize (operator only)

Requires Node 22+ and Git, not npm dependencies or model access.

```bash
node tests/semantic/openspec-implement/materialize.mjs --check
node tests/semantic/openspec-implement/materialize.mjs --list
node tests/semantic/openspec-implement/materialize.mjs
# Optional NEW directory with an existing parent, never an earlier run:
node tests/semantic/openspec-implement/materialize.mjs --out /tmp/new-implement-fixtures
# Select one case or a contrast pair:
node tests/semantic/openspec-implement/materialize.mjs --case case-02 --case case-03
```

Default output is a fresh OS temporary directory. Source-tree output is allowed
only in a demonstrably gitignored location: the materializer checks the physical
parent and Git ignore/tracked state before writing, and rejects existing output
directories. Do not modify ignore policy or force-add evidence to make it fit.
For the approved per-change local evidence root, confirm ignore status and absence
of tracked files again before storing records. An unsafe location requires a new
safe location or a pause. Run project formatting before materializing inputs:
formatters may traverse ignored local fixture trees. After capture, avoid broad
formatting of the workspace and recheck manifest fingerprints before reuse.

Output layout:

```text
LOCAL/
  inputs/case-NN/repo/       # miniature repo: planning/source/check inputs only
  inputs/case-NN/prompt.txt  # neutral read-only request
  grader/expectations.json   # separate operator rubric, withheld from probe agent
  grader/manifest.json       # catalog/script/input/prompt SHA-256 fingerprints
```

Each repository has one local spec-driven change, human task IDs (normally
`1.1`/`2.1`, with extra chunks or previously bookkept IDs in continuity cases),
executable dependency-free Node checks, and neutral supplied evidence where needed. Git is initialized without global config, templates or hooks; no
commit is made. HEAD is intentionally unborn; record file hashes and untracked
state, not an invented base revision. Cases 11–14 seed selected index baselines
with `hash-object`/`update-index` (no commit); actual working bytes differ or are
absent where specified. Use `git show :<path>` and status to compare the baseline
with dirty, new untracked or deleted source. The grader manifest includes index
blob/content hashes. Simulated acceptance and host state are fixture inputs for
proposed decisions, not observed independent review or real host capability proof. Limits: 4–24 cases, 24 files/64 KiB per case.
`--check` validates input shape/bounds/path safety/rubric pairing only, not model
semantics. Materialization runs no models, checks, commits or workflow dispatch.

## Pin and run fresh probes (operator only)

1. Choose one established host with a documented fresh-agent entrypoint and
   read-only delegation. Record host/runtime version, exact provider/model and
   thinking configuration, resolved OpenSpec version, relevant non-secret
   environment/settings, timestamp and finite run budget. Record unavailable
   controls as limitations. Do not infer host telemetry or stop capabilities.
2. Snapshot the **whole** candidate `skills/orc-openspec-implement/` directory to
   the local workspace; record base revision, dirty diff and hashes of SKILL.md
   and every disclosed reference, including `records.md`. Resolve/pin the installed `openspec-apply-change` procedure
   separately and record its hash. Use immutable snapshots throughout the run.
   For an old/new comparison use identical runtime/settings and independently
   materialized inputs; counterbalance variant order and record it.
3. Launch one fresh, read-only `general-purpose` Agent per case using that host's
   documented entrypoint, not a continued session. Give it **only** its fixture
   repository path, pinned skill/reference and installed procedure paths, and
   the request from its `prompt.txt`. Explicitly scope the skill to this read-only
   preparation/release-decision probe, overriding full implementation dispatch.
   Do not give the source catalog, this README, grader directory or expectations.
   The probe may inspect files and execute the supplied local checks/status;
   no packages, writes, network, writers or delivery actions are authorized.
   For a NEW run, the candidate wrapper must enforce generic compatible no-write
   inspection controls without changing the neutral `prompt.txt` or supplying
   case-specific answers. Every shell containing Git or OpenSpec must inherit
   `GIT_OPTIONAL_LOCKS=0` before its first command, including chained commands and
   indirect Git subprocesses. Every shell dispatched by or inside a probe for a NEW
   run must also set the npm-side-effect environment controls before its first
   command, with the same inheritance scope as `GIT_OPTIONAL_LOCKS=0`:
   `npm_config_logs_max=0` (suppresses npm debug logs), `npm_config_cache` pointing
   into the operator workspace outside any fixture (redirects cache/log writes), and
   `npm_config_update_notifier=false` (suppresses the update-notifier marker).
   Fixture `npm test` runs otherwise write npm debug logs and a notifier marker into
   the host cache (`~/.npm/_logs`), violating the whole-host no-write contract;
   loglevel or silent flags do not suppress these writes. Additionally, every direct `git diff` invocation
   must disable automatic index refresh and external diff/textconv execution:
   `git -c diff.autoRefreshIndex=false diff --no-ext-diff --no-textconv ...`.
   `git --no-optional-locks` alone does not disable diff's index refresh. These
   command-scoped controls leave existing repository/global configuration intact;
   they reduce implicit writes but are not a universal no-write guarantee. Keep
   earlier wrappers, requests, captures and grades immutable.
4. Capture the full request, tool transcript, final output, actual commands/exit
   status, pre/post input fingerprints and mutations outside the input repository.
   Before any candidate inspection command and after candidate/subprocess
   termination, record raw pre/post Git metadata inventories (presence/absence,
   path, type, mode and content hashes) and preserve original metadata/index bytes
   separately from interpreted staged/blob state. Include `.git/index` when
   present; do not normalize stat-cache fields or replace raw captures with
   reconstructions. Metadata writes have no exception to the no-write contract.
   For NEW runs, captures must also carry pre/post npm-cache baselines: enumerate
   `~/.npm/_logs` and any configured npm cache directory (paths, sizes, mtimes and
   listings) before the first candidate command and again after candidate/subprocess
   termination, recording any delta as a capture anomaly. The step-3 env suppression
   reduces expected npm writes to verify-none; a clean delta is not proof that no
   write occurred. Verify tool compliance and completion, not merely process exit 0. Tool filtering
   and read-only briefs are not an OS sandbox; use host isolation when available.
   If access to grading answers or source catalog cannot be excluded, disclose
   that limitation rather than claiming a blind test.
5. Stop at the finite assignment. If interrupted, confirm the agent and any
   subprocess have stopped using established host capabilities before another
   writer or bookkeeping action; pause if that proof is unavailable. A probe
   should have no mutating subprocess. Rematerialize inputs for reruns; never
   overwrite an earlier transcript or silently count a runtime failure as a pass.

Do not run the suite via `npm test`, `nix flake check`, CI, or a model call in a
structural gate. Fixture checks (`npm test` inside a miniature repo) are distinct
from this project's gate runner. Repository `npm run test:semantic` still belongs
to the review suite; invoke this materializer directly. Full host workflow
execution, if separately authorized, requires additional observed dispatch/review
evidence; these decision probes must not be relabeled as that execution.

## Independent manual grading

Freeze all outputs before revealing `expectations.json`. Prefer a separate grader
and blinded variants. Grade substance against actual source, not keyword counts,
task headings, or a claimed pass. Per case require all `must` distinctions, absence
of every `mustNot` behavior, grounded scope/check claims, and tool compliance.
Partial/incomplete/runtime failures are not semantic passes.

Record locally: case/variant, input and skill/reference/procedure hashes, runtime
and request references, output/trace hashes, each criterion with quote/source
evidence, scheduling/release/check/grounding/compliance pass or fail, limitations,
grader and timestamp. Report cases 01–03 as scheduling probes, case 04 as
semantic review/release judgment, and cases 05–14 as continuity/invalidation
judgment, and cases 15–21 as repair/final/authorization decision probes, not
live repair, final acceptance, delivery or writer-exclusion runs. In case 08 host exit and
subprocess quiescence are separate simulated facts; case 09 must block every
replacement/repair/correction/bookkeeping writer while either is uncertain.
Cases 10–14 require source-content and assumption comparison, selective evidence
retention/invalidation and quiescent checkbox correction, never HEAD-only reuse. Case 04's idle check is
deliberately green: readiness plus busy cleanup consumes a key before returning
busy, so retry cannot succeed. The reviewer must reject that supplied worker claim,
block its dependent and request technical repair/fresh independent review.

Cases 15–16 form a contrast pair: a local busy-guard repair with a real regression
and unchanged unrelated caption evidence, versus a repair that also normalizes
shared keys used by caller/recovery. Inspect indexed pre-repair and actual working
source. The fresh repair reviewer controls scope: explicitly justify sufficient
targeted coverage in 15, expand to affected boundary/dependents and pause genuine
architecture choices in 16. Case 17 provides an explicit missing provider/restart
reproduction; source-bound investigation and honest limitations replace invented
regression results. Case 21 has recurring findings without edits or new evidence
and must pause rather than redispatch an unchanged brief.

Case 18's all-checked tasks and simulated intermediate acceptance hide a final
busy regression failure. Required `npm test` fails while `npm run test:focused`
remains green. Completion requires technical repair, fresh independent affected
verification, rerun affected final checks and refresh independent integrated
review with scope justification, then current apply status; old integrated
results cannot authorize changed contracts. Case 19 resumes unchanged all-done:
propose no ordinary implementation workers, but require freshly executed final
repository-wide checks and independent integrated semantic review/current apply.
Case 20 rejects inferred delivery permission while preserving a simulated prior
conditional sync/archive approval for a later separately authorized procedure.
No fixture authorizes actual commit/push/sync/archive. Reports distinguish supplied
claims, observed checks/status and proposed independent review; they include exact
coverage/statuses, source/evidence freshness, remaining tasks, blockers and host
limitations. Successful decision probes do not establish live repair or fresh
integrated acceptance of this project's implementation.

A single model pass is preliminary evidence, not operational proof. Materializer
success and structural gates never establish model obedience or runtime safety.

## Revision

2026-10-14 — round-2 grading found npm host-cache side effects: fixture `npm test`
runs wrote npm debug logs and the update-notifier marker into the host cache
(`~/.npm/_logs`), violating the documented whole-host no-write contract. For NEW
runs, this revision adds the npm-side-effect environment controls (step 3) and
pre/post npm-cache baseline captures (step 4). Existing freeze evidence remains governed by the procedure as it stood.
