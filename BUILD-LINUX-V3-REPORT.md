# NovaClaw Linux V3 build report

Date: 2026-07-28

Host: CachyOS, Linux x86_64

Branch: `build-linux-V3`

Upstream base: `origin/main` at `06c069b`

## Integrated source

The branch includes the Linux V2 build line, the stop/end-turn fixes, responsive
launcher and Files routing, packaged runtime assets, frontend chunk optimization,
tool-call recovery, and the reviewed completion-recovery policy.

The final local fixes are split into these commits:

- `11b4581 fix(core): constrain terminal recovery`
- `8bbed5c chore(core): synchronize database schema`
- `3b20545 fix(core): normalize portable runtime paths`
- `2f70afe fix(ui): restore ungrouped select controls`
- `cf5e234 test(app): align browser harness with v2`

The maintainer-owned cross-server test
`packages/app/e2e/regression/cross-server-tab-close.spec.ts` is byte-for-byte
unchanged from `origin/main`.

## Validation

### Repository and PII test suite

The final source tree passed:

- Turbo typecheck: 18/18 packages.
- PII Parser quality suite: all selected checks passed.
- PII test units: 14/14.
- Core: 2223 tests passed.
- App unit: 530 tests passed.
- App browser: 21 tests passed.
- UI and app package typechecks passed.
- Database migration check printed `No schema changes, nothing to migrate`.

Oxlint completed with no errors. It reports existing repository warnings.

### Playwright interface smoke

The current V2 interaction subset passed 17 of 18 scenarios:

- Settings opens.
- The local OpenAI-compatible endpoint field is available.
- Every registered app page renders without a UI error.
- Every launcher tile and internal app link activates.
- Repeated main-menu transitions remain responsive.
- Files always keeps an escape route while its content is pending.
- Thinking-level selection opens.
- Review line comments reach the session composer.
- Question and permission docks work.
- Hidden terminal content unmounts.

The remaining Todo navigation scenario enters through an explicit
`/server/...` route and stays at `Loading...` in the current server-scope mock.
It is held for the maintainer's replacement cross-server harness.

The old timeline regression fixtures still supply V1 `{ info, parts }` messages
and assert the removed V1 virtualized DOM. The application now renders native V2
`SessionMessage[]`. These tests are not an acceptance gate until their fixtures
and selectors are ported to the native transcript.

### Live local-model smoke

The packaged standalone binary used the local OpenAI-compatible model endpoint
at `127.0.0.1:30000`. The model completed five provider turns and used:

1. `todowrite` to create a three-step plan.
2. `bash` to create `smoke-result.txt`.
3. `read` to verify the file.
4. `todowrite` to mark every step complete.
5. A normal `finish: stop` after reporting the verified result.

The verified file bytes are `NOVACLAW_V3_TOOL_SMOKE_OK\n`. This confirms that the
model received both the new todo tool and standard filesystem/shell tools, used
them, continued after tool calls, and finished the requested task.

### Packaged Electron smoke

The AppImage was started with a new isolated `NOVACLAW_HOME` and offline mode.

- The packaged renderer loaded from `nc://renderer/index.html`.
- The sidecar spawned and reached `server ready`.
- SQLite state and the memory graph were created.
- The inotify watcher started.
- No `kb-memory failed to open` message occurred.
- No unhandled application exception occurred during startup.

One provider-subscription timeout was logged because the smoke profile
deliberately enabled offline mode. Network-service and renderer termination
messages occurred only after the 35-second smoke timer sent `SIGTERM`.

Smoke logs:

`/tmp/novaclaw-v3-smoke.DzlZMj/novaclaw/desktop/logs/20260728T211846`

## Frontend chunks

The frontend chunk gate is part of both web and desktop build scripts.

- Standalone web entry: 734,686 bytes.
- Standalone largest JavaScript chunk: 972,472 bytes.
- Desktop renderer entry: 738,663 bytes.
- Desktop largest JavaScript chunk: 978,306 bytes.

The configured limits are 900,000 bytes for the entry and 1,000,000 bytes for
any JavaScript chunk. Both builds passed.

## Artifacts

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `packages/novaclaw/dist/novaclaw-linux-x64/bin/novaclaw` | 130 MiB | `43c50ebbf4171468fe06fbba447053aaec43ae3abaaf07c95e021243c89802f2` |
| `packages/desktop/dist/novaclaw-desktop-linux-x86_64.AppImage` | 173 MiB | `c359492eff7d509d208f89fdb1d2dd44c09bf20b72639c8e1ac83663d90c7916` |
| `packages/desktop/dist/novaclaw-desktop-linux-amd64.deb` | 133 MiB | `9a13e6aa89b754fb56da699eab38cceab296411d74bbd89965944e88f909a5b4` |
| `packages/desktop/dist/novaclaw-desktop-linux-x86_64.rpm` | 109 MiB | `e8e793e9ffef8ae2f795010238a88fd4379ccd6cdd1afc413160c7410002775f` |
| `packages/desktop/dist/novaclaw-0.1.0-x64.pkg.tar.zst` | 159 MiB | `659bb84ebb5aabcb7282372092e4811a6bd6efc6da56770067500e1e5c13ee0a` |

The CachyOS/Arch package metadata identifies `novaclaw 0.1.0-1`, architecture
`x86_64`, and the expected Electron runtime dependencies. The DEB metadata
identifies `novaclaw 0.1.0`, architecture `amd64`.

The optional-dependency warnings are expected cross-platform filtering:
Electron Builder skips Darwin, Windows, ARM, and unused msgpack native packages
while packaging Linux x86_64. The resulting AppImage contains the required
`node-pty-linux-x64`, `msgpackr-extract-linux-x64`, and Parcel watcher Linux x64
payloads.

## Run and install

Run the portable AppImage:

```sh
/home/jinx/Disk2/novaclaw/.worktrees/build-linux-V3/packages/desktop/dist/novaclaw-desktop-linux-x86_64.AppImage
```

If FUSE is unavailable:

```sh
/home/jinx/Disk2/novaclaw/.worktrees/build-linux-V3/packages/desktop/dist/novaclaw-desktop-linux-x86_64.AppImage --appimage-extract-and-run
```

Install on CachyOS or Arch:

```sh
sudo pacman -U /home/jinx/Disk2/novaclaw/.worktrees/build-linux-V3/packages/desktop/dist/novaclaw-0.1.0-x64.pkg.tar.zst
```

After installation, launch NovaClaw from the desktop menu or run:

```sh
/opt/NovaClaw/app.novaclaw.desktop
```

Run the standalone CLI:

```sh
/home/jinx/Disk2/novaclaw/.worktrees/build-linux-V3/packages/novaclaw/dist/novaclaw-linux-x64/bin/novaclaw --help
```

Windows packaging is intentionally deferred to the Windows build host.
