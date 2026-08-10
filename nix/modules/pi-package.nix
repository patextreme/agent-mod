{
  perSystem =
    { pkgs, ... }:
    let
      # Build node_modules for the root (pi SDK types, typescript, etc.)
      rootNodeModules = pkgs.buildNpmPackage {
        name = "pi-root-node-modules";
        src = ./../..;
        npmDepsHash = "sha256-GoDtNviQVAG9uRLSWMOLjtWZvt3e1FmFf/+eZI/4BMk=";
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

      pi-agentflow = pkgs.stdenv.mkDerivation {
        name = "pi-agentflow";
        src = ./../../extensions/agentflow;
        nodeModules = rootNodeModules;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $out/index.ts
          cp $src/discovery.ts $out/discovery.ts
          cp $src/submit.ts $out/submit.ts
          cp $src/runner.ts $out/runner.ts
          cp $src/runtime.ts $out/runtime.ts
          cp $src/validate.ts $out/validate.ts
          cp $src/orchestrator.ts $out/orchestrator.ts
          cp $src/agentflow.d.ts $out/agentflow.d.ts
          # Bundle the authoring skill so the extension can contribute it via
          # the resources_discover event (skillPaths) when mounted standalone.
          mkdir -p $out/skills/agentflow
          cp $src/skills/agentflow/SKILL.md $out/skills/agentflow/SKILL.md
          # Bundle the jiti and typebox runtime dependencies so the extension
          # resolves them when mounted standalone — the Nix path has no npm
          # install step, so runtime deps must ship inside the output.
          # (runner.ts / submit.ts import { Type } from "typebox" at runtime.)
          mkdir -p $out/node_modules
          cp -r $nodeModules/jiti $out/node_modules/jiti
          cp -r $nodeModules/typebox $out/node_modules/typebox
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

      agentflow-test = pkgs.stdenv.mkDerivation {
        name = "agentflow-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx, typescript, and jiti
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          ./node_modules/.bin/tsx --test extensions/agentflow/discovery.test.ts extensions/agentflow/runtime.test.ts extensions/agentflow/validate.test.ts
        '';
        installPhase = ''
          touch $out
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-tps pi-crof pi-agentflow pi-prompts;
      };

      checks = {
        inherit pi-permission pi-tps pi-crof pi-agentflow pi-prompts;
        inherit biome-check tsc-check permission-test crof-test agentflow-test;
      };
    };
}
