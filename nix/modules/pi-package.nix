{
  perSystem =
    { pkgs, ... }:
    let
      # Build node_modules for the root (pi SDK types, typescript, etc.)
      rootNodeModules = pkgs.buildNpmPackage {
        name = "pi-root-node-modules";
        src = ./../..;
        npmDepsHash = "sha256-WyotBKnrNxtvKXTvXxENiuBuCww9WLm14VxcxbT8AV4=";
        makeCacheWritable = true;
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
          mkdir -p $out/sounds
          cp $src/index.ts $out/index.ts
          cp $src/rules.ts $out/rules.ts
          cp $src/sounds/message.oga $out/sounds/message.oga
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

      pi-crof = pkgs.stdenv.mkDerivation {
        name = "pi-crof";
        src = ./../../extensions/crof;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $out/index.ts
          cp $src/parse.ts $out/parse.ts
        '';
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

          ./node_modules/.bin/tsc --noEmit
        '';
        installPhase = ''
          touch $out
        '';
      };

      permission-test = pkgs.stdenv.mkDerivation {
        name = "permission-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx and typescript
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          ./node_modules/.bin/tsx --test extensions/permission/rules.test.ts
        '';
        installPhase = ''
          touch $out
        '';
      };

      crof-test = pkgs.stdenv.mkDerivation {
        name = "crof-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx and typescript
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          ./node_modules/.bin/tsx --test extensions/crof/parse.test.ts
        '';
        installPhase = ''
          touch $out
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-tps pi-crof pi-prompts;
      };

      checks = {
        inherit pi-permission pi-tps pi-crof pi-prompts;
        inherit biome-check tsc-check permission-test crof-test;
      };
    };
}
