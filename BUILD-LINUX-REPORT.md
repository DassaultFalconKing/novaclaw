# NovaClaw Linux build report

Date: 2026-07-28 00:16 CEST
Host: CachyOS Linux x86_64, kernel `7.1.5-1-cachyos`
Toolchain: Bun `1.3.14`, Node.js `v26.4.0`, Electron `42.3.3`, electron-builder `26.15.2`

## Source state

- Branch: `main`
- Synced base commit: `84ebb9115abcb30cda871dcce2f6eceaed2feef9`
- `origin/main`: `84ebb9115abcb30cda871dcce2f6eceaed2feef9`
- Local build changes were stashed before synchronization and restored afterwards.
- `git pull --rebase origin main` completed successfully with `Already up to date`.
- No stash conflicts occurred.

The supplied `BUILD-linux.md` was written from an Ubuntu/aarch64 build where RPM, x86-64, and a
real GUI launch were not verified. This run confirms all of those on CachyOS/x86-64 and adds the
native Arch/CachyOS package.

## Build fixes

1. Restored the missing `packages/novaclaw/script/build-node.ts`.
   It generates and bundles `src/node.ts` for the Node runtime, keeps native/runtime dependencies
   external, uses the Node export conditions, and rejects generated bundles that retain a `bun:`
   runtime import.
2. Added an explicit `.gitignore` exception so `script/build-node.ts` is tracked despite the
   existing `script/build-*.ts` ignore rule.
3. Removed the stale `@opentui/solid/preload` entries from `packages/novaclaw/bunfig.toml`.
4. Verified both desktop callers:
   - `packages/desktop/scripts/prebuild.ts` calls the restored script and completed during the
     desktop build.
   - `NOVACLAW_CHANNEL=prod bun run predev` completed separately: icons were copied, the
     models.dev snapshot loaded, and the sidecar build finished.
5. Added complete Linux package metadata and a maintainer email required by DEB/RPM packaging.
6. Added the `pacman` target with zstd compression and CachyOS/Arch dependency names, plus
   channel-specific package names.
7. Extended the electron-builder configuration test to cover all four Linux targets and package
   identities.
8. Fixed graph-memory startup in both delivery modes:
   - Ladybug's Emscripten filesystem now uses its writable `/tmp` mount instead of the read-only
     root;
   - the standalone executable uses a statically discoverable Ladybug import;
   - the Electron sidecar keeps Ladybug external and packages its WASM/runtime files unpacked;
   - degraded-start warnings now print the complete Effect cause rather than `UnknownError`.
9. Fixed `packages/novaclaw/src/bus/global.ts` by wrapping the typed `EventEmitter` instead of
   overriding its generic `emit` method with an incompatible narrower signature. Added a regression
   test for generated and synchronized event IDs.
10. Made `web` the standalone default command. A bare `novaclaw` invocation now starts the local
    HTML UI rather than exiting successfully without doing anything.
11. Disabled Bun code splitting for compiled executables. Split evaluation reordered circular
    Effect layer imports, so the binary listened successfully but failed on its first HTTP request.
12. Extended the standalone builder with a real server smoke test: it verifies `/api/health`, the
    embedded NovaClaw HTML, and `/memory/stats` in an isolated offline home.

## Commands and result

```sh
bun run --cwd packages/novaclaw build --single --skip-install
cd packages/desktop
NOVACLAW_CHANNEL=prod bun run build
NOVACLAW_CHANNEL=prod bunx electron-builder --linux --config electron-builder.config.ts --publish never
```

All three build stages completed successfully. The standalone builder also executed its own
`--version` smoke test and received `0.1.0`, then passed its compiled server/UI/memory smoke test.

## Artifacts

| Format | Artifact | Size | SHA-256 |
|---|---|---:|---|
| AppImage | `packages/desktop/dist/novaclaw-desktop-linux-x86_64.AppImage` | 179,624,434 bytes | `f3be9eafe763b4cec50696f40a7b9789df63cc0bca9aa8bd8d274bfddd906156` |
| Debian | `packages/desktop/dist/novaclaw-desktop-linux-amd64.deb` | 138,152,660 bytes | `0c1657b5429463d70953cb64db32cb67d3043a722289b53ebda022283dc7294c` |
| RPM | `packages/desktop/dist/novaclaw-desktop-linux-x86_64.rpm` | 112,293,177 bytes | `4198b39891fab72adecf1e11e0d3e516faf225074b3c3973a70b1ee729a5e122` |
| CachyOS/Arch | `packages/desktop/dist/novaclaw-0.1.0-x64.pkg.tar.zst` | 165,867,643 bytes | `4eed9706ca59c49002c17ffc40f2284a1061f7f40404e8815218d790bdc3db24` |
| Standalone CLI/server | `packages/novaclaw/dist/novaclaw-linux-x64/bin/novaclaw` | 136,097,032 bytes | `40d3bcef7539c15b03f6c02b6663f648d72fa29403e00161cac66549744388c7` |

These are local, unsigned release-channel artifacts.

## Package metadata checks

- DEB: package `novaclaw`, version `0.1.0`, architecture `amd64`; description, vendor,
  maintainer, homepage, and runtime dependencies are present.
- RPM: package `novaclaw`, version `0.1.0-1`, architecture `x86_64`; summary and runtime
  requirements are present.
- CachyOS/Arch: package `novaclaw`, version `0.1.0-1`, architecture `x86_64`, zstd-compressed;
  dependencies are `gtk3`, `libnotify`, `nss`, `libxss`, `libxtst`, `xdg-utils`,
  `at-spi2-core`, and `libsecret`.
- The packaged `app.asar` contains the sidecar bundle
  `/out/main/chunks/node-Bj3zhuRy.js` (22,071,776 bytes). A direct scan found no Node-incompatible
  `bun:` imports.
- `app.asar.unpacked` contains the complete `@ladybugdb/wasm-core/nodejs/sync` runtime and WASM
  payload required by graph memory.

## Smoke test and log review

The packaged AppImage was launched with `--appimage-extract-and-run --no-sandbox` in a fresh
isolated `NOVACLAW_HOME` and isolated XDG directories, with `NOVACLAW_OFFLINE=1`. This avoided
reading or changing the normal user profile.

Successful startup sequence:

- packaged app `0.1.0` started;
- update check was skipped as required by offline/airgap mode;
- the local sidecar was spawned and connected over loopback;
- offline HTTP restrictions were activated;
- recipes were seeded;
- the messenger gateway started;
- desktop initialization reached `loading task finished`;
- on the controlled smoke-test shutdown, the sidecar exited with code `0`.

Saved logs were read from
`/tmp/novaclaw-appimage-fixed.tsGy6w/home/desktop/logs/20260727T220851/`.
`main.log`, `server.log`, `utility.log`, `network.log`, and `crash.log` contain no fatal or
unhandled application error.

Observed non-fatal diagnostics:

- Chromium printed Wayland color-management errors while assigning the window color space.
  These were terminal diagnostics, not an application crash, and do not appear in the NovaClaw
  application logs.
- `utility.log` records the sidecar exit at warning level, but its exit code is `0` and it was
  caused by the deliberate smoke-test shutdown.

There is no `kb-memory` warning. The isolated home contains a valid
`data/memory/graph/graph` snapshot (1,921,024 bytes), and the standalone `/memory/stats` endpoint
returned `{"total":0,"valid":0}`.

Smoke-test result: **PASS**.

## Validation

| Check | Result |
|---|---|
| Desktop typecheck (`packages/desktop`) | PASS |
| electron-builder config test | PASS — 3 tests, 24 assertions |
| Standalone artifact `--version` | PASS — `0.1.0` |
| Standalone compiled server/UI/memory smoke | PASS |
| Core graph-memory tests | PASS — 14 tests, 53 assertions |
| Global bus regression test | PASS — 2 tests, 3 assertions |
| Git whitespace check | PASS |
| `predev.ts` production-channel run | PASS |
| Core package typecheck | PASS |
| NovaClaw package typecheck | PASS |

An additional broad worktree test run reached 13/14 before an unrelated worktree-listing assertion
failed; an isolated retry then failed during fixture setup because its temporary config directory
was absent. The focused tests covering every changed runtime and packaging area pass.

## Build-time warnings

The build also emitted non-blocking warnings about optional native dependencies for other
platforms, the absent macOS-only `packages/desktop/native` directory, a theme preload script,
mixed static/dynamic imports, a source-map overwrite, and large renderer chunks. None caused a
failed stage or a missing Linux artifact.
