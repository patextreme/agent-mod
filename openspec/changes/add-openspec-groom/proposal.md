# Proposal

## Why

Preparing an OpenSpec change currently requires manually reviewing findings, deciding which revisions are safe, and carrying human decisions into the artifacts. A bounded grooming workflow can automate Critical-finding repairs while making judgment calls explicit and leaving implementation untouched.

## What Changes

- Add a reusable human-escalation bridge in a local `pi-meta-workflow` extension, without modifying pi-subagents. It presents intelligible problem context, choices and free-text answers, serializes concurrent requests, confirms human aborts, and cleans up cancelled requests.
- Add a saved `openspec-groom` pi-subagents workflow accepting `changeId` and an optional repair-round limit, defaulting to five. Users launch it by asking their agent to call the existing workflow tool.
- Review with the existing `openspec-review` skill, returning schema-validated findings with IDs and artifact locations. Only severity `Critical` gates grooming; a `Blocker` category or designation alone does not.
- Evaluate each entire Critical batch, repair autonomously only from unambiguous recorded decisions or verified facts, and obtain all required human decisions before applying that batch's artifact revisions.
- Stop successfully after a valid review contains no Critical findings. Stop unresolved on exhausted repair rounds, a confirmed human abort, missing structured results, or operational failure; report partial edits without silently retrying them.
- Keep bridge decisions in memory, while accepting ordinary Pi/pi-subagents traces. Decisions survive through the artifact revisions they authorize, not a separate decision store.
- Supply repository-local workflow/agent resources, extension packaging, automated contract tests, interactive terminal tests, and operator documentation.

Out of scope: `/meta-workflow run` or any replacement launcher/orchestrator; changes to pi-subagents upstream or the installed fork; RPC escalation; implementation of the selected change; main-spec synchronization, archiving, commits, and automatic rollback; repairing non-Critical findings; a persistent decision database.

## Capabilities

### New Capabilities

- `meta-workflow-human-escalation`: A reusable interactive bridge that conveys contextual human decisions from queued requests to UI-less workflow children, including cancellation and provenance.
- `openspec-groom`: Critical-only, whole-batch artifact grooming with structured review/evaluation, constrained autonomous repairs, human decisions, bounded rounds, and explicit outcomes.

### Modified Capabilities

None. The current `permission-yolo` capability is unchanged; retired AgentFlow capabilities are not revived.

## Impact

- Add `extensions/meta-workflow/` and a `pi-meta-workflow` Nix package/check, with a scoped OpenSpec artifact adapter supporting the grooming workflow's write boundary.
- Add `.pi/workflows/openspec-groom.js` and `.pi/agents/openspec-groom-*.md` for initial execution from this repository's root. These are pi-subagents resources, not a new unsupported `pi.workflows` package field.
- Reuse `skills/openspec-review/SKILL.md`; adapt its presentation to structured output inside the workflow without changing its standalone Markdown contract or Critical/Major/Minor semantics.
- Update `package.json` test wiring, `nix/modules/pi-package.nix`, `README.md`, and `AGENTS.md`. Keep the existing package resource declarations unless verified compatibility work requires an explicit change.
- Require the existing pi-subagents workflow/schema APIs and interactive Pi extension UI. The installed Arteiimis fork at commit `dd12bee7726bc82bd7de87f31ea21042efddce8b` and Pi 1.0.0 provide the tested baseline; compatibility with the repository's declared Pi `^0.99.1` must be verified before release rather than assumed.
- The throwaway probe in `.work/groom-bridge-prototype/README.md` demonstrated a real child-to-parent answer round trip, Esc dismissal, and synthetic broker cancellation. FIFO concurrency and actual upstream stop propagation still require implementation tests.
