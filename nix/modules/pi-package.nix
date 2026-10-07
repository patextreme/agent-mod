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
        npmDepsHash = "sha256-n3HrsBWoeYTRYoCgu1SXEU9i40QBG1vxJvjOqwH0hzo=";
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

      ollama-usage-test = pkgs.stdenv.mkDerivation {
        name = "ollama-usage-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx and typescript
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          ./node_modules/.bin/tsx --test --test-concurrency=2 extensions/ollama-usage/parse.test.ts
        '';
        installPhase = ''
          touch $out
        '';
      };

      codex-alias-test = pkgs.stdenv.mkDerivation {
        name = "codex-alias-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Provide root node_modules for tsx and typescript
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules

          ./node_modules/.bin/tsx --test --test-concurrency=2 extensions/codex-alias/alias.test.ts
        '';
        installPhase = ''
          touch $out
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

          ./node_modules/.bin/tsx --test --test-concurrency=2 extensions/permission/rules.test.ts
        '';
        installPhase = ''
          touch $out
        '';
      };

      factory-skills-test = pkgs.stdenv.mkDerivation {
        name = "factory-skills-test";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          cp -r ${rootNodeModules} node_modules
          chmod -R u+w node_modules
          PI_FACTORY_SKILLS_OUTPUT=${pi-skills} node --test --test-concurrency=2 scripts/factory-skills.test.mjs
        '';
        installPhase = ''
          touch $out
        '';
      };

      docs-version-check = pkgs.stdenv.mkDerivation {
        name = "docs-version-check";
        src = ./../..;
        nativeBuildInputs = [ pkgs.nodejs ];
        phases = [ "unpackPhase" "buildPhase" "installPhase" ];
        buildPhase = ''
          # Dependency-free: runs under plain node, no rootNodeModules needed
          node --test --test-concurrency=2 scripts/docs-version.test.mjs
        '';
        installPhase = ''
          touch $out
        '';
      };
    in
    {
      packages = {
        inherit pi-permission pi-ollama-usage pi-codex-alias pi-prompts pi-skills;
      };

      checks = {
        inherit pi-permission pi-ollama-usage pi-codex-alias pi-prompts pi-skills;
        inherit biome-check tsc-check permission-test ollama-usage-test codex-alias-test docs-version-check factory-skills-test;
      };
    };
}
