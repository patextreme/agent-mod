{ ... }:

{
  perSystem =
    { pkgs, ... }:
    {
      devshells.default = {
        name = "agent-mod";
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
