# Retired tooling

Several pieces this package once shipped are gone as breaking changes with no in-repo replacement:

- **acpx flows** — the five entrypoints `openspec-groom`, `openspec-implement`, `openspec-verify`, `openspec-finalize`, and `openspec-all`, plus the `acpx-flow` authoring skill.
- **OpenSpec workflow skills** — `openspec-review`, `openspec-propose-issue`, `orc-openspec-groom`, `orc-openspec-implement`, `orc-openspec-verify`, `orc-issue-to-pr`, and `cleanup-merged-issues`, together with the OpenSpec specs, change history, and manual semantic suites that supported them.

`pr-review-repair`, documented in the [main README](../README.md), is the surviving skill. [`pi-acp`](../nix/packages/pi-acp/README.md) remains the supported ACP integration.

## Ollama Usage extension

The `pi-ollama-usage` extension is retired as a breaking change: the `ollama: <session>% / <weekly>%` footer slot, the `/ollama-usage-refresh` command, and the flake output are gone. Nothing in the repository replaces it.

It parsed the undocumented `GET /api/balance` endpoint behind the ollama.com dashboard. Keeping that trustworthy requires a live Ollama Cloud account to poll the endpoint against, and the maintainer no longer has one; an unverified poller against an undocumented endpoint is guesswork.

The last revision carrying the extension is `357ca03`. Pin that rev to keep building it:

```bash
nix build github:patextreme/agent-mod/357ca03#pi-ollama-usage
```
