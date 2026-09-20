/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function renderPlaybackAudioCompatibilityBody(model) {
  const { t } = internals;
  return `
          <div class="settings-stack">
            ${this.renderToggleRow({
              focusKey: "playback:forceDts",
              title: t("settings.playback.forceDts.title", {}, "Force DTS audio"),
              subtitle: t(
                "settings.playback.forceDts.subtitle",
                {},
                "Keep DTS tracks selectable when automatic detection cannot see a working DTS restoration."
              ),
              checked: Boolean(model.webOsAudioCompatibility?.forceDtsAudio)
            })}
            ${this.renderToggleRow({
              focusKey: "playback:forceTrueHd",
              title: t("settings.playback.forceTrueHd.title", {}, "Force TrueHD audio"),
              subtitle: t(
                "settings.playback.forceTrueHd.subtitle",
                {},
                "Keep TrueHD tracks selectable only when this TV can actually decode or pass through TrueHD."
              ),
              checked: Boolean(model.webOsAudioCompatibility?.forceTrueHdAudio)
            })}
          </div>
        `;
}
