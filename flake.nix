{
  description = "dsh-mermaid: DeepSeek Harness web plugin that renders mermaid fences as diagrams";

  # Every input is pinned by revision. nixpkgs and nix-dsh match nix-config's
  # flake.lock (nix-config e580478), so dsh here is the fleet's dsh 0.2.1-rc.2
  # (before nix-config's patches) and dsh-TUI is nix-dsh's unpatched 0.15.0.
  # nixpkgs-tools supplies beads 1.3.0 and the Playwright 1.63.0 browsers that
  # match package.json (nix-config's newer tools pin carries Playwright 1.64).
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/6f06d204d8f2d8761d9da78778745974a3216381";
    nixpkgs-tools.url = "github:NixOS/nixpkgs/b6c8664de9b6cc07fe5666a29f91884ba81197c4";
    nix-dsh = {
      url = "github:jakehemmerle/nix-dsh/09c130deea81128953bd3f18c89ce956740b81f8";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { self, nixpkgs, nixpkgs-tools, nix-dsh }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
      env = system: pkgs: rec {
        tools = nixpkgs-tools.legacyPackages.${system};
        dsh = nix-dsh.packages.${system}.dsh;
        dshTui = nix-dsh.packages.${system}.dsh-tui;
        dshTuiDir = "${dshTui}/lib/node_modules/@deepseek-harness-tui/dsh-tui";
        browsers = tools.playwright-driver.browsers;
        vars = {
          DSH_BIN = "${dsh}/bin/dsh";
          DSH_TUI_DIR = dshTuiDir;
          PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
          DSH_ROOT = "${dsh}/lib/node_modules/@deepseek-ai/dsh";
        };
        exports = pkgs.lib.concatStrings (pkgs.lib.mapAttrsToList (k: v: "export ${k}=${pkgs.lib.escapeShellArg v}\n") vars);
      };
    in
    {
      packages = forAllSystems (system: pkgs: {
        default = pkgs.callPackage ./nix/package.nix { };
        inherit (env system pkgs) dsh dshTui;
      });

      checks = forAllSystems (system: pkgs:
        let e = env system pkgs; in {
          # The package build runs tsc and the fast unit/property suites (NUM_RUNS=1000).
          default = self.packages.${system}.default;
          # Pins the DSH CodeBlock/fiber seam the plugin reads against this exact dsh.
          contract = self.packages.${system}.default.overrideAttrs (old: {
            pname = "dsh-mermaid-contract";
            env = (old.env or { }) // { DSH_ROOT = e.vars.DSH_ROOT; };
            checkPhase = ''
              runHook preCheck
              pnpm exec vitest run --project contract
              runHook postCheck
            '';
            installPhase = "touch $out";
          });
        });

      devShells = forAllSystems (system: pkgs:
        let e = env system pkgs; in {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.pnpm_11
              pkgs.tmux
              e.tools.beads
              e.dsh
            ];
            shellHook = e.exports;
          };
        });

      # nix run .#e2e: the real-client suites (dsh web + Playwright, dsh-TUI in tmux).
      apps = forAllSystems (system: pkgs:
        let
          e = env system pkgs;
          e2e = pkgs.writeShellApplication {
            name = "dsh-mermaid-e2e";
            runtimeInputs = [ pkgs.nodejs_24 pkgs.pnpm_11 pkgs.tmux pkgs.coreutils ];
            text = e.exports + ''
              if [ ! -f package.json ] || ! grep -q '"name": "dsh-mermaid"' package.json; then
                echo "run from the dsh-mermaid checkout" >&2; exit 2
              fi
              pnpm install --frozen-lockfile --silent
              exec pnpm run test:e2e "$@"
            '';
          };
        in {
          e2e = { type = "app"; program = "${e2e}/bin/dsh-mermaid-e2e"; };
        });
    };
}
