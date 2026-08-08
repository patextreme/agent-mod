# Tasks — AgentFlow Extension

## 1. Scaffolding & dependencies

- [ ] 1.1 Create `extensions/agentflow/` directory with `index.ts` entry exporting the default extension factory function
- [ ] 1.2 Add `jiti` to the package runtime `dependencies` and update `tsconfig.json` to include `extensions/agentflow/**/*.ts`
- [ ] 1.3 Register the extension in the package by ensuring `package.json` `pi.extensions` picks up `./extensions` (verify agentflow subdirectory is discovered)

## 2. Script discovery & loading

- [ ] 2.1 Implement flow-name → file resolution: project `.pi/agentflow/<name>.ts` → `.js`, then global `~/.pi/agentflow/<name>.ts` → `.js`, first match wins
- [ ] 2.2 Implement the `/af:<name>` command registration that resolves the flow name arg to a script file
- [ ] 2.3 Gate project script execution on `ctx.isProjectTrusted()` and report an error when untrusted
- [ ] 2.4 Implement load-time syntax validation (parse `.ts`/`.js` before execution) and abort without spawning agents on syntax error

## 3. `af` runtime & flow-agent lifecycle

- [ ] 3.1 Implement script execution via `AsyncFunction` with a single injected `af` global (`createAgent`, `log`, `result`, `cwd`)
- [ ] 3.2 Implement `af.createAgent(config)` wrapping `createAgentSession` (name, model, tools, systemPrompt, cwd, contextFiles, persist; default inherit from main session; in-memory when persist false)
- [ ] 3.3 Implement the flow-agent handle: `sendPrompt`/`sendSteer`/`sendFollowUp` (each awaiting the sub-session step, resolving with final assistant text), `result`, `sessionFile`, `abort()`, `dispose()`
- [ ] 3.4 Implement `af.log` as Orchestrator progress lines and `af.cwd` as the working directory string

## 4. Result delivery to the main session

- [ ] 4.1 Implement `af.result(value)` recording the flow outcome and, on completion, injecting it as a custom message (`customType: "agentflow"`, `display: true`) into the main session
- [ ] 4.2 Handle the no-result case (notify completion without an injected result)

## 5. Orchestrator UI

- [ ] 5.1 Implement the blocking full-screen Orchestrator via `ctx.ui.custom()` that owns the run and restores the editor on completion
- [ ] 5.2 Implement the live agent overview list (main + flow-agents: name, status, model, elapsed time, current activity) updated from sub-session events
- [ ] 5.3 Implement streamed `af.log` rendering inside the Orchestrator
- [ ] 5.4 Implement tap-in: select an agent and open a live, auto-updating conversation viewer with return-to-list
- [ ] 5.5 Implement steering a running agent from the Orchestrator
- [ ] 5.6 Implement stopping a running agent (with confirmation) via `abort()`
- [ ] 5.7 Implement non-TUI fallback so flow runs execute and deliver results without the interactive Orchestrator

## 6. Type safety & authoring

- [ ] 6.1 Write `agentflow.d.ts` declaring the `af` global, the flow-agent handle, its config, and prompt-step result types
- [ ] 6.2 Ensure `.ts` scripts are type-checked against the declarations before execution (jiti load + `tsc --noEmit` path)
- [ ] 6.3 Write the package skill document (shipped skill) covering the `af` surface, authoring conventions, validation workflow, and a worked example
- [ ] 6.4 Write the starter example flow `reviewcode.ts` demonstrating `af.createAgent`, sequential `sendPrompt`, `af.log`, and `af.result`

## 7. Package wiring & docs

- [ ] 7.1 Update `README.md` extension table and contents list to include the AgentFlow extension
- [ ] 7.2 Run `npm run format`, `npm run lint`, `npm run typecheck` and `npm test`; fix any failures
- [ ] 7.3 Run `nix flake check` (package builds, permission tests, and stale `npmDepsHash` check) and fix any failures