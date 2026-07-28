# NovaClaw Linux V2 test binaries

These packages are test artifacts for commit
[`8d92c8832871fa05e7c0193e5c06d660b8c0ee43`](https://github.com/DassaultFalconKing/novaclaw/commit/8d92c8832871fa05e7c0193e5c06d660b8c0ee43)
from code review [#4](https://github.com/NancySadkov/novaclaw/pull/4).
They are not a stable NovaClaw release.

Download all packages from the
[`build-linux-v2-test.1` test pre-release](https://github.com/DassaultFalconKing/novaclaw/releases/tag/build-linux-v2-test.1).

| Target | Asset |
| --- | --- |
| Standalone Linux x64 | [`novaclaw-standalone-linux-x64.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.1/novaclaw-standalone-linux-x64.tar.zst) |
| AppImage x86-64 | [`novaclaw-desktop-linux-x86_64.AppImage`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.1/novaclaw-desktop-linux-x86_64.AppImage) |
| Debian/Ubuntu amd64 | [`novaclaw-desktop-linux-amd64.deb`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.1/novaclaw-desktop-linux-amd64.deb) |
| Fedora/RHEL x86-64 | [`novaclaw-desktop-linux-x86_64.rpm`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.1/novaclaw-desktop-linux-x86_64.rpm) |
| CachyOS/Arch x86-64 | [`novaclaw-0.1.0-x64.pkg.tar.zst`](https://github.com/DassaultFalconKing/novaclaw/releases/download/build-linux-v2-test.1/novaclaw-0.1.0-x64.pkg.tar.zst) |

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

- Desktop typecheck passed.
- Ten desktop regression tests passed.
- The packaged renderer loaded `nc://renderer/index.html`.
- KWin identified the window as `NovaClaw` with class `app.novaclaw.desktop`.
- AppImage and server-sidecar startup passed.
- GitHub verified the SHA-256 digest of each uploaded package.

