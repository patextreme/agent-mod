# Design

## Context

See `proposal.md` for motivation and scope. The existing package has permission and usage extensions but no active workflow capability. Its only current main spec is `permission-yolo`; archived AgentFlow capabilities remain retired.

The installed `@tintinweb/pi-subagents` package is the Arteiimis fork at commit `dd12bee7726bc82bd7de87f31ea21042efddce8b`. Its workflow JavaScript runs in a worker/VM, but the host creates child SDK sessions in the parent process. Children independently load extensions and bind without UI. Their extension event buses are separate. Workflow globals expose no human-input API, filesystem access, or module imports.

A throwaway probe, described in `.work/groom-bridge-prototype/README.md`, used a shared process registry to deliver an actual child request to the parent UI. Free-text input, Esc dismissal, and synthetic broker abort all reached validated child output. This proves the transport, not FIFO queuing, confirmed-abort UI, or upstream workflow-stop propagation. The evidence is uncommitted scratch material; the substantive findings are recorded here so implementation does not depend on its continued presence.

The runtime tested was Pi 1.0.0, while this repository declares/types against `^0.99.1`. The implementation must verify that supported APIs work on the declared baseline, or explicitly align dependency and README declarations before release. Do not infer compatibility from typechecking alone.

## Goals / Non-Goals

**Goals:**

- Preserve the installed workflow host, schema handling, progress display, and cancellation model.
- Keep the generic human bridge separate from the OpenSpec-specific artifact adapter.
- Enforce child roles and write scope with tools, and validate cross-record invariants that JSON Schema cannot express.
- Make cancellation and stale approval fail closed without introducing a persistent decision store.
- Make saved resources discoverable from the repository root without hard-coded workstation paths.

**Non-Goals:**

- No launcher command, workflow registry UI, or generic workflow language.
- No RPC dialogs, socket service, cross-process bridge, or upstream fork changes.
- No transaction/rollback guarantee across multiple artifact writes; failures report partial effects.
- No promise that model judgments are correct simply because their shape validates.
- No automatic distribution of saved workflows through an unsupported Pi package resource field.

## Decisions

### 1. Use a session-owned in-process broker

Add `extensions/meta-workflow/index.ts` as the extension entry point, `broker.ts` for queue/lifetime logic, and `human-ui.ts` for rendering. The parent installs a broker on interactive `session_start`, keyed by a dedicated `globalThis[Symbol.for(...)]` registry plus parent session identity and canonical cwd. Child instances register tools but never replace or shut down a parent-owned broker. Resolve a child to the one live interactive broker for its cwd; missing or ambiguous matches are unavailable, not an invitation to guess.

A `MetaWorkflowAskHuman` child tool submits a contextual request and awaits its broker result. The tool creates the request identity and binds it to the child session and execution signal rather than trusting model-supplied provenance. Its request payload includes workflow name, change ID, finding IDs, excerpts/locations, decision question, options/trade-offs, labeled recommendation, and expected artifact effects. The shared object exposes request/cancel operations, not the parent context or arbitrary tool execution.

Alternative: a Unix-domain socket broker. That would introduce authentication, endpoint discovery, and cleanup that the observed in-process children do not require. Separate `pi.events` buses cannot provide this bridge. A local SDK replacement loop would lose the existing workflow integration and is outside scope.

This is an accidental-misrouting/provenance boundary, not isolation against hostile same-process extensions or arbitrary user code.

### 2. Queue dialogs and distinguish human abort from execution cancellation

`broker.ts` owns a FIFO queue and only one displayed request. Every request transitions through queued, displayed, and one terminal state: answered, human-aborted, cancelled, or unavailable. Settle once; ignore stale input after settlement. Removing a cancelled queued request preserves the order of the remaining requests. Human abort terminates that grooming run's pending requests, not another run's requests.

Link the actual child tool abort signal to the queued request and displayed UI. Parent shutdown, reload, or session replacement cancels every request owned by that parent broker. Clean up listeners and UI references idempotently. A forced upstream stop may prevent a workflow final return; cancellation progress and existing mutation receipts then provide the available evidence, rather than promising code can run after worker termination.

Do not add a human-response timer. The prototype's 60-second deadline and synthetic two-second abort are not production behavior.

The UI presents a scrollable problem/context panel, offered choices, and free text. Escape or dialog dismissal enters a separate confirmation, defaulting to Return to question. For grooming, the confirmation states that the current batch has not been applied and previous rounds remain. Dismissing confirmation restores the same unanswered question. Actual child/workflow or parent-lifecycle cancellation bypasses confirmation and closes the request immediately. Empty free text is not an answer.

### 3. Use repository-local saved resources and explicit child loading

Add `.pi/workflows/openspec-groom.js` and four agent definitions:

- `.pi/agents/openspec-groom-reviewer.md`
- `.pi/agents/openspec-groom-evaluator.md`
- `.pi/agents/openspec-groom-human.md`
- `.pi/agents/openspec-groom-fixer.md`

Initial invocation is from this repository's root:

```text
SubagentWorkflow({ name: "openspec-groom", args: { changeId: "<active-change>", maxIterations: 5 } })
```

`maxIterations` can be omitted. There is no `/meta-workflow run` command, typed launch syntax, or model-facing replacement tool.

Agent frontmatter paths such as `extensions: ["./extensions/meta-workflow/index.ts"]` resolve against the child configuration cwd, not the Markdown directory. Keep children out of worktree isolation for this initial repo-local integration. Explicit paths avoid relying on a parent-only CLI extension being inherited or a bare selector automatically loading it. Limit tools explicitly and do not permit fallback to a general-purpose agent when a required definition is missing. Parent bridge availability and the child role/tool sets are preflight/test requirements.

The reviewer reads `skills/openspec-review/SKILL.md` as an ordinary file and follows its full read-only checks. Disable automatic skill injection to avoid named-loader/symlink assumptions. Override only the output presentation with the workflow schema; retain its severity/category semantics, verdict, and structural-validation reminder. Do not globally change the standalone skill's Markdown output.

The evaluator receives the complete Critical batch and relevant review evidence; it has no mutation tools. The human child exposes only the bridge tool. The fixer uses only the scoped artifact adapter plus read tools. No role receives unrestricted bash, execution, builtin write/edit, nesting, or worktree tools. Workflow-provided StructuredOutput remains available independently of the frontmatter tool list.

Pi's package manifest supports extension/prompt/skill resources, not `pi.workflows`. Keep workflow/agent discovery repo-local and document this limitation. Package the extension through the existing `./extensions` declaration and a `pi-meta-workflow` Nix output containing its runtime helper files. Do not claim installing only the extension installs the saved workflow. Cross-repository resource deployment is future work.

### 4. Use structured stage contracts with deterministic coverage checks

The fork requires an object schema root. Put explicit schema literals and deterministic validation in `.pi/workflows/openspec-groom.js`; workflow code cannot import a local helper module. Add stubbed-run tests in `.pi/workflows/openspec-groom.test.ts` to execute the workflow body with controlled `agent`, `phase`, and `log` hooks.

Review result:

- `findings`: records with `id`, `severity`, `category`, `location` (artifact path and section), `issue`, and `recommendation`.
- `summary`: the skill's verdict and explanatory reason, reported but not used as an extra grooming gate.
- `changeContext`: resolved change identity, artifact scope, and content fingerprints from the trusted resolution tool.

Use `Critical | Major | Minor` severity and the skill's existing category set. Do not promote every Blocker to Critical. Require unique review IDs. The artifact adapter verifies that the child echoes its actual resolved context, rather than accepting a model-invented root or fingerprint.

Evaluation result:

- `evaluations`: one record per Critical finding, with `findingId`, `mode` (`autonomous` or `escalate`), proposed artifact repair, supporting evidence, and an optional escalation ID.
- `escalations`: contextual questions with IDs and associated finding IDs. Shared underlying decisions can cover multiple findings without asking the same question repeatedly.

Check exact finding coverage, duplicate/unknown IDs, valid escalation references, and that every escalation-required finding has a question. An autonomous disposition needs cited unambiguous artifact authority or verified factual evidence; unresolved judgment is not authorized by the review recommendation alone. Missing or ambiguous evidence takes the escalation path.

Human result contains answers tied to escalation IDs and broker receipts. The human child calls the bridge for each required question and submits the collected results. Before accepting StructuredOutput, a child tool hook verifies the answers against actual delivered bridge results. Verify exact question coverage in the workflow; any human-aborted/cancelled/unavailable result prevents the pending batch's fixer from starting. Schema validity alone does not establish human approval.

Fix result contains applied/failed status, finding IDs addressed, known changed artifacts, and explanation. Capture actual mutation receipts independently of the model's summary; verify reported paths against those receipts. Semantic correctness remains the next review's job.

The framework validates submissions and can ask for corrections, but a structured `agent()` can still yield null or fail. Stop unresolved; never coalesce null to empty findings. Do not add our own blind fixer retry.

### 5. Apply the whole batch, then review, with precise counting

The workflow is serial across stages: review -> whole-batch evaluation -> all required human answers -> one coherent batch fixer -> fresh review. There is no per-finding repair/review pipeline and no barrier-free application while other decisions are pending. Questions from independent workflows can still queue concurrently through the bridge.

Start `completedRepairRounds` at zero. After each valid review, filter Critical findings. If none exist, return success with residual findings and the skill verdict. Otherwise, if the completed round count equals the limit, return unresolved. Evaluate/ask/fix the entire current batch, increment only after successful batch application, and review again. This permits five repairs and six reviews at the default limit, including success after the fifth repair's review. A failed repair is reported as an attempted partial batch, not a completed round.

The final report includes status, change ID, completed rounds, stop reason, last valid review findings, known changed artifacts, and the separate structural-validation reminder. Zero-Critical success is not a READY verdict and does not clear non-Critical blockers. Progress records identify the current stage and known edits in case external cancellation prevents the final return.

### 6. Enforce artifact writes through a scoped adapter

Add `extensions/meta-workflow/groom-artifacts.ts` as an OpenSpec-specific adapter; keep OpenSpec rules out of the generic broker/UI. Register a read-only `GroomResolveChange` tool that runs only the fixed OpenSpec status operation with argument-vector invocation, resolves `changeRoot`/`artifactPaths`, and checks that the requested active change stays within the local planning root. Use the skill's direct-directory fallback when the CLI is unavailable; a missing change or unsupported external planning root fails explicitly. Do not allow arbitrary shell commands through this tool.

Resolution produces a canonical allowlist for the selected change's proposal, delta specs, design, tasks, and `.openspec.yaml`, including narrowly scoped creation paths for missing planning artifacts. Main specs and other changes can be read but cannot be written. Return a content fingerprint manifest for the artifacts reviewed. The workflow's review output carries that trusted manifest into the fixer.

The fixer exposes `GroomWriteArtifact` and `GroomEditArtifact`, not unrestricted builtin mutations. It must first resolve the same change and expected fingerprint manifest. A manifest mismatch after a long human wait or concurrent run stops unresolved before applying stale plans. Each mutation checks normalized and real paths, existing ancestors for new files, traversal, symlinks, artifact allowlist, and its session-bound scope before writing. Reject deletion/renaming or non-artifact paths; this initial fixer repairs artifact text rather than introducing a general filesystem tool.

Serialize read-check-write operations per canonical change root. Check against the prior manifest plus this fixer's own successful receipts to avoid overwriting another run's intervening edits. Publish receipts for successful writes with target path and before/after fingerprint. Multi-file application is not atomic; if a later tool or child fails, report previous successful writes and stop. Do not roll back or retry automatically.

Alternative: builtin write/edit plus prompt restrictions. Frontmatter tool lists do not constrain paths, and unrestricted bash could bypass hook checks; narrow adapter tools make the intended boundary testable. This does not claim protection against hostile extensions installed by the user.

### 7. Fresh runs rather than replaying grooming approvals

The installed workflow journal can replay a prefix of completed child calls, including human answers and repair summaries. That is unsafe as fresh authorization. The extension's OpenSpec adapter registers a parent `tool_call` guard rejecting `resumeFromRunId` for the named grooming workflow and its resolved saved-script path. Documentation requires new executions after partial failure or cancellation. There is no new launcher; this guard applies to the existing workflow tool.

Each fresh execution reviews current artifacts and gets new bridge receipts when human judgment is still required. Existing unambiguous artifact decisions can support autonomous resolution; old conversational answers cannot. The bridge itself has no decision database. Existing workflow/session journals remain ordinary traces and may contain sensitive answers; document that memory-only state is not a zero-disk guarantee.

## Risks / Trade-offs

- [Upstream cancellation propagation has not been exercised] -> Test actual stop while a dialog is active and while another request is queued; do not substitute the prototype's synthetic abort for this evidence. If the host does not forward cancellation as documented, treat that as a release blocker rather than altering upstream or silently weakening cleanup.
- [Runtime/type version mismatch] -> Load and exercise the extension on the declared supported Pi baseline and Pi 1.0.0. If required APIs are unavailable, explicitly align peer/dev versions, lockfile, README, and Nix hash and run the full dependency-change gates before release.
- [Long context overwhelms native selectors] -> Use a scrollable terminal component and test long excerpts, narrow terminals, free text, return-to-question confirmation, and cancellation with `tu`.
- [An LLM emits valid but incorrect judgments] -> Conservative authority requirements, real bridge provenance, exact coverage checks, constrained writes, and an independent fresh review; do not describe the process as proof of semantic correctness.
- [Artifacts change while a human deliberates] -> Fingerprint checks reject stale repair plans before writes; there is no human deadline or silent rebasing.
- [Partial batch failure] -> Keep receipts, report uncertainty where needed, and stop unresolved; transactions/rollback are not part of this change.
- [Saved files are not Pi package resources] -> Document initial repository-root execution and explicit parent/child extension loading. Do not invent a manifest field or imply automatic workflow deployment.
- [Registry or old UI survives reload/session replacement] -> Ownership checks, abort-linked requests, idempotent cleanup, and stale-answer tests.
- [Workflow traces persist answers] -> Disclose normal tracing, prohibit approval replay, and avoid a separate persistent decision store.

## Migration Plan

1. Add tested extension modules, saved workflow, and narrowly scoped agent definitions without removing existing capabilities or modifying the fork.
2. Add `pi-meta-workflow` runtime packaging and `meta-workflow-test` checks to both Nix output sets; wire all new unit/workflow tests into the explicit npm test command.
3. Document repository-root invocation, required parent extension loading, actual supported Pi/pi-subagents versions, write scope, outcome semantics, cancellation, and journal limitations. Add extension/repo-layout documentation entries.
4. Run format, lint, typecheck, tests, interactive `tu` scenarios, and `nix flake check` for package/Nix edits. Do not release while actual cancellation or supported-version loading remains unverified.
5. Roll back by unloading/removing the new extension and saved resources and removing their packaging/test/documentation entries. Do not automatically undo artifact repairs already made by grooming; inspect and reconcile them as ordinary working-tree changes.
