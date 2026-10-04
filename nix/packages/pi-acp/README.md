# pi-acp (patched)

[pi-acp](https://github.com/svkozak/pi-acp) is an ACP adapter for the Pi
coding agent. This package was ported from Ptah's cached Nix source, preserving
upstream v0.0.34, its source and dependency hashes, and `mcp-config.patch`.

It is exposed as `packages.x86_64-linux.pi-acp`, with the same derivation under
`checks.x86_64-linux.pi-acp`. The build runs upstream and carried patch tests
using a fake Pi; no real Pi installation, credentials, or model calls are needed.
No app output or development-shell entry is added.

`nix-tests.patch` changes tests only: generated launchers use `process.execPath`
instead of `/usr/bin/env`, and MCP component tests wait for deferred startup
command discovery before disposing Pi. This makes the full suite work in the
Nix sandbox without changing Ptah's runtime patch.

```bash
nix build .#pi-acp
./result/bin/pi-acp
```

Pi is not bundled. Install it separately and make `pi` available on `PATH`, or
set `PI_ACP_PI_COMMAND` to its executable. The adapter communicates over stdio;
configure your ACP client to launch `pi-acp`.

## Why the patch

Upstream pi-acp accepts ACP `session/new { mcpServers }` but never wires the
servers into pi. ptah uses MCP servers to expose its typed-results channel
(`ptah_result_submit`), so without the wiring every `resultSchema` script
silently degrades: turns complete with `result = nil`.

`mcp-config.patch` (beside this file) closes the gap. It probes the target pi
once (`pi --help`, cached per pi-acp process) and picks the delivery:

1. **Built-in MCP — pi ≥ 0.99 (current default).** pi-acp writes the stdio
   servers to a per-session temp config (mode 0600) and generates a tiny
   extension into the same directory. It spawns pi with
   `-e <extension>` and `PI_ACP_MCP_CONFIG=<config>`; the extension calls
   `pi.registerMcpServer(name, { …, exposure: 'direct' })`, so
   `ptah_result_submit` is declared to the model as a direct tool. No
   third-party extension is required.
2. **pi-mcp-adapter installed** (`pi --help` shows `--mcp-config`). The
   extension owns `/mcp` and replaces pi's built-in MCP, so its legacy
   delivery wins: pi-acp passes `--mcp-config <file>` with
   `directTools: true` entries.
3. **Neither.** The servers are dropped with a startup warning — ptah's
   documented degradation path (`result = nil`). Non-stdio (http/sse) servers
   are always warned about and dropped.

Either delivery writes into its own `mkdtemp()` directory; the config and the
generated extension are removed when the pi process is disposed. The extension
is written as source text at runtime (not a build asset), so the carried patch
stays self-contained and behaves identically from source and from bundled
`dist`.

Upstreaming is out of scope by decision, so the source is pinned to one exact
rev (`b0581c9`, v0.0.34) in `default.nix`.

## Bumping the pinned rev

Bumping the rev requires rebasing the patch by hand. The workflow:

1. Clone/refresh the upstream source at the new rev into the gitignored
   `.work/pi-acp` scratch dir.
2. Check out the pinned rev, apply `mcp-config.patch` (`git apply`), commit it,
   then `git rebase` onto the new rev; resolve conflicts. Apply or rebase
   `nix-tests.patch` separately and run the full suite there (`npm test`).
3. Export the updated patch with `git diff` over the touched files and replace
   `mcp-config.patch` with it. Regenerate it as `git diff <pinned-rev>` from
   the clone's working tree.
4. Update `rev`/`hash`/`npmDepsHash` in `default.nix` (hashes from the failed
   build's error messages) and bump `version`.

Watch for new RPCs the rebased upstream issues during `session/new`: the
patch's `test/helpers/fake-pi.mjs` must answer them, or the component tests
fail. The 0.0.34 rebase added a `get_available_thinking_levels` response for
exactly this reason. 0.0.34 also requires pi v0.81.0+ (model-specific thinking
levels); the native MCP path additionally requires pi v0.99.0+.

The patch's tests drive the capability probe through the fake pi's
`FAKE_PI_HELP_HAS_MCP_CONFIG` (adapter) and `FAKE_PI_HELP_HAS_NATIVE_MCP`
(native) switches; keep both in sync with whatever the current pi advertises.

Validate the rebuild with `nix build .#pi-acp` and `nix flake check`. For a
manual integration check, configure an ACP client to launch the built executable
with a separately installed Pi ≥ 0.99 and an ACP stdio MCP server. Its tools
should be available without `pi-mcp-adapter` installed.
