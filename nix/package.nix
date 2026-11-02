{
  lib,
  stdenv,
  nodejs,
  pnpm_11,
  fetchPnpmDeps,
  pnpmConfigHook,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "dsh-mermaid";
  version = (lib.importJSON ../package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../build.mjs
      ../cordis.patch.yml
      ../lib/index.js
      ../package.json
      ../pnpm-lock.yaml
      ../pnpm-workspace.yaml
      ../src
      ../test
      ../tsconfig.json
      ../vitest.config.ts
    ];
  };

  nativeBuildInputs = [
    nodejs
    pnpm_11
    pnpmConfigHook
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_11;
    fetcherVersion = 4;
    hash = "sha256-Gdp38cpItxU+704YcmR1Ns6roVOhfdwcAgMbyekDNmM=";
  };

  buildPhase = ''
    runHook preBuild
    node build.mjs
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    pnpm exec tsc --noEmit
    pnpm exec vitest run --project unit
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r lib package.json cordis.patch.yml $out/
    runHook postInstall
  '';

  meta = {
    description = "DeepSeek Harness (dsh) web plugin that renders mermaid code fences as diagrams";
    homepage = "https://github.com/jakehemmerle/dsh-mermaid";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];
  };
})
