# Ported from Ptah: pinned upstream pi-acp with stdio MCP delivery to Pi.
# Rebase the carried patch when updating the pin; see README.md beside this file.
{
  perSystem =
    { pkgs, config, ... }:
    {
      packages.pi-acp = pkgs.buildNpmPackage {
        pname = "pi-acp";
        version = "0.0.34";

        src = pkgs.fetchFromGitHub {
          owner = "svkozak";
          repo = "pi-acp";
          rev = "b0581c9c1d675e634234674484247008b03d69b4";
          hash = "sha256-QRwxOtTZOY+Np3PkAoy2o2PrUzEqjItM/372sCPlSMo=";
        };

        patches = [
          ./mcp-config.patch
          ./nix-tests.patch
        ];

        nodejs = pkgs.nodejs_22;
        npmDepsHash = "sha256-BvLNtFfp1cMVjzWcMRSdhTqiJrTfbFoUbWkkPW9200o=";
        npmBuild = "npm run build";

        doCheck = true;
        checkPhase = ''
          runHook preCheck
          # Component tests launch this fake Pi as an executable in the sandbox.
          patchShebangs test/helpers
          npm test
          runHook postCheck
        '';

        meta = {
          description = "ACP adapter for the pi coding agent (patched: ACP mcpServers wired through to pi)";
          homepage = "https://github.com/svkozak/pi-acp";
          license = pkgs.lib.licenses.mit;
          mainProgram = "pi-acp";
          platforms = pkgs.lib.platforms.unix;
        };
      };

      checks.pi-acp = config.packages.pi-acp;
    };
}
