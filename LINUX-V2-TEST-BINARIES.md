# NovaClaw Linux V2 test binaries

These packages are unofficial test artifacts for source commit
[`3c7270c`](https://github.com/DassaultFalconKing/novaclaw/commit/3c7270c)
on branch `build-linux-V2`. They are not an official NovaClaw release.

The maintainer declined binary provenance from a personal fork in
[PR #5](https://github.com/NancySadkov/novaclaw/pull/5). Therefore, this
manifest is for local testing only and is not proposed for merge into the
maintainer repository.

Download all packages from the
[`build-linux-v2-test.3` test pre-release](https://github.com/DassaultFalconKing/novaclaw/releases/tag/build-linux-v2-test.3).

| Target | Asset |
| --- | --- |
| Standalone Linux x64 | [`novaclaw-standalone-linux-x64.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.3/novaclaw-standalone-linux-x64.tar.zst) |
| AppImage x86-64 | [`novaclaw-desktop-linux-x86_64.AppImage`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.3/novaclaw-desktop-linux-x86_64.AppImage) |
| Debian/Ubuntu amd64 | [`novaclaw-desktop-linux-amd64.deb`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.3/novaclaw-desktop-linux-amd64.deb) |
| Fedora/RHEL x86-64 | [`novaclaw-desktop-linux-x86_64.rpm`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.3/novaclaw-desktop-linux-x86_64.rpm) |
| CachyOS/Arch x86-64 | [`novaclaw-0.1.0-x64.pkg.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.3/novaclaw-0.1.0-x64.pkg.tar.zst) |

Verify a downloaded directory before installation:

```sh
sha256sum --check LINUX-V2-SHA256SUMS
```

Install on CachyOS or Arch:

```sh
sudo pacman -U ./novaclaw-0.1.0-x64.pkg.tar.zst
```

Run the AppImage without installing it:

```sh
chmod +x ./novaclaw-desktop-linux-x86_64.AppImage
./novaclaw-desktop-linux-x86_64.AppImage
```

Run the standalone server:

```sh
tar --zstd -xf novaclaw-standalone-linux-x64.tar.zst
./novaclaw-linux-x64/bin/novaclaw serve --no-supervise --port 4096
```

## Validation

- Built with Bun 1.3.14 and Node 26.4.0 from `build-linux-V2` at `3c7270c`.
- The standalone binary was built with `NOVACLAW_CHANNEL=prod`, so it uses the
  production database instead of a branch-specific profile.
- Core and NovaClaw typechecks passed.
- 116 focused tests passed for permission handling, trust boundaries, loop
  recovery, textual tool calls, `apply_patch`, and permission integration.
- Standalone version and embedded-server smoke tests passed.
- `/global/health` returned `healthy: true`; the embedded Web UI returned HTML.
- Frontend chunk budgets passed: standalone entry 731,934 bytes, largest
  972,472 bytes; Electron entry 737,432 bytes, largest 978,306 bytes.
- The packaged AppImage loaded `nc://renderer/index.html`; its sidecar reached
  ready state and the messenger gateway started.
- AppImage startup logs contain no `kb-memory failed to open`, renderer crash,
  or sidecar crash. The updater reports no published stable version on GitHub,
  and Wayland reports color-management warnings.
- Packaged standalone E2E used a local llama.cpp model. The model ignored
  prompt injection in an attached task, wrote the exact 17-byte
  `BINARY_COMPLETION` result, read it back, and did not modify the attachment.
- The E2E ended with a non-fatal memory-extraction warning after successful
  task completion.
- GitHub reports the same SHA-256 digest and byte size as the local manifest
  for all five uploaded assets.

## Source review

The maintainer requested small, single-purpose source changes. The relevant
review requests are:

- [#6 — recover malformed patch loops](https://github.com/NancySadkov/novaclaw/pull/6)
- [#7 — recover unfulfilled tool promises](https://github.com/NancySadkov/novaclaw/pull/7)
- [#8 — protect attached task sources](https://github.com/NancySadkov/novaclaw/pull/8)
