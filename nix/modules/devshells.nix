_:

{
  perSystem = { pkgs, ... }: {
    devShells.default = pkgs.mkShell {
      packages = with pkgs; [
        nodejs
        typescript
        git
        typescript-language-server
        biome
      ];
    };
  };
}