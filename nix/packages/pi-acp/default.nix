# pi-acp, sourced directly from upstream with locally maintained source patches.
# mcp-config.patch is copied verbatim from Ptah; startup-metadata-only.patch
# keeps startup notices out of the model's assistant text. See README.md for
# provenance, compatibility, tests and the patch-rebase workflow.
{
  perSystem =
    { pkgs, ... }:
    let
      pi-acp = pkgs.buildNpmPackage {
        pname = "pi-acp";
        version = "0.0.34";

        src = pkgs.fetchFromGitHub {
          owner = "svkozak";
          repo = "pi-acp";
          rev = "b0581c9c1d675e634234674484247008b03d69b4";
          hash = "sha256-QRwxOtTZOY+Np3PkAoy2o2PrUzEqjItM/372sCPlSMo=";
        };

        patches = [ ./mcp-config.patch ./startup-metadata-only.patch ];

        # Tests spawn this fixture directly (no /usr/bin/env in the sandbox).
        postPatch = ''
          patchShebangs test/helpers/fake-pi.mjs
          # Upstream also generates executable launchers inside a session-path
          # test; patch their embedded shebangs, not just existing fixture files.
          substituteInPlace test/unit/pi-rpc-session-path.test.ts \
            --replace-fail '#!/usr/bin/env node' '#!${pkgs.nodejs_22}/bin/node'
        '';

        nodejs = pkgs.nodejs_22;
        npmDepsHash = "sha256-BvLNtFfp1cMVjzWcMRSdhTqiJrTfbFoUbWkkPW9200o=";
        npmBuild = "npm run build";

        # Exercise upstream and carried-patch suites against the source that
        # produces dist, plus regressions over the bundled ACP stdio transport.
        doCheck = true;
        checkPhase = ''
          runHook preCheck
          npm run typecheck
          PI_ACP_TEST_DIST=dist/index.js npm test
          runHook postCheck
        '';

        meta = {
          description = "ACP adapter for pi (MCP delivery and metadata-only startup notices)";
          homepage = "https://github.com/svkozak/pi-acp";
          license = pkgs.lib.licenses.mit;
          mainProgram = "pi-acp";
          platforms = pkgs.lib.platforms.unix;
        };
      };
    in
    {
      packages = { inherit pi-acp; };
      checks = { inherit pi-acp; };
    };
}
