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

- [Sidee VIDAA launcher installer](https://github.com/Empi9245/Sidee) for adding Nuvio to the TV launcher using a paired local-network connection
- [Legacy Hisense VIDAA Web Installer](./installer) for older firmware and experimental browser-based installation
- [Nuvio TV Installer](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for Windows, macOS, and Linux
- [Samsung Tizen WGT](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for manual installation
- [LG webOS Homebrew repository](https://raw.githubusercontent.com/NuvioMedia/NuvioTVWebOS/main/webosbrew/apps.json)
- [LG webOS IPK](https://github.com/NuvioMedia/NuvioTVSmart/releases/latest) for manual installation

## Hisense VIDAA OS

### Install Nuvio on a Hisense VIDAA TV

**Recommended for newer VIDAA firmware: [Sidee](https://github.com/Empi9245/Sidee).** Sidee uses PIN-authorized pairing over your local network to add a Nuvio web-app tile to the TV launcher, without changing the TV's DNS settings. The Windows launcher is the simplest setup:

1. Download Sidee from its [GitHub installation guide](https://github.com/Empi9245/Sidee#start-on-windows) and run `start-windows.bat` on a Windows computer on the same network as the TV.
2. In the Sidee dashboard, select **Find TV**, then **Request code**. Enter the PIN shown on your TV and select **Confirm code**.
3. Choose **Install Nuvio**, then launch the Nuvio tile from your TV Home screen. See Sidee's README for other systems and troubleshooting.

Sidee has been tested on VIDAA U09.60; compatibility with other TV models and firmware may vary. The installed tile opens the hosted web app rather than copying an offline package onto the TV. The computer is needed for setup, not for launching the hosted tile afterward.

**Older VIDAA firmware:** The original [browser/DNS-based installer instructions](./installer/README.md) remain available for TVs where the `Hisense_installApp` method is permitted. That legacy method is firmware-dependent and may not work on newer models. Alternatively, you can open the hosted app in the TV browser and bookmark it.

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

## Build from source

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

Special thanks to **[@loggie86](https://github.com/loggie86)** for testing this VIDAA port on real Hisense TV hardware and providing crucial insights on navigation, launcher installation, and backend setup.

## License

[GNU General Public License v3.0](./LICENSE)
