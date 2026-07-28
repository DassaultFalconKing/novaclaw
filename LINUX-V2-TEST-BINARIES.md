# NovaClaw Linux V2 test binaries

These packages are test artifacts for commit
[`f2e5c6f0b2d6ec78070e0074d1f0e4e03a3c50f1`](https://github.com/DassaultFalconKing/novaclaw/commit/f2e5c6f0b2d6ec78070e0074d1f0e4e03a3c50f1)
from code review [#4](https://github.com/NancySadkov/novaclaw/pull/4).
They are not a stable NovaClaw release.

Download all packages from the
[`build-linux-v2-test.2` test pre-release](https://github.com/DassaultFalconKing/novaclaw/releases/tag/build-linux-v2-test.2).

| Target | Asset |
| --- | --- |
| Standalone Linux x64 | [`novaclaw-standalone-linux-x64.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.2/novaclaw-standalone-linux-x64.tar.zst) |
| AppImage x86-64 | [`novaclaw-desktop-linux-x86_64.AppImage`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.2/novaclaw-desktop-linux-x86_64.AppImage) |
| Debian/Ubuntu amd64 | [`novaclaw-desktop-linux-amd64.deb`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.2/novaclaw-desktop-linux-amd64.deb) |
| Fedora/RHEL x86-64 | [`novaclaw-desktop-linux-x86_64.rpm`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.2/novaclaw-desktop-linux-x86_64.rpm) |
| CachyOS/Arch x86-64 | [`novaclaw-0.1.0-x64.pkg.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.2/novaclaw-0.1.0-x64.pkg.tar.zst) |

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

Validation before publication:

- Completion guard implementation `6901eaa` is included. It adds a per-session
  Tune toggle and keeps the default guard enabled.
- Core, app, client, and codegen typechecks passed.
- All 73 targeted Completion guard tests and both runner integration filters passed.
- The database migration check passed.
- Standalone version and server smoke tests passed.
- Frontend chunk budgets passed for standalone and Electron.
- The packaged renderer loaded `nc://renderer/index.html`.
- AppImage and server-sidecar startup passed.
- The application logs contain no kb-memory, image-load, renderer-fatal, or
  sidecar-crash match.
- GitHub verified the SHA-256 digest of each uploaded package.
