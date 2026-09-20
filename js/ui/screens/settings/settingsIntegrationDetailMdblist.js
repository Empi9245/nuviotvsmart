/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function renderMdblistIntegrationDetail(model) {
  const { MdbListSettingsStore, mdbListRepository, t, maskValue } = internals;

  const toggleMdbListSetting = (field) => {
    MdbListSettingsStore.set({ [field]: !MdbListSettingsStore.get()[field] });
  };
  this.actionMap.set("integration:mdblist:enabled", () => {
    MdbListSettingsStore.set({ enabled: !MdbListSettingsStore.get().enabled });
  });
  this.actionMap.set("integration:mdblist:key", () => {
    this.openTextDialog({
      title: t("settings.integration.mdblist.dialog.title"),
      value: MdbListSettingsStore.get().apiKey || "",
      placeholder: t("settings.integration.mdblist.dialog.placeholder"),
      returnFocusKey: "integration:mdblist:key",
      clearLabel: t("common.clear", {}, t("action_clear", {}, "Clear")),
      onClear: () => {
        MdbListSettingsStore.set({ apiKey: "" });
        return true;
      },
      onSubmit: async (value) => {
        const trimmed = String(value || "").trim();
        if (trimmed) {
          if (this.textDialog) {
            this.textDialog.statusMessage = t("action_saving", {}, "Saving...");
            this.textDialog.statusKind = "info";
            await this.render({ refreshModel: false });
          }
          const valid = await mdbListRepository.validateApiKey(trimmed);
          if (!valid) {
            if (this.textDialog) {
              this.textDialog.statusMessage = t("settings.integration.mdblist.invalidApiKey");
              this.textDialog.statusKind = "error";
            }
            return false;
          }
        }
        MdbListSettingsStore.set({ apiKey: trimmed });
        return true;
      }
    });
  });
  [
    ["trakt", "showTrakt"],
    ["imdb", "showImdb"],
    ["tmdb", "showTmdb"],
    ["letterboxd", "showLetterboxd"],
    ["tomatoes", "showTomatoes"],
    ["audience", "showAudience"],
    ["metacritic", "showMetacritic"],
    ["mal", "showMal"]
  ].forEach(([provider, field]) => {
    this.actionMap.set(`integration:mdblist:${provider}`, () => toggleMdbListSetting(field));
  });

  return `
        ${this.renderSectionHeader({ labelKey: "settings.integration.mdblist.label", subtitleKey: "settings.integration.mdblist.subtitle" })}
        <div class="settings-group-card settings-group-card-fill">
          <div class="settings-stack">
            ${this.renderActionRow({
              focusKey: "integration:back",
              title: t("settings.integration.backToIntegrations.title"),
              subtitle: t("settings.integration.backToIntegrations.subtitle"),
              icon: "back"
            })}
            ${this.renderToggleRow({
              focusKey: "integration:mdblist:enabled",
              title: t("settings.integration.mdblist.enable.title"),
              subtitle: t("settings.integration.mdblist.enable.subtitle"),
              checked: Boolean(model.mdbList.enabled)
            })}
            ${this.renderActionRow({
              focusKey: "integration:mdblist:key",
              title: t("settings.integration.mdblist.apiKey.title"),
              subtitle: t("settings.integration.mdblist.apiKey.subtitle"),
              value: maskValue(model.mdbList.apiKey, t("common.notSet")),
              disabled: !model.mdbList.enabled
            })}
            ${[
              ["trakt", "showTrakt"],
              ["imdb", "showImdb"],
              ["tmdb", "showTmdb"],
              ["letterboxd", "showLetterboxd"],
              ["tomatoes", "showTomatoes"],
              ["audience", "showAudience"],
              ["metacritic", "showMetacritic"],
              ["mal", "showMal"]
            ]
              .map(([provider, field]) =>
                this.renderToggleRow({
                  focusKey: `integration:mdblist:${provider}`,
                  title: t(`settings.integration.mdblist.${provider}.title`),
                  subtitle: t(`settings.integration.mdblist.${provider}.subtitle`),
                  checked: model.mdbList[field] !== false,
                  disabled: !model.mdbList.enabled
                })
              )
              .join("")}
          </div>
        </div>
      `;
}
