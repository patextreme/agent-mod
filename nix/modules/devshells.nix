_:

{
  perSystem = { pkgs, ... }: {
    devShells.default = pkgs.mkShell {
      packages = with pkgs; [
        bun
        git
        typescript-language-server
        biome
      ];
    };
  };
}