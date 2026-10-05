# Issue #39: matched old/new live comparison

## Result

| Scope | Old primary score | Revised primary score |
|---|---:|---:|
| Artifact reviews | 15/18 | 18/18 |
| Fixed-report interpretation controls | 5/5 | 5/5 |
| Total | **20/23** | **23/23** |

The revised skill avoided false Critical escalation in **case-02** (unresolved transport architecture), **case-04** (localized empty-result task contradiction), and **case-06** (unresolved deletion eligibility). Both versions detected all **six** supported Critical artifact defects: tenant disclosure, provider incompatibility with the central delivery contract, destructive prefix deletion, MODIFIED-header mismatch, ADDED-only collision, and accidental canonical-spec loss. Both accepted intentional scenario retirement and the safe controls. No revised-skill misses or regressions were observed in this pass.

The stricter grounding-inclusive score is old **18/23**, revised **23/23**. Its additional old failures, cases 01/03, concern treating routine route integration and the explicitly selected bounded query as missing planning decisions. These are disclosed subjective grading judgments, not objective runtime failures. Case-07 also improved from Major/blocker to Minor/non-blocker, but both severities were allowed by that fixture and are scored as passing.

## Method and limitations

- Exact runtime: **pi 1.0.3**, **openai-codex/gpt-6.1-sol**, thinking **medium**; same configuration and provider overrides for both versions.
- Direct native `/skill:openspec-review` invocation; only the pinned old/new skill loaded, no grooming flow, inherited context, unrelated extensions, repair tools, or shared sessions.
- 46 effective fresh sessions; 300-second deadline per process, concurrency at most four, no automatic retries. All completed without runtime failure, input/settings mutations, or observed read-only violations.
- Source baseline: `822ccb4d5612109241dba7e5917d7669cc9449a3`. Candidate is the uncommitted issue-39 skill snapshot. Evaluated skill SHA-256 hashes: old `e292ef41ce06274ed1f02c81eb84ecdfb9212a95a4cead7da078bb3e2bb106a6`, revised `515be7b9254a07371fdfe61e421fcffa4bd0389fd6a595439de31b73cc7104c3`. Settings disabled discovery, cache warming, compaction, retries, analytics and telemetry; tools were limited to read/bash. The provider's context-window override was 1,050,000.
- Inputs were independent materializations of the same catalog. Each reviewer could read only its repository and pinned skill under the prompt policy; grading expectations were not supplied. Tool filtering and dedicated configuration are **not an OS filesystem sandbox**. Traces were inspected for compliance.
- Manual, unblinded assistant grading, subsequently checked by the parent assistant against all 46 final outputs. This is **not independent human adjudication**. One stochastic pass on one model is preliminary evidence, not proof of broad superiority.
- Cases 17–21 interpret fixed reports; they do not exercise the flow's live classifier/assessor. Deterministic flow/native-expansion tests cover plumbing separately.

### Fixture correction

The original case-19 incorrectly modeled repair steering for a Major-only retention choice. It was corrected to a supported Critical prefix-deletion risk whose safe repair requires an owner architecture decision. Both versions were rerun with the corrected matched inputs in fresh sessions. Two superseded outputs were marked invalid and excluded from the scores. An initial operator materialization error launched no reviewer; it was not a model failure or silent model retry.

## Evidence retention

Only this summary is repository-owned. Raw outputs, traces, per-run metadata, detailed grading and skill snapshots remain outside Git in the temporary operator workspace `/tmp/issue39-eval/`; they are not a permanent archive and may be deleted by temporary-directory cleanup. Credentials are not included in the report.

Use the [suite procedure](../../README.md), baseline commit and skill hashes above to reproduce the comparison, storing run artifacts outside the repository.

## Repository gates

Formatting, lint and typechecking passed; all **329** tests passed. Biome reported the existing broken `result` symlink warning. Strict validation of the clarified `openspec-groom` spec passed with only an informational long-requirement notice. Neither warning indicates a new failing gate.
