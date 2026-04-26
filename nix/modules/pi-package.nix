{
  perSystem =
    { pkgs, ... }:
    let
      # Build node_modules for the chain extension (zod dependency)
      chainNodeModules = pkgs.buildNpmPackage {
        name = "pi-chain-ext-node-modules";
        src = ./../../extensions/chain;
        npmDepsHash = "sha256-coUNjO3U/k12GEp9jkBi6nBJ6O6Qddn0NmMPNe6Sd28=";
        dontNpmBuild = true;
        installPhase = ''
          cp -r ./node_modules $out
        '';
      };

      pi-permission = pkgs.stdenv.mkDerivation {
        name = "pi-permission";
        src = ./../../extensions/permission;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $out/index.ts
        '';
      };

      pi-chain =
        let
          chainDefinitions = pkgs.stdenv.mkDerivation {
            name = "pi-chains";
            src = ./../../.pi/chains;
            phases = [ "installPhase" ];
            installPhase = ''
              mkdir -p $out
              cp -r $src/. $out/
            '';
          };
        in
        pkgs.stdenv.mkDerivation {
          name = "pi-chain";
          src = ./../../extensions/chain;
          phases = [ "installPhase" ];
          installPhase = ''
            mkdir -p $out/src
            cp $src/package.json $out/package.json
            cp $src/src/index.ts $out/src/index.ts
            cp $src/src/execution.ts $out/src/execution.ts
            cp $src/src/loader.ts $out/src/loader.ts
            cp $src/src/schema.ts $out/src/schema.ts

            mkdir -p $out/node_modules
            cp -r ${chainNodeModules}/* $out/node_modules/
          '';
        }
        // {
          passthru.definitions = chainDefinitions;
        };

      pi-prompts = pkgs.stdenv.mkDerivation {
        name = "pi-prompts";
        src = ./../../prompts;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/*.md $out/
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-chain pi-prompts;
      };

      checks = {
        inherit pi-permission pi-chain pi-prompts;
      };
    };
}
