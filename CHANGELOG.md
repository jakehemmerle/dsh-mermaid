# Changelog

All versions are SemVer. While this plugin is qualified only against prerelease DSH builds, versions carry a matching prerelease channel (see [RELEASING.md](RELEASING.md)).

## 0.1.0-rc.1 - 2026-11-02

Qualified against **DSH 0.2.1-rc.2** (fleet store build `kw2crqx0…-dsh-0.2.1-rc.2`; flake pin `kcq4xw92…`) and **dsh-TUI 0.17.0**, commit tested `9ae96bd` + the test-helper fix in this release commit. Evidence: `nix flake check` all checks passed; `vitest run` (unit, contract, browser, web, tui) 10 files / 24 tests passed with `FC_SEED=20261102 NUM_RUNS=50`; TUI inertness also passed with `MMD_INSTALL=link` and `MMD_INSTALL=tarball`.

### Added

- Installable DSH bundle: package renamed to `dsh-mermaid`, `dsh.bundle` in package.json and a root `cordis.patch.yml` that inserts the `ui-mermaid` row, so `dsh plugin add dsh-mermaid` (or a `link:`/tarball spec) installs it with exactly one row.

### Fixed

- Flowcharts were illegible (labels unstyled against their fills) because the per-application render id did not reach the SVG's own style sheet and `url(#…)` references. The id is now rewritten everywhere inside the SVG (P-12; red `3c2e944` → fix `643e16e`).

### Changed

- Peers pinned to DSH 0.2.1-rc.2; the build uses pnpm 11. The seam contract (C-02..C-04) now matches the minified `dsh-web-frontend` bundle, where CodeBlock and the markdown renderer live since rc.2.

## 0.0.2-alpha.1 - 2026-10-12

First tagged release. Qualified against **DSH 0.2.1-alpha.2** (the fleet store build) and unpatched **dsh-TUI 0.14.0**; full evidence trail in [TESTING.md](TESTING.md).

### Fixed

- Two identical mermaid fences (same code and theme) no longer share one SVG element id. The render cache returned the first render's markup with mermaid's render id stamped into the `<svg>`, so `url(#…)` references (arrow markers, per-id styles) of the second copy resolved into the first and broke when the first was disposed or hidden. Every injected diagram now gets a fresh document-unique id; nothing inside the SVG references the root id. (P-10; found by the new real-client regression, red commit `775aace` → fix `b9a4b1c`.)

### Added

- Spec-driven test system shipped with the plugin: SPEC.md properties P-01..P-11 with an independent DOM oracle, fast-check properties on the pure core and the shipped bundles, real-client Playwright campaigns on the fleet `dsh web`, streaming-settle and duplicate-id examples, dispose-restores-DOM property, DSH seam contract (C-01..C-06), dsh-TUI inertness suite, vendored rig + mock model, and a Nix flake with package/devShell/checks and a real-client `nix run .#e2e` app.
- SemVer release procedure (RELEASING.md).
