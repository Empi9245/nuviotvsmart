<div align="center">

  <img src="assets/brand/app_logo_wordmark.png" alt="Nuvio" width="300" />

  <p>
    A free, open-source media app for your phone, your desktop, and the TV you already own.
    <br />
    Bring your own sources. Nuvio turns them into a library with artwork, ratings, subtitles, and your place saved on every screen.
  </p>

[Website](https://nuvio.tv) · [GitHub releases](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) · [Support Nuvio](https://nuvio.tv/support)

</div>

> [!IMPORTANT]
>
> ### 📺 Hisense VIDAA OS Port (Experimental / AI-Assisted)
>
> This fork introduces initial support for **Hisense VIDAA OS** (Smart TVs and Projectors).
>
> - 🤖 **Development:** Built with AI assistance.
> - 🧪 **Testing Status:** Currently experimental — real-device testing on actual Hisense hardware is in progress.
> - 🙏 **Special Thanks:** Huge thanks to **[@loggie86](https://github.com/loggie86)** for hands-on hardware testing and invaluable feedback!
> - 💬 **Early Feedback & Testers:** If you have a Hisense TV running VIDAA and want to test it out or report issues, please feel free to open an issue or reach out!

---

## Get Nuvio TV

Nuvio TV supports **Samsung Tizen TVs from 2018 onward (Tizen 4+)**, **LG webOS TVs from 2020 onward (webOS 5+)**, and **Hisense VIDAA OS (Experimental Port)**.
The startup compatibility baseline is Samsung Tizen 4.0 / Chromium 56, LG webOS 5.0 / Chromium 68, and Hisense VIDAA OS (Chromium / WebKit runtime).

Platform capabilities are intentionally version-dependent:

- **Hisense VIDAA OS (Experimental Port)** — TV remote navigation, a fixed TV canvas, and playback through the TV runtime's HTML video backend, with native HLS preferred when supported. Audio and subtitle availability depends on the TV firmware.

- **Samsung Tizen 4.x** — the app and direct playback are supported, but torrent/P2P playback is unavailable by design. Some advanced audio and subtitle features may also be limited.
- **Samsung Tizen 5.x, including 5.5** — torrent/P2P playback is supported through the bundled local EngineFS service only. The PluginService, plugin execution, and remote plugin pull/push synchronization are disabled; the Plugins screen is not available.
  The Node 4.4.3 service runtime observed on Tizen 5.5 is incompatible with the current PluginService syntax and URL APIs. Experimental legacy transports are not included; plugin support starts at Tizen 6.0.
- **Samsung Tizen 6+** — torrent/P2P and the packaged PluginService are supported. Plugin execution requires the packaged service plus the TV runtime's Worker and WebAssembly support. Tizen 6 and later use the same current Tizen service pipeline.
- **LG webOS 5.x** — torrent/P2P and the packaged plugin service are supported, with the limited plugin resource quotas used by the older webOS runtime.
- **LG webOS 6+** — torrent/P2P and the packaged plugin service are supported with the modern plugin resource quotas.

On Tizen 5+ and LG webOS, torrent/P2P uses only the bundled local companion service; no external torrent streaming server is configured or required.

- [Nuvio TV Installer](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for Windows, macOS, and Linux
- [Samsung Tizen WGT](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for manual installation
- [LG webOS Homebrew repository](https://raw.githubusercontent.com/NuvioMedia/NuvioTVWebOS/main/webosbrew/apps.json)
- [LG webOS IPK](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for manual installation

## Hisense VIDAA OS

Create the VIDAA web archive with:

```bash
npm run package:vidaa
```

The output is `dist/nuvio-vidaa.zip`, with the app files also available in
`dist/vidaa/`. Use these files with your TV installation method.

The VIDAA version shares Nuvio's interface and player controls with Tizen and
webOS. Its platform adapter handles TV keys, keyboard input, app exit, and
optional HTTP media-domain registration. Playback uses the HTML video backend;
the app pauses playback when hidden. Codec support, track switching, buffering,
and storage persistence still require validation on the target TV.

For local development, run `npm run serve:vidaa`.

See [VIDAA verification and test commands](./docs/vidaa-verification.md) for the
regression suites, recorded device checks, and remaining hardware limitations.
See [upstream 1.2.7 integration](./docs/upstream-1.2.7-integration.md) for the
latest features, VIDAA adaptations, and build verification.

## Build from source

Configure metadata and tracking in **Settings → Integrations**. TMDB accepts a
personal API key and a preferred metadata language; MDBList accepts your API key.
Trakt connects your account through the original device sign-in screen: select
**Connect Trakt**, then approve the displayed code at `https://trakt.tv/activate`.
The app supplies its own Trakt configuration; no Client ID or Secret entry is
needed on the TV. Existing local settings and profile tokens are preserved.

Builds supply Trakt application configuration through ignored `local.properties`,
as official Nuvio releases do. To reproduce it from the public Nuvio 1.2.5 Tizen
release, run this once before building:

```bash
node scripts/import-official-trakt-config.mjs
```

The importer verifies the pinned package SHA-256
`3e337ef50a84611dce0e64bf475ab7a95227822d48b7bc0237b89fcf134b571c`,
imports only the two Trakt application values, preserves other configuration,
and never prints credentials. Different existing Trakt values require the
explicit `--replace-trakt` option. Downloads are not part of normal builds.
Without these build values Trakt remains unavailable; the TV never asks for
manual application credentials. No account password or user token belongs in
`local.properties` or a distributed package.

The MDBList account and library-list integration added in 1.2.7 also needs its
application Client ID. Prepare it from the official 1.2.7 package with:

```bash
node scripts/import-official-mdblist-config.mjs --if-missing
```

This verifies the pinned official archive checksum and imports only the MDBList
application ID. Existing custom configuration is preserved. Vercel prepares both
application integrations before packaging; users still approve account linking
from the normal device-code screen.

Personal TMDB credentials override build defaults for the current profile;
clearing them restores those defaults when available. The client includes the
official public Nuvio account URL and anon key. Existing Nuvio accounts sign in
through the official phone approval QR; Addons opens the official account manager.
Without a configured TMDB key, enabling enrichment opens the key setup. Selecting
a language alone cannot localize the metadata supplied by catalogue addons.

The player automatically tries the next available source when a stream fails.
It keeps the playback position, skips failed sources and displays an error only
after the available sources have been exhausted. Opening a saved stream from
Continue Watching also searches for alternatives when that stream fails.

```bash
git clone https://github.com/derpwinnie/NuvioTVSmart.git NuvioTVSmart
cd NuvioTVSmart
npm install
npm run build
```

Build TV packages with:

```bash
npm run package:tizen
npm run package:tizen:store
npm run package:webos
npm run package:vidaa
```

To run the VIDAA version locally:

```bash
npm run serve:vidaa  # Start local VIDAA development server
```

`package:tizen` creates the unsigned WGT used by development and the Nuvio TV Installer. The installer signs it locally for the target TV before installation. `package:tizen:store` is a separate Seller Office build: it requires Tizen Studio/Web CLI and a configured security profile, and creates the signed Store package with the local EngineFS service included so Tizen 5+ retains torrent/P2P playback. Tizen 4 still reports P2P as unsupported at runtime. Nuvio TV is built with JavaScript, HTML, CSS, and platform TV APIs. Building requires Node.js and npm; package installation additionally requires the relevant Tizen or webOS tools.

## Acknowledgements

Special thanks to **[@loggie86](https://github.com/loggie86)** for testing this VIDAA port on real Hisense TV hardware and providing crucial insights on navigation, launcher installation, and VIDAA compatibility.

## License

[GNU General Public License v3.0](./LICENSE)
