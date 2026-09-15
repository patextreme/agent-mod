## Why

`agent-mod` ships three extensions that nothing loads and nothing references. `crof` lost its provider when pi moved to `openai-codex` / `zai` / `ollama-cloud` (`crofai` is now configured only in the opencode module); `tps` and `agentflow` are simply no longer used. Carrying them costs a flake output, a `<name>-test` check, test-script paths, `tsconfig` entries, and — for AgentFlow — four spec'd capabilities describing behavior this package does not intend to support.

## What Changes

- **BREAKING** — remove the `pi-crof`, `pi-tps`, and `pi-agentflow` flake outputs, their `packages`/`checks` entries, and the `crof-test` and `agentflow-test` checks.
- **BREAKING** — delete `extensions/crof/`, `extensions/tps/`, and `extensions/agentflow/`, including the tracked `.pi/agentflow/` flow script and its local declarations.
- Retire four capabilities — `agentflow-authoring`, `agentflow-orchestrator-ui`, `agentflow-runtime`, and `agentflow-validation` — with no successor: `/af`, the `af` scripting surface, the bundled authoring skill, and the `agentflow_validate` tool are all withdrawn.
- Drop dependencies left with no importer: `jiti`, `typebox`, `@earendil-works/pi-ai`, and the `@earendil-works/pi-tui` peer dependency.
- Update `package.json`, `tsconfig.json`, `README.md`, and `AGENTS.md` to match the reduced surface, and document the surviving `ollama-usage` extension, which was never documented.
- Codify the extension-removal procedure in `AGENTS.md`, mirroring the existing "every extension must have a flake output" rule.

## Capabilities

### New Capabilities

None — this change removes behavior and introduces no new capability.

### Modified Capabilities

- `agentflow-authoring`: retired — every requirement is removed and the capability's spec is deleted. The shipped `agentflow.d.ts`, the bundled authoring skill, the example flows, and `/af-init` no longer exist.
- `agentflow-orchestrator-ui`: retired — every requirement is removed and the capability's spec is deleted. The full-screen Orchestrator, fleet view, log streaming, and tap-in/steer/stop controls no longer exist.
- `agentflow-runtime`: retired — every requirement is removed and the capability's spec is deleted. Flow discovery, the `af` scripting surface, sub-agent lifecycle, typed result submission, and `af.bash` execution no longer exist.
- `agentflow-validation`: retired — every requirement is removed and the capability's spec is deleted. The `agentflow_validate` tool and `/af-validate` command no longer exist.

## Impact

- **Code**: `extensions/{crof,tps,agentflow}/` deleted; `.pi/agentflow/{review-pr.ts,agentflow.d.ts}` deleted.
- **Packaging**: `nix/modules/pi-package.nix` (three derivations, two checks, the `packages`/`checks` lists, and the AgentFlow-bundled `jiti`/`typebox` copies); `package.json` test script; `package-lock.json` and the `rootNodeModules` `npmDepsHash`, which dependency removal invalidates.
- **Type-checking**: `tsconfig.json` loses the `.pi/agentflow/**/*.ts` include and the `extensions/agentflow/examples/**` exclude.
- **Docs**: `README.md` loses the TPS and AgentFlow rows/sections, gains an `ollama-usage` row/section, and has its capability bullets re-framed; `AGENTS.md` loses the `tps` entry and gains the removal procedure.
- **Consumers**: three flake outputs disappear. Nothing references them — the author's dotfiles mount only `pi-permission`, `pi-ollama-usage`, `pi-prompts`, and `pi-skills`. The author's machine stops loading `crof` at its next home-manager switch.
- **Runtime**: no behavior change for anyone who never mounted these extensions.
