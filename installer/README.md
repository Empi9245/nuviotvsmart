# Nuvio TV - VIDAA OS Installer

One-click installer for Nuvio TV on Hisense VIDAA Smart TVs (such as the Hisense U7Q) and VIDAA OS projectors.

## How to Install on Hisense U7Q (VIDAA OS)

### Option 1: Bookmark in TV Browser (Easiest — Works Everywhere)

1. On your Hisense TV, open the **Internet Browser** (Home > Apps > Browser / Globe icon).
2. Go to your Nuvio host URL (e.g. `http://<your-pc-ip>:4173` or your hosted URL).
3. Press the remote Options/Menu button and select **Add to Bookmarks** (or favorite).
4. That's it! Nuvio caches all assets locally via the included Service Worker (`sw.js`) and launches immediately.

### Option 2: Add Permanent Launcher Icon to TV Home Screen

This adds a native app tile to your TV Home Screen using the built-in `Hisense_installApp` API.

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
4. Click **Install to TV Launcher**.
5. Once complete, change your TV DNS back to **Automatic** and fully restart the TV.
6. The **Nuvio TV** icon will now appear on your TV Home Screen!

> [!NOTE]
> **Compatibility Note on Option 2:** On newer VIDAA firmware versions (VIDAA U6, U7, U8), Hisense has tightened security and may silently ignore third-party launcher registrations. If Option 2 does not appear in your app list after rebooting, use **Option 1 (Browser Bookmark / Speed-Dial Shortcut Pin)**, which works 100% reliably across all VIDAA models!
