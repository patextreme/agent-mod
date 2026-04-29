{
  perSystem =
    { pkgs, ... }:
    let
      # Build node_modules for the chain extension (zod dependency)
      chainNodeModules = pkgs.buildNpmPackage {
        name = "pi-chain-ext-node-modules";
        src = ./../../extensions/chain;
        npmDepsHash = "sha256-JhyuHlvCZQIw38Xs9mpsoaIxIf8LlTlKiU7PKfcPJ7s=";
        dontNpmBuild = true;
        installPhase = ''
          cp -r ./node_modules $out
        '';
      };

      # Build node_modules for the root (pi SDK types, typescript, etc.)
      rootNodeModules = pkgs.buildNpmPackage {
        name = "pi-root-node-modules";
        src = ./../..;
        npmDepsHash = "sha256-H8nZp5kkAWUoyQqmi+5ZcxmLMeH8uMk6KUTACxpEmRQ=";
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

      pi-tps = pkgs.stdenv.mkDerivation {
        name = "pi-tps";
        src = ./../../extensions/tps;
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

      biome-check = pkgs.stdenv.mkDerivation {
        name = "biome-check";
        src = ./../..;
        nativeBuildInputs = [ pkgs.biome ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          biome check .
        '';
        installPhase = ''
          touch $out
        '';
      };

      tsc-check = pkgs.stdenv.mkDerivation {
        name = "tsc-check";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for pi SDK types and typescript
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          # Provide chain extension node_modules for zod
          cp -r ${chainNodeModules} extensions/chain/node_modules
          chmod -R u+w extensions/chain/node_modules

          ./node_modules/.bin/tsc --noEmit
        '';
        installPhase = ''
          touch $out
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-tps pi-chain pi-prompts;
      };

      checks = {
        inherit pi-permission pi-tps pi-chain pi-prompts;
        inherit biome-check tsc-check;
      };
    };
}
