# OpenSpec review semantic fixtures (issue #39)

Repository-owned, bounded inputs for a **manual old/new skill comparison**. These are
not unit tests, groom runs, model mocks, or automatically graded keyword checks.

This suite is manual and is never a gate. Runs and their evidence live in the
operator workspace and are never committed: the repository retains only inputs,
grading criteria, fixture tooling and this procedure, and a completed run leaves
no newly tracked files.
[ADR-0001, semantic evidence stays local](../../../docs/adr/0001-semantic-evidence-stays-local.md),
is the decision of record.

- `cases.json`: reviewer inputs only; 23 cases (18 artifact reviews, 5 fixed-output
  interpretation probes), four small domain bases plus one inherited base.
- `expectations.json`: human grading criteria and paired-case map. **Never give this
  file, this README, or the suite manifest to the reviewer.**
- `materialize.mjs`: dependency-free Node script; creates independent, committed Git
  fixture repositories in a new temporary tree. No model calls or test execution.

Each repository contains one active `spec-driven` change, proposal/design/tasks,
metadata, delta specs, current specs and a few relevant source/doc files. Source is
existing evidence, not the proposed implementation. Tasks are intentionally open.
Cases are neutral numbered IDs: no issue labels, expected severities or grading
rubrics are copied into planning artifacts. The report probes contain the supplied
review/assessment under inspection, **not** the grading answer.

## Prepare and inspect (operator only)

Requires Node 22+ and Git. No dependency installation is needed.

```bash
FIXTURES="$(pwd)/tests/semantic/openspec-review"
node "$FIXTURES/materialize.mjs" --check
node "$FIXTURES/materialize.mjs" --list
node "$FIXTURES/materialize.mjs"  # stdout: absolute paths in a fresh OS temp tree
# Optional: select a pair, or choose a NEW output path (existing paths are rejected).
node "$FIXTURES/materialize.mjs" --out /tmp/my-new-review-fixtures \
  --case case-01 --case case-02
```

The hard budgets are 18–24 catalog cases, at most 16 input files and 24 KiB of
unsubstituted input content per case. `--check` checks these bounds, safe paths,
required planning files, inheritance and one-to-one separate expectation entries;
it does **not** assert reviewer semantics or run OpenSpec validation. Git metadata,
the external prompt and absolute-path expansion in assessment inputs are not part
of the content budget. No executable test suite is supplied to reviewers.

Output layout:

```text
TEMP/
  inputs/case-01/repo/          # reviewer cwd: just the miniature repository
  inputs/case-01/prompt.txt     # neutral request; operator passes it to pi
  inputs/…
  grader/expectations.json      # only the human grader may read
  grader/manifest.json          # input/template/prompt/script hashes, not a prompt
```

The materializer prints paths, not expected outcomes. It initializes a clean Git
snapshot without global Git config/templates/hooks. Delete temporary trees when
finished; never materialize fixtures into the project working tree.

## Pin the skills and runtime (operator only)

Use **one pinned pi executable, exact provider/model ID, thinking level, settings,
OpenSpec installation and environment** for both versions. Do not use fuzzy model
aliases, automatic model selection, `--continue`, `--resume`, `--fork`, prior
sessions, or a groom entrypoint. Keep credentials outside the result archive.

From the real repository, replace the two revision placeholders with full commit
IDs containing the old and candidate skills:

```bash
WORK="$(mktemp -d /tmp/ospx-review-eval.XXXXXX)"
OLD_REV='<full old commit id>'
NEW_REV='<full candidate commit id>'
mkdir -p "$WORK/pins/old" "$WORK/pins/new" "$WORK/records"
git archive "$OLD_REV" skills/openspec-review | tar -x -C "$WORK/pins/old"
git archive "$NEW_REV" skills/openspec-review | tar -x -C "$WORK/pins/new"
OLD_SKILL="$WORK/pins/old/skills/openspec-review/SKILL.md"
NEW_SKILL="$WORK/pins/new/skills/openspec-review/SKILL.md"
sha256sum "$OLD_SKILL" "$NEW_SKILL" > "$WORK/records/skill-hashes.txt"
printf '%s\n%s\n' "$OLD_REV" "$NEW_REV" > "$WORK/records/revisions.txt"
node "$FIXTURES/materialize.mjs" --out "$WORK/old" > "$WORK/records/old-locations.json"
node "$FIXTURES/materialize.mjs" --out "$WORK/new" > "$WORK/records/new-locations.json"
```

For an uncommitted candidate, copy **the whole** `skills/openspec-review/` directory
into the new pin location instead of `git archive`; record the base commit, source
Git diff, snapshot hashes and that it was uncommitted. Do not load the mutable
working-tree skill. If either skill uses supporting files, preserve them too and
record their hashes (e.g. `find "$WORK/pins" -type f -exec sha256sum {} +`). Do not
modify skill content between runs. Both snapshots must retain the skill name
`openspec-review` for the direct command below.

Create one dedicated config directory and explicit settings shared by both runs:

```bash
mkdir "$WORK/agent"
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({
  packages: [], extensions: [], skills: [], prompts: [], themes: [],
  cacheWarming: "off", compaction: {enabled: false}, retry: {enabled: false},
  enableAnalytics: false, enableInstallTelemetry: false
}, null, 2) + "\n")' "$WORK/agent/settings.json"
cp "$WORK/agent/settings.json" "$WORK/records/settings.json"
export PI_CODING_AGENT_DIR="$WORK/agent"
PI_BIN="$(command -v pi)"
PROVIDER='<exact provider id>'
MODEL='<exact model id>'
THINKING=high
"$PI_BIN" --version > "$WORK/records/pi-version.txt"
"$PI_BIN" --help > "$WORK/records/pi-help.txt"
sha256sum "$PI_BIN" > "$WORK/records/pi-executable-hash.txt"
printf '%s\n' "$PI_BIN" "$PROVIDER" "$MODEL" "$THINKING" > "$WORK/records/runtime.txt"
```

Supply auth via the usual provider environment variable, or securely copy the
existing `auth.json` into `$WORK/agent` for OAuth. Never archive credentials or all
of `env`. Custom providers may require a controlled `models.json`; record its
non-secret settings/hash and use the identical file throughout. Record relevant
non-secret environment overrides (`PI_*`, proxy/cache/model settings), Node/Git
versions, and the resolved OpenSpec executable/version or its absence. The same
OpenSpec availability is essential: both versions must use the same status output
or the same direct-file fallback. Snapshot the actual pi package/version or Nix
store path as well if `PI_BIN` is just a launcher. Record timestamps, time budget
and any provider/runtime failures. Do not silently retry failed runs as successes.

## Direct fresh-session run

This procedure was checked against `pi --help` and pi 1.0.3 CLI/skills docs:
`--no-skills` suppresses discovery but permits an explicit `--skill`, and
`/skill:openspec-review` forces native skill expansion rather than relying on
model-triggered discovery. Re-check these switches for your pinned pi version.

For each case, invoke the old/new pinned skill directly in **separate fresh pi
processes and new session directories**. Use the same request and settings. Repeat
this block for every case; alternate which version runs first or record a fixed
counterbalanced order. The example below uses `case-01`:

```bash
CASE=case-01
for VARIANT in old new; do
  REPO="$WORK/$VARIANT/inputs/$CASE/repo"
  PROMPT="$WORK/$VARIANT/inputs/$CASE/prompt.txt"
  SKILL="$OLD_SKILL"
  if [ "$VARIANT" = new ]; then SKILL="$NEW_SKILL"; fi
  RECORD="$WORK/records/$CASE/$VARIANT"
  mkdir -p "$RECORD/sessions"
  REQUEST="/skill:openspec-review $(< "$PROMPT")"
  printf '%s\n' "$REQUEST" > "$RECORD/request.txt"
  git -C "$REPO" rev-parse HEAD > "$RECORD/input-commit.txt"
  cp "$WORK/agent/settings.json" "$RECORD/settings-before.json"
  ARGS=(--provider "$PROVIDER" --model "$MODEL" --thinking "$THINKING"
    --offline --no-extensions --no-skills --skill "$SKILL"
    --no-prompt-templates --no-themes --no-context-files --no-approve
    --tools read,bash --session-dir "$RECORD/sessions" --print --mode json)
  printf '%q ' "$PI_BIN" "${ARGS[@]}" "$REQUEST" > "$RECORD/command.txt"
  printf '\n' >> "$RECORD/command.txt"
  set +e
  (cd "$REPO" && timeout 300s "$PI_BIN" "${ARGS[@]}" "$REQUEST") \
    > "$RECORD/events.jsonl" 2> "$RECORD/stderr.txt"
  STATUS=$?
  set -e
  printf '%s\n' "$STATUS" > "$RECORD/exit-status.txt"
  git -C "$REPO" status --porcelain --untracked-files=all > "$RECORD/mutations.txt"
  cp "$WORK/agent/settings.json" "$RECORD/settings-after.json"
done
```

The shell file copies, redirects, Git snapshots and timeout are **operator** work
outside pi, not actions authorized to the reviewer. `--tools read,bash` removes
edit/write/custom tools, but **bash is not a filesystem security sandbox**. The
request prohibits writes, executable tests, package installation, network access,
other agents and groom; manually inspect the event/session tool calls for violations.
For hard isolation, run each process in the same OS sandbox exposing only its own
repository, pinned skill, necessary CLI/runtime and private session directory;
exclude the grading directory and source catalog. Do not claim tool filtering alone
enforces read-only filesystem access. The no-context/resource-discovery switches
prevent inherited project instructions or unrelated skills from contaminating runs.

JSON output preserves the raw tool trace and final review. **Exit 0 is not semantic
success** (or even necessarily a successful assistant response in JSON mode).
Inspect `message_end` stop reasons, timeout status and whether the last assistant
response is complete. Preserve all raw output; optionally extract the last assistant
text into a convenient grading file, without launching another model session:

```bash
node --input-type=module - "$RECORD/events.jsonl" "$RECORD/review.txt" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const events = readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const messages = events.filter(e => e.type === 'message_end' && e.message?.role === 'assistant');
const last = messages.at(-1)?.message;
if (!last || ['error', 'aborted'].includes(last.stopReason)) throw new Error('Incomplete/failed assistant output');
const text = last.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
if (!text.trim()) throw new Error('No final review text');
writeFileSync(process.argv[3], text + '\n');
JS
```

Apply extraction separately to each recorded run. Keep the session JSONL and full
stream even if extraction fails. Compare input `templateSha256` and prompt hashes
in the two manifests before grading; actual file hashes vary only where a supplied
assessment contains the fixture root's absolute paths. Check `mutations.txt` is
empty and settings unchanged. Re-materialize inputs for any rerun; use fresh session
and record directories. Never continue the previous reviewer conversation.

## Human grading and evidence record

Only after the outputs are frozen, read `expectations.json`. Prefer anonymized A/B
outputs before revealing which skill was used. Judge the **substance and evidence**,
not exact finding titles, number of findings, a READY/NEEDS REVISION label, blocker
count or presence of particular keywords.

The paired map covers discoverability, implicit task coverage, ambiguity materiality,
local versus central contradictions, unknown versus supported incompatibility,
Major decisions versus Critical safety defects, archive application, intentional
versus accidental scenario loss, and review/assessment conclusiveness.

For each case/version, record outside reviewer inputs:

- Mandatory distinction detected? Cite a quote and the relevant artifact evidence.
- Actual severities/findings; false Critical escalation or missed supported Critical?
- Unsupported claims or unauthorized product/architecture choices?
- Tool/read-only compliance and any input mutation?
- Pass/fail per grading axis; human rationale, grader, date and runtime failures.
- Skill hash, exact settings/model/runtime reference, request/input hashes, output
  file/hash and session/trace location.

A minimal manual record can be JSON with fields `caseId`, `blindVariant`,
`skillSha256`, `settingsSha256`, `model`, `inputTemplateSha256`, `outputSha256`,
`observedOutcome`, `observedSeverities`, `distinctionPass`, `calibrationPass`,
`groundingPass`, `readOnlyPass`, `evidence`, `notes`, `grader` and `gradedAt`.
Add the old/new mapping only after grading. Distinguish runtime/format failures from
semantic misses; do not exclude them without recording the reason. Summarize both
per-case and **paired** results, with regressions as well as improvements. One
stochastic pass is preliminary evidence; matched repetitions can measure variance.

`case-17`–`case-21` are **fixed-output interpretation controls**, not fresh reviews:
they explicitly ask the pinned skill to interpret a supplied review/assessment.
Report them separately from the 18 artifact-review cases. They discriminate a
conclusive report awaiting an owner decision from incomplete review, explicit
inconclusiveness and invalid assessment structure. They neither exercise groom's
classifier/parser nor establish that flow code works. Actual live runs, flow tests
and final human grading are separate work; this fixture suite fabricates no results.
