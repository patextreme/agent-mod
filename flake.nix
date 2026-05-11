{
  description = "Beads";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devshell.url = "github:numtide/devshell";
  };

  outputs =
    inputs@{ flake-parts, devshell, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" ];

      imports = [
        devshell.flakeModule
        ./nix/modules/devshells.nix
        ./nix/modules/pi-package.nix
      ];
    };
}
