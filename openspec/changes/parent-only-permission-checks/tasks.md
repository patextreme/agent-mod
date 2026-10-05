# Tasks

## 1. Document explicit parent-only configuration

- [x] 1.1 Add a "Subagent permissions" subsection to `README.md` under Permission Extension with the `exclude_extensions: permission` frontmatter fragment, preserving existing allowlists/exclusions and other extensions; verify syntax and canonical-name matching against the installed pi-subagents documentation/parser, recording the supported version in the guidance.
- [x] 1.2 Document ejecting built-ins, project/global agent locations and precedence, preserving prompts/tools/models, and applying the exclusion to each selected nested/workflow/fallback type; verify the instructions against pi-subagents discovery behavior and confirm they do not imply a global setting or automatically deployed repo configuration.
- [x] 1.3 Add an adjacent security warning and rollback instructions covering deny/ask bypass independent of parent YOLO/reset, continued parent checks, independent other-extension vetoes, absence of OS sandboxing, and fresh child sessions after changes; verify all claims against the existing permission hooks and external extension-selection behavior without editing production code or user configuration.
- [x] 1.4 Document an operator smoke test using a harmless unmatched `printf` command in a disposable workspace with parent YOLO off and `PI_SANDBOX` unset/false, plus effective-config/unmatched-name checks; verify the command matches no permission rule and that the procedure distinguishes parent prompting from excluded child execution without requiring destructive commands.

## 2. Validate the documentation-only change

- [x] 2.1 Run the repository quality gates in order (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`), inspect formatting changes, and verify the implementation diff contains only intended README changes alongside planning artifacts; confirm no global/ignored agent files, permission code, dependencies, Nix files, or spec deltas were changed.
- [x] 2.2 Run `openspec validate parent-only-permission-checks --strict` and review the final README against proposal/design; verify documentation consistently describes opt-in per-type configuration, not automatic inheritance or universal enforcement. Manual adoption of the configuration remains a separate user rollout, not a task that silently modifies machine-wide state.
