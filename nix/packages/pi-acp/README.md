# pi-acp (patched)

[ACP adapter](https://github.com/svkozak/pi-acp) for the pi coding agent,
maintained by agent-mod as `packages.x86_64-linux.pi-acp` and
`checks.x86_64-linux.pi-acp`. Build with `nix build .#pi-acp` or run with
`nix run .#pi-acp`. Pi must already be available on `PATH` (or selected via
`PI_ACP_PI_COMMAND`); this package does not bundle Pi, install it globally,
or introduce a wrapper or a Ptah flake input.

## Provenance

The original `default.nix`, this README and the **byte-for-byte unchanged**
`mcp-config.patch` came from `patextreme/ptah` revision
`4c7f75e5d513e6a8b152c1d5df3904ef3349b76e`, at
`nix/packages/pi-acp/{default.nix,README.md,mcp-config.patch}`. The derivation
and documentation are adapted here for agent-mod ownership and checks.
Adapter source is fetched directly from `svkozak/pi-acp` v0.0.34, revision
`b0581c9c1d675e634234674484247008b03d69b4`, not vendored. Both original source
and npm dependency hashes are preserved; neither patch changes dependencies.

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

## Metadata-only startup notices

`startup-metadata-only.patch` applies **after** the MCP patch. Upstream stores
startup text on the session and schedules `sendStartupInfoIfPending()` with a
zero-delay timer after `session/new`. A client can immediately submit its first
prompt and start collecting `agent_message_chunk` text before that timer runs.
The banner, update notice and dropped-MCP warnings then prefix the model's
answer, breaking JSON-only consumers.

The second patch removes that session storage/emission path and its timer.
It preserves `session/new`'s `_meta.piAcp.startupInfo` (including quiet-startup
semantics and MCP warnings). Clients that want startup notices must display
that metadata separately; clients ignoring it will no longer see those notices
as assistant messages. MCP delivery, model output and command/usage updates
are otherwise unchanged.

## Checks

`nix flake check` builds the package and runs upstream `npm run typecheck` and
`npm test` in the Node 22 sandbox. The fake Pi supplied by the MCP patch is
reused for deterministic immediate JSON-prompt regressions in both verbose
and quiet-startup modes: version banner/context, update notice, dropped stdio
and non-stdio warnings remain in metadata; collected assistant text equals
only the model's JSON. These regressions run both directly against source and
against built `dist/index.js` over ACP stdio (`PI_ACP_TEST_DIST=dist/index.js`).
They fail on the MCP-only baseline because startup text prefixes the JSON.
The existing native/adapter/drop/cleanup MCP tests remain enabled.

The Nix `postPatch` fixes both the fake Pi's shebang and upstream tests'
**generated** launcher shebangs to the store's Node path. Merely running
`patchShebangs` on fixture files misses the generated `#!/usr/bin/env node`
launchers and causes `ENOENT` in the sandbox. No tests are skipped to work
around this. No real Pi, model credentials or live registry are needed by the
regressions; other upstream version probes are best-effort and may run locally
outside the network-isolated Nix sandbox.

## Bumping the pinned rev

Bumping the rev requires rebasing both patches by hand. The workflow:

1. Clone upstream into a scratch directory outside the tracked repository.
2. Check out the pinned rev, apply `mcp-config.patch` (`git apply`), and commit
   it as a baseline. Apply `startup-metadata-only.patch` and commit separately.
   Rebase those two commits onto the new upstream rev; resolve conflicts.
3. Export the MCP diff relative to upstream and the startup diff relative to
   the MCP baseline separately. Do not fold the startup patch into the copied
   MCP patch. Run `npm ci`, `npm run typecheck`, `npm run build`, then
   `PI_ACP_TEST_DIST=dist/index.js npm test` in the scratch clone.
4. Update `rev`/`hash`/`version` in `default.nix`; change `npmDepsHash` only
   when upstream dependencies actually change (use failed-build hashes).
5. Run this repository's quality gates and `nix flake check`, then
   `nix build .#pi-acp`. Source patch changes alone should not change either
   fixed-output hash.

Watch for new RPCs the rebased upstream issues during `session/new`: the
patch's `test/helpers/fake-pi.mjs` must answer them, or the component tests
fail. The 0.0.34 rebase added a `get_available_thinking_levels` response for
exactly this reason. 0.0.34 also requires pi v0.81.0+ (model-specific thinking
levels); the native MCP path additionally requires pi v0.99.0+.

The patch's tests drive the capability probe through the fake pi's
`FAKE_PI_HELP_HAS_MCP_CONFIG` (adapter) and `FAKE_PI_HELP_HAS_NATIVE_MCP`
(native) switches; keep both in sync with whatever the current pi advertises.

For optional live integration testing with Ptah, run a `resultSchema` script
against this package and a separately installed stock pi ≥ 0.99. The result
must be typed, not `nil`, with no `pi-mcp-adapter` installed. That live
model/Ptah test is not part of this repository's deterministic checks.

## Other synthetic assistant text: audit only

This fix is startup-specific, **not** a guarantee that all assistant chunks
are model-authored. At the pinned upstream revision:

- `src/acp/session.ts` emits queue-position/start and cleared-queue messages
  as `agent_message_chunk`. Concurrent prompts/cancellation can still mix
  these with model text; queue depth also has separate session-info metadata.
- Retry start/end and automatic compaction start/end emit assistant status
  text during a turn and can still invalidate a collected JSON response.
- Extension `notify` emits assistant text tagged with
  `_meta.piAcp.notify.level`; unsupported `input`/`editor` requests emit a
  cancellation explanation as assistant text. The severity tag permits
  client filtering of notify chunks but is not universally honored.
- `src/acp/agent.ts` emits slash-command responses/errors (help, session
  stats/name, steering/follow-up modes, changelog/export, and compaction).
  Loaded history also replays assistant text.
  These are intentional UI interactions but not necessarily model output.

None of those behaviors is changed here. Consumers requiring strict
machine-readable output must still account for these paths. Dependency
upgrades/security remediation are likewise outside this source-only fix.
