# Nuvio TV - VIDAA OS Installer

Installation methods for Nuvio TV on Hisense VIDAA Smart TVs and VIDAA OS projectors. Launcher registration depends on TV model, firmware and permissions.

## Recommended for newer VIDAA TVs: Sidee

[**Sidee — install Nuvio on VIDAA**](https://github.com/Empi9245/Sidee) registers a Nuvio launcher tile through a PIN-authorized local-network connection, instead of using the browser's `Hisense_installApp` permission path or changing DNS settings. It has been tested on VIDAA U09.60; support for other firmware is not guaranteed.

1. On a Windows computer connected to the same home network as your TV, follow [Sidee's Windows setup guide](https://github.com/Empi9245/Sidee#start-on-windows) to download and launch Sidee.
2. In the dashboard, click **Find TV**, **Request code**, enter the PIN displayed on your TV, and click **Confirm code**.
3. Click **Install Nuvio**. Check that the Nuvio tile appears on the TV launcher and opens successfully.

The computer is needed for initial setup, but does not need to stay on for the hosted launcher tile to work. Sidee also documents a Python-based setup for other systems.

## Older VIDAA installations (legacy options)

The following methods are preserved for older firmware and existing setups. They may work on some TVs, but the browser API route is not a verified universal installer.

### Option 1: Bookmark in TV Browser (No Launcher Installation)

1. On your Hisense TV, open the **Internet Browser** (Home > Apps > Browser / Globe icon).
2. Go to your Nuvio host URL (e.g. `http://<your-pc-ip>:4173` or your hosted URL).
3. Press the remote Options/Menu button and select **Add to Bookmarks** (or favorite).
4. Open the bookmark to launch Nuvio in the browser. Cache and offline behavior depend on the TV browser and hosting configuration.

### Option 2: Add a Launcher Tile via the TV Browser (Legacy / Firmware-Dependent)

This attempts to register a hosted web-app tile using the TV browser's built-in `Hisense_installApp` API. It is kept for older VIDAA versions where the API is permitted; unlike Sidee, this method relies on the browser's permissions.

1. On a computer on the same local Wi-Fi / Ethernet network:
   ```bash
   sudo python3 installer/server.py
   ```
   Note the local IP displayed by the server (e.g., `192.168.1.100`).
2. On your **Hisense TV**:
   - Go to **Settings > Network > Network Configuration > DNS**.
   - Change DNS from Automatic to Manual, and enter the PC's IP address.
3. Open the **Internet Browser** on your TV and navigate to:
   ```
   https://vidaahub.com
   ```
4. Click **Install to TV Launcher** and check the diagnostic result. The API callback alone does not prove installation.
5. Restore your TV DNS to **Automatic** and restart the TV.
6. Check whether the **Nuvio TV** tile appears on your TV Home screen and still opens after a restart. If not, try Sidee instead.

> [!CAUTION]
> **Compatibility and safety:** The legacy browser method can be blocked by newer VIDAA firmware (including permission errors when writing launcher metadata). A result code of `0` is not sufficient evidence that a launcher tile was installed. Do not attempt service-menu exploits or system-file modifications. If the browser registration fails, restore automatic DNS and use [Sidee](https://github.com/Empi9245/Sidee) or a normal browser bookmark.
