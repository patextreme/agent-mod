# Proposal

## Why

Headless subagents cannot answer the permission extension's confirmation prompts, and do not inherit the parent's YOLO state. Document an explicit parent-only permission setup using pi-subagents' existing extension exclusion, avoiding a maintained fork or an approval broker.

## What Changes

- Add a subagent configuration guide under the README's Permission Extension section, showing `exclude_extensions: permission` while keeping other extensions enabled.
- Explain how to eject/customize default agent definitions without replacing their prompts, tools, or model settings unintentionally; apply the exclusion to every agent type intended to run without this permission policy.
- Document the trust decision: excluded children bypass this extension's allow/ask/deny rules regardless of parent YOLO, reset, or approval state. The parent remains protected by its existing loaded extension.
- Explain per-type scope, nested/workflow selection, verification, and rollback. This is opt-in configuration, not automatic child detection or a package-wide default.

## Capabilities

### New Capabilities

None. This change documents an existing external configuration feature; it adds no runtime behavior to this package.

### Modified Capabilities

None. `permission-yolo` remains unchanged. This documentation-only change declares `skip_specs: true`; it must not invent a spec delta for upstream behavior.

## Impact

- Implementation target: `README.md`, with a configuration snippet and operator verification steps.
- This repository has no tracked agent definitions or agent deployment mechanism. Actual project/global agent customization is a separate, explicit user rollout step; implementation must not edit ignored `.pi/settings.json`, global user files, or the installed pi-subagents source.
- No changes to permission code/rules, package dependencies, Nix packaging, or pi-subagents. The installed implementation supports `exclude_extensions`; compatibility must be checked for other versions.
- Security impact applies only after the user adopts the configuration: delegated bash is outside this extension's approval and deny policy. Other tool restrictions/extensions and real OS sandboxing remain independent.
