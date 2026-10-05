---
name: acpx-flow
description: Create, modify, and debug acpx flows. Use whenever composing acpx multi-step agent workflows, choosing flow nodes or routing, or troubleshooting flow output parsing, timeouts, sessions, and execution traces.
license: MIT
---

# Compose acpx flows

Use acpx's native flow capabilities rather than recreating a workflow engine inside prompts or callbacks. This skill is a navigation guide, not an API reference: the experimental surface can change, so read the [official flow documentation](https://acpx.sh/flows.html) and the relevant sections below before selecting APIs or editing a flow.

## Find the capability

| Need | Read the official docs |
|------|------------------------|
| Decide whether a reusable flow is appropriate | [When to use flows](https://acpx.sh/flows.html#when-to-use-flows) |
| Declare the graph, connect steps, and route constrained decisions | [Authoring surface](https://acpx.sh/flows.html#authoring-surface) |
| Separate agent reasoning, deterministic actions, pure transformations, decisions, and external pause points | [Node types](https://acpx.sh/flows.html#node-types) |
| Parse structured agent output, including fenced JSON or JSON surrounded by prose | [Parsing JSON output](https://acpx.sh/flows.html#parsing-json-output) |
| Manage step deadlines, cancellation, and runtime-owned shell commands | [Timeouts](https://acpx.sh/flows.html#timeouts) |
| Prepare workspaces and understand ACP session reuse | [Workspace isolation](https://acpx.sh/flows.html#workspace-isolation) |
| Declare required operator permissions | [Permissions](https://acpx.sh/flows.html#permissions) |
| Inspect saved state, outputs, transcripts, and execution progress | [Run persistence](https://acpx.sh/flows.html#run-persistence) and [Replay viewer](https://acpx.sh/flows.html#replay-viewer) |
| Run flows with inputs and agent selection | [Run a flow](https://acpx.sh/flows.html#run-a-flow) |
| Study runnable composition patterns | [Example flows](https://acpx.sh/flows.html#example-flows-in-the-source-tree) |

## Apply the docs

- Map the requested behavior onto documented nodes and edges; let the runtime own orchestration. Check the current docs and linked examples before assuming retries, parallelism, or other composition features exist.
- For structured output, consult the native parsing options before writing a custom extractor or assuming the entire response is raw JSON. Choose the appropriate strictness and validate the parsed result against the downstream contract.
- For long-running verification or repair, consult deadline and cancellation semantics for every affected step, not just the first failing node. Account for the full step lifecycle and check managed command outcomes.
- When debugging, inspect the existing flow and saved run evidence, then read the relevant documentation before changing composition.

If the documentation is unavailable or the installed version differs, state the limitation and verify against available package types or source rather than inventing API behavior. Do not treat this skill as a substitute for the official docs.
