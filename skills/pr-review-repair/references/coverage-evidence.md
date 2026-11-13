# Coverage evidence interface

Use this interface for each independent axis and for the narrow verifier, including interrupted-stage recovery. It evaluates declared evidence consistency, not model attention or comprehension. A complete saved result can support exposure; exposure is not semantic completion. Neither a green evaluator nor a historical report replaces independent substantive review or required passing checks.

## Persist and evaluate

1. Read `completeClipped` and `matchingReuse` in [the offline fixtures](./coverage-fixtures.json) as input-shape examples. Replace all synthetic refs, IDs, fingerprints, and accounts with current-stage evidence; a fixture run is not review evidence.
2. The supervisor supplies the required coverage manifest and current pins. The delegate returns its report and `coverage.json`, with original evidence references and a concise `handoff`. Use a separate stage directory for each axis/verifier. Preserve original results, the record, and the report across compaction; group coherent sources/impact surfaces rather than logging every read operation or historical version.
3. The supervisor checks that the returned manifest still includes every required item, that additions have an identifiable basis, and that semantic accounts address the actual code and applicable sources. Resolve unexplained omissions or scope changes before acceptance. Confirm evidence references against saved originals, not only delegate summaries.
4. Set `COVERAGE_EVALUATOR` to the absolute installed path of [coverage-evidence.mjs](./coverage-evidence.mjs), and `STAGE_DIR` to that delegate's persisted stage directory. Run:

   ```bash
   node "$COVERAGE_EVALUATOR" "$STAGE_DIR/coverage.json" > "$STAGE_DIR/coverage-evaluation.json"
   ```

   Exit 0 means the declarations have no coverage/reuse gap. Exit 1 means incomplete evidence: preserve `gaps` and perform their targeted `action`, then update the record and rerun. Exit 2 means invalid input or unavailable evidence: repair the record/access problem, never infer success. Retain the exit status as well as the JSON; do not let redirection or a shell pipeline hide failure.
5. Accept coverage only with exit 0 **and** a substantive complete report supported by actual sources/code/checks. Carry both JSON files and the report into the stage handoff. The report's skipped coverage, uncertainties, and unresolved investigations remain visible limitations; unresolved required coverage follows the control flow's incomplete-evidence escalation, never a clean pass. Findings still go to judgment; this evaluator makes no finding, repair, check-pass, lifecycle, or finish decision.

API alternative: import `evaluateCoverage(record)` from `coverage-evidence.mjs`. It returns `{ coverageComplete, exposed, gaps, reuse }` or throws `TypeError` for malformed structure. Persist that result and apply the same acceptance rules as the CLI.

## Record fields

- `stage`: `review` or `verify`. A review record names one `axis`: `Standards` or `Spec`. Keep their reports and evidence independent.
- `pin`: `head`, and for review `mergeBase`; real resolved SHAs, not moving branch names. All coverage is for these current pins and revalidated current sources. The evaluator compares declarations; the supervisor verifies git state and source freshness separately.
- `coverage`: unique-ID manifest rows. `kind` is `diff`, `spec`, `standards`, `impact`, `recorded-id`, or `history`. Review requires a `diff` row for the **whole** pinned diff, never a sample. Verification requires `recorded-id` rows for every supplied ID (open and resolved), required sources, and fix impact; it rejects full-diff discovery. The supervisor matches these rows to the complete recorded-ID set.
- Only `history` is optional by default. `required: true` promotes a historical source; `required: false` cannot demote current spec/standards/impact. Every required non-diff row carries `basis: { kind, detail }`: `kind` is `requirement`, `instruction`, or `impact`; `detail` identifies the requirement/instruction or concrete caller/contract and why inspection is needed. An inventory count is not a rationale. The evaluator checks presence, the supervisor checks substance.
- Each required row's `evidence` separates `requested` (boolean read request), `original` (saved original result status: `complete`, `truncated`, `missing`, or `unknown`), `ref` (original result path/tool-result reference), `delivered` (boolean: the reviewer actually received that required material), and `summaryClipped` (boolean: only the later summary lost detail). Missing fields remain gaps. Complete output stored on disk without delivery to this reviewer is not exposure. If a tool saved its full output but delivered only a shortened portion, record that distinction; mark `delivered` true for the full material only after the reviewer reads the saved remainder. Aggregate chunked reads only after all required ranges were delivered.
- `handoff`: matching `head` and review `mergeBase`, `coverage` rows `{ id, complete, account }`, and `investigations` (an explicit array, empty only when resolved). `account` concisely states the semantic inspection performed: requirement-to-code reasoning, checked behaviors/callers, conclusions and limits, not just a read command or completion assertion. Missing/incomplete accounts remain gaps even with complete exposure. This is a concise reviewer handoff, not per-line read certification.
- `reuse`: requested preparation/check reuse rows `{ id, kind, head, inputs, currentInputs }`; `kind` is `preparation` or `check`. Check rows also retain `command` and actual `result`. Each input object has nonempty `source`, `configuration`, `dependencies`, and `environment` fingerprints for that evidence's relevant inputs. Gather `currentInputs` independently at the boundary. Include source discovery/set changes, added/removed sources, and pinned refs in preparation fingerprints; justify any not-applicable input. Keep the original SHA and acceptance rationale in the accompanying report. Unknown fingerprints cannot match. Verifier check reuse additionally requires the same unchanged head. `reusable` means matching evidence, **not** that the check passed; preserve failures, unavailable results, and required check gates.

## Targeted recovery

The evaluator ignores `summaryClipped` when deciding supported exposure. Recover from saved originals and the concise handoff first:

| Evidence state | Recovery |
| --- | --- |
| Complete delivered original, matching substantive handoff, shortened summary | Retain supported exposure and completed inspection; no summary-driven reread. |
| Original genuinely truncated | `recover-missing-material`: inspect the saved full output or fetch only missing source ranges; complete semantic work on that material. |
| Read only requested, result missing/unknown, or full saved output not delivered | `read-original-or-source`: deliver the actual required material, using preserved originals where available. |
| Complete exposure but inspection unfinished or handoff insufficient | `finish-semantic-inspection`: continue the missing analysis; reconstruct unsupported conclusions, not a wholesale reread solely for summary clipping. |
| Changed pin/handoff or reuse inputs | `reconcile-current-scope`, `refresh-preparation`, or `rerun-check`: revalidate affected evidence before accepting it. |
| Open investigations | `resolve-investigations`: finish them or report incomplete coverage and escalate. |

Offline gate tests exercise these declared-state distinctions and the procedure/distribution pointers. They do not establish historical provider delivery, attention, or live reviewer comprehension. There is no universal clipping length or provider-version rule here.
