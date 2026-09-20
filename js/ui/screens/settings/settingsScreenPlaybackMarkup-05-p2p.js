/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function renderPlaybackP2pBody(model, { torrentSettings, tizenP2pUnsupported, p2pUnavailableSubtitle }) {
  const { t } = internals;
  return `
          <div class="settings-stack">
            ${this.renderToggleRow({
              focusKey: "playback:p2pEnabled",
              title: t("settings_p2p_title"),
              subtitle: p2pUnavailableSubtitle,
              checked: tizenP2pUnsupported ? false : Boolean(torrentSettings.p2pEnabled),
              disabled: tizenP2pUnsupported
            })}
            ${this.renderToggleRow({
              focusKey: "playback:hideTorrentStats",
              title: t("settings_p2p_hide_stats_title"),
              subtitle: tizenP2pUnsupported ? p2pUnavailableSubtitle : t("settings_p2p_hide_stats_subtitle"),
              checked: tizenP2pUnsupported ? false : Boolean(torrentSettings.hideTorrentStats),
              disabled: tizenP2pUnsupported
            })}
          </div>
        `;
}
