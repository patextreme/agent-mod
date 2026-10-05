# Design

## Context

See proposal.md for motivation and repository boundaries. The installed `@tintinweb/pi-subagents` implementation supports an `exclude_extensions` agent-frontmatter denylist, applied after extension selection. Exclusion prevents the permission extension's session hooks from binding; it is not containment of factory code or an OS sandbox.

No tracked agent definitions exist here. The package and Nix outputs distribute extensions, prompts, and skills, not agent configuration. Therefore this change ships a documented setup, not an enforced default or edits to the user's installed configuration. A design is included because the setup changes the user's security boundary even though package runtime behavior stays unchanged.

## Goals / Non-Goals

**Goals:** Give operators a reversible way to omit only the permission extension in explicitly selected child types, preserving the parent policy and unrelated agent behavior.

**Non-Goals:** Automatic child detection; YOLO inheritance; parent approval routing; a global subagents denylist; agent packaging; fork or upstream changes; tool or process sandboxing.

## Decisions

### 1. Use an existing per-agent exclusion

The README will show a frontmatter fragment to merge into an existing definition:

```yaml
extensions: true
exclude_extensions: permission
```

For a definition with a deliberate extension allowlist, retain that allowlist rather than replacing it with `true`. Merge `permission` into an existing exclusion list rather than overwriting other exclusions. Use the recognized canonical name and check for unmatched-name warnings.

Prefer this targeted exclusion over `extensions: false`, which removes unrelated extension hooks/tools. Do not modify `extensions/permission/index.ts` to guess whether a session is a child.

### 2. Preserve existing agent definitions

Document `/agents` → select agent → Eject for built-ins, then add the exclusion to the exported definition. Explain supported project `.pi/agents/<name>.md` and global agent locations and project override precedence. Do not suggest a minimal same-name override that silently replaces the original prompt/tool/model configuration.

The exclusion is per type. A nested child or workflow agent uses its selected definition; excluding permission from one parent type does not configure every descendant. Verify all types in the intended delegation paths, including fallback types. Future types require an explicit decision.

### 3. Keep the trust boundary explicit

The phrase "parent-only permission checks" describes the configured deployment, not a new guarantee from this package. The parent continues its existing checks because its loaded extensions are unchanged. An excluded child's bash bypasses this extension's ask and deny rules even with parent YOLO off. Parent reset does not restore child checks. Other extensions may still veto execution.

Call out that read-only agent tool menus and worktree isolation do not make arbitrary bash safe, and that delegation approval does not approve individual child commands. Recommend trusted tasks and actual sandboxing where unrestricted execution is unacceptable.

### 4. Verify configuration without hazardous commands

Include operator checks for effective agent configuration and absence of unmatched exclusion warnings. For runtime confirmation, use a disposable directory and a harmless unmatched bash command such as `printf 'permission-scope-check\\n'`, with parent YOLO off and `PI_SANDBOX` unset/false. Confirm that parent bash still prompts while a newly spawned configured child completes without this extension's confirmation/headless block. Do not use git push or destructive deny-rule commands as probes. Inspect results to distinguish this permission policy from unrelated tool failures.

Existing child sessions retain their bound extension set. Roll out and roll back with fresh child sessions, not by assuming a frontmatter edit retrofits a running/resumable child. A clean Pi restart is a simple way to ensure rediscovery for manual verification.

## Risks / Trade-offs

- [Delegated commands bypass deny rules] → Place the warning adjacent to the snippet; require deliberate per-type configuration and trusted delegation.
- [Partial coverage across nested/workflow/fallback types] → Explain selected-type semantics and require an operator inventory rather than claiming a universal exclusion.
- [Unmatched exclusion name or unsupported version] → Verify the installed pi-subagents feature/name and inspect warnings/effective configuration before relying on it.
- [Same-name overrides alter prompts/tools/models] → Eject existing built-ins and preserve all settings and body content.
- [Users mistake documentation for deployed defaults] → Explicitly state that package installation does not create/edit agent definitions.
- [Misleading smoke test under YOLO or sandbox] → Disable parent YOLO and sandbox auto-allow for the harmless unmatched-command test.

## Migration Plan

1. Ship the README guidance; no automatic migration or configuration writes.
2. Operator chooses project/global scope, exports or edits each intended agent definition, and merges the exclusion while retaining existing behavior.
3. Rediscover configuration and spawn fresh children; check warnings and perform the harmless parent/child probe.
4. Roll back by removing only the `permission` exclusion and restarting with fresh children. Children loading this extension then return to its ordinary local/headless policy; they still do not inherit parent YOLO or approvals.
