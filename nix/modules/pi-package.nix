{
  perSystem =
    { pkgs, ... }:
    let
      # Build node_modules for the root (pi SDK types, typescript, etc.)
      rootNodeModules = pkgs.buildNpmPackage {
        name = "pi-root-node-modules";
        src = ./../..;
        # Update via: set to pkgs.lib.fakeHash, run `nix build .#checks.x86_64-linux.pi-root-node-modules`
        # (or any check), copy the `got:` hash back.
        npmDepsHash = "sha256-sl2eWiozBgs8AvobwWg2t6TxYDfv9WUrP9ENSSMlKEI=";
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

      pi-ollama-usage = pkgs.stdenv.mkDerivation {
        name = "pi-ollama-usage";
        src = ./../../extensions/ollama-usage;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $out/index.ts
          cp $src/parse.ts $out/parse.ts
        '';
      };

      pi-codex-alias = pkgs.stdenv.mkDerivation {
        name = "pi-codex-alias";
        src = ./../../extensions/codex-alias;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $out/index.ts
          cp $src/alias.ts $out/alias.ts
        '';
      };

      pi-notify-me = pkgs.stdenv.mkDerivation {
        name = "pi-notify-me";
        src = ./../../extensions/notify-me;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp $src/index.ts $src/adapter.ts $src/config.ts $src/pending.ts \
            $src/payload.ts $src/delivery.ts $out/
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

      pi-skills = pkgs.stdenv.mkDerivation {
        name = "pi-skills";
        src = ./../../skills;
        phases = [ "installPhase" ];
        installPhase = ''
          mkdir -p $out
          cp -r $src/. $out/
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

      node-tests = pkgs.stdenv.mkDerivation {
        name = "node-tests";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx and the pi SDK, then run the
          # discovery-based gate runner. PI_FACTORY_SKILLS_OUTPUT supplies the
          # hermetic-only tier; without it the runner self-skips that tier.
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          PI_FACTORY_SKILLS_OUTPUT=${pi-skills} node tests/run.mjs
        '';
        installPhase = ''
          touch $out
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-ollama-usage pi-codex-alias pi-notify-me pi-prompts pi-skills;
      };

      checks = {
        inherit pi-permission pi-ollama-usage pi-codex-alias pi-notify-me pi-prompts pi-skills;
        inherit biome-check tsc-check node-tests;
      };
    };
}
