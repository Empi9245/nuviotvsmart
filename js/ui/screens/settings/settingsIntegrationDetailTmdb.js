/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";
import { hasDefaultTmdbApiKey, isTmdbConfigured } from "../../../core/tmdb/tmdbApiConfig.js";
import { validateTmdbApiKey } from "../../../core/tmdb/tmdbApiKeyValidation.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { TmdbService } from "../../../core/tmdb/tmdbService.js";

export function renderTmdbIntegrationDetail(model) {
  const { TmdbSettingsStore, TMDB_LANGUAGE_OPTIONS, t, labelForTmdbLanguage, normalizeTmdbLanguageCode, maskValue } = internals;
  const hasDefaultKey = hasDefaultTmdbApiKey();
  const configured = isTmdbConfigured(model.tmdb);
  const renderedProfileId = ProfileManager.getActiveProfileId();

  const toggleTmdbSetting = (field) => {
    TmdbSettingsStore.set({ [field]: !TmdbSettingsStore.get()[field] });
  };
  this.actionMap.set("integration:tmdb:enabled", () => {
    TmdbSettingsStore.set({ enabled: !TmdbSettingsStore.get().enabled });
  });
  this.actionMap.set("integration:tmdb:key", () => {
    const profileId = ProfileManager.getActiveProfileId();
    const isCurrentProfile = () => String(ProfileManager.getActiveProfileId()) === String(profileId);
    this.openTextDialog({
      title: t("tmdb_api_key_title", {}, "TMDB API key"),
      value: TmdbSettingsStore.getForProfile(profileId).apiKey,
      inputType: "password",
      placeholder: t("tmdb_api_key_placeholder", {}, "API key (v3 auth)"),
      returnFocusKey: "integration:tmdb:key",
      clearLabel: hasDefaultKey ? t("tmdb_api_key_reset_default", {}, "Use default key") : t("common.clear", {}, "Clear"),
      onClear: () => {
        if (!isCurrentProfile()) return false;
        TmdbSettingsStore.setForProfile(profileId, { apiKey: "" }, { silentSync: true });
        TmdbService.clearCache();
        return true;
      },
      onSubmit: async (value) => {
        if (!isCurrentProfile()) return false;
        const apiKey = String(value || "").trim();
        const dialog = this.textDialog;
        if (apiKey) {
          if (dialog) {
            dialog.statusMessage = t("tmdb_api_key_validating", {}, "Checking TMDB key...");
            dialog.statusKind = "info";
            await this.render({ refreshModel: false });
          }
          try {
            const valid = await validateTmdbApiKey(apiKey);
            if (this.textDialog !== dialog || !isCurrentProfile()) return false;
            if (!valid) {
              if (dialog) {
                dialog.statusMessage = t(
                  "tmdb_api_key_invalid",
                  {},
                  "Invalid TMDB API key. Enter the API key (v3 auth) from your TMDB account."
                );
                dialog.statusKind = "error";
              }
              return false;
            }
          } catch (error) {
            if (this.textDialog === dialog && isCurrentProfile() && dialog) {
              dialog.statusMessage =
                Number(error?.status) === 429
                  ? t("tmdb_api_key_rate_limit", {}, "TMDB request limit reached. Try again later.")
                  : t("tmdb_api_key_connection_error", {}, "Could not connect to TMDB. Check your connection and try again.");
              dialog.statusKind = "error";
            }
            return false;
          }
        }
        if (!isCurrentProfile()) return false;
        TmdbSettingsStore.setForProfile(profileId, { apiKey, ...(apiKey ? { enabled: true } : {}) });
        TmdbService.clearCache();
        return true;
      }
    });
  });
  this.actionMap.set("integration:tmdb:resetKey", () => {
    if (String(ProfileManager.getActiveProfileId()) !== String(renderedProfileId)) return;
    TmdbSettingsStore.set({ apiKey: "" }, { silentSync: true });
    TmdbService.clearCache();
  });
  this.actionMap.set("integration:tmdb:modernHome", () => {
    toggleTmdbSetting("modernHomeEnabled");
  });
  this.actionMap.set("integration:tmdb:continueWatching", () => {
    toggleTmdbSetting("enrichContinueWatching");
  });
  this.actionMap.set("integration:tmdb:artwork", () => {
    toggleTmdbSetting("useArtwork");
  });
  this.actionMap.set("integration:tmdb:basic", () => {
    toggleTmdbSetting("useBasicInfo");
  });
  this.actionMap.set("integration:tmdb:details", () => {
    toggleTmdbSetting("useDetails");
  });
  this.actionMap.set("integration:tmdb:releaseDates", () => {
    toggleTmdbSetting("useReleaseDates");
  });
  this.actionMap.set("integration:tmdb:credits", () => {
    toggleTmdbSetting("useCredits");
  });
  this.actionMap.set("integration:tmdb:productions", () => {
    toggleTmdbSetting("useProductions");
  });
  this.actionMap.set("integration:tmdb:networks", () => {
    toggleTmdbSetting("useNetworks");
  });
  this.actionMap.set("integration:tmdb:episodes", () => {
    toggleTmdbSetting("useEpisodes");
  });
  this.actionMap.set("integration:tmdb:trailers", () => {
    toggleTmdbSetting("useTrailers");
  });
  this.actionMap.set("integration:tmdb:moreLikeThis", () => {
    toggleTmdbSetting("useMoreLikeThis");
  });
  this.actionMap.set("integration:tmdb:collections", () => {
    toggleTmdbSetting("useCollections");
  });
  this.actionMap.set("integration:tmdb:language", () => {
    this.openOptionDialog({
      title: t("settings.dialogs.selectTmdbLanguage"),
      options: TMDB_LANGUAGE_OPTIONS,
      selectedId: normalizeTmdbLanguageCode(TmdbSettingsStore.get().language),
      returnFocusKey: "integration:tmdb:language",
      onSelect: (option) => {
        TmdbSettingsStore.set({ language: option.id });
      }
    });
  });
  return `
        ${this.renderSectionHeader({ labelKey: "settings.integration.tmdb.label", subtitleKey: "settings.integration.tmdb.subtitle" })}
        <div class="settings-group-card settings-group-card-fill">
          <div class="settings-stack">
            ${this.renderActionRow({
              focusKey: "integration:back",
              title: t("settings.integration.backToIntegrations.title"),
              subtitle: t("settings.integration.backToIntegrations.subtitle"),
              icon: "back"
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:enabled",
              title: t("settings.integration.tmdb.enable.title"),
              subtitle: configured
                ? t("settings.integration.tmdb.enable.subtitle")
                : t("tmdb_api_key_required", {}, "Add your TMDB API key to enable metadata enrichment."),
              checked: Boolean(model.tmdb.enabled)
            })}
            ${this.renderActionRow({
              focusKey: "integration:tmdb:key",
              title: t("tmdb_api_key_title", {}, "TMDB API key"),
              subtitle: t(
                "tmdb_api_key_subtitle",
                {},
                "Your key is saved on this device for this profile and overrides the optional default key."
              ),
              value: model.tmdb.apiKey
                ? maskValue(model.tmdb.apiKey, t("common.notSet"))
                : hasDefaultKey
                  ? t("tmdb_api_key_default", {}, "Default key")
                  : t("common.notSet")
            })}
            ${
              model.tmdb.apiKey
                ? this.renderActionRow({
                    focusKey: "integration:tmdb:resetKey",
                    title: hasDefaultKey
                      ? t("tmdb_api_key_reset_default", {}, "Use default key")
                      : t("tmdb_api_key_remove", {}, "Remove API key"),
                    subtitle: hasDefaultKey
                      ? t("tmdb_api_key_reset_subtitle", {}, "Remove your personal key and use the default configured in the app.")
                      : t("tmdb_api_key_remove_subtitle", {}, "Remove the TMDB key saved for this profile.")
                  })
                : ""
            }
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:modernHome",
              title: t("tmdb_modern_home_title", {}, "Enable on Modern Home"),
              subtitle: t("tmdb_modern_home_subtitle", {}, "Also apply TMDB enrichment to Modern Home hero and focused cards"),
              checked: Boolean(model.tmdb.modernHomeEnabled),
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:continueWatching",
              title: t("tmdb_enrich_continue_watching_title", {}, "Enrich Continue Watching"),
              subtitle: t("tmdb_enrich_continue_watching_subtitle", {}, "Apply TMDB enrichment to Continue Watching items"),
              checked: model.tmdb.enrichContinueWatching !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderActionRow({
              focusKey: "integration:tmdb:language",
              title: t("settings.integration.tmdb.language.title"),
              subtitle: t("settings.integration.tmdb.language.subtitle"),
              value: labelForTmdbLanguage(model.tmdb.language),
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:artwork",
              title: t("settings.integration.tmdb.artwork.title"),
              subtitle: t("settings.integration.tmdb.artwork.subtitle"),
              checked: Boolean(model.tmdb.useArtwork),
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:basic",
              title: t("settings.integration.tmdb.basicInfo.title"),
              subtitle: t("settings.integration.tmdb.basicInfo.subtitle"),
              checked: Boolean(model.tmdb.useBasicInfo),
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:details",
              title: t("settings.integration.tmdb.details.title"),
              subtitle: t("settings.integration.tmdb.details.subtitle"),
              checked: Boolean(model.tmdb.useDetails),
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:releaseDates",
              title: t("tmdb_release_dates_title", {}, "Release Dates"),
              subtitle: t("tmdb_release_dates_subtitle", {}, "Release and air dates from TMDB"),
              checked: model.tmdb.useReleaseDates !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:credits",
              title: t("tmdb_credits_title", {}, "Credits"),
              subtitle: t("tmdb_credits_subtitle", {}, "Cast with photos, director, and writer from TMDB"),
              checked: model.tmdb.useCredits !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:productions",
              title: t("tmdb_productions_title", {}, "Productions"),
              subtitle: t("tmdb_productions_subtitle", {}, "Production companies from TMDB"),
              checked: model.tmdb.useProductions !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:networks",
              title: t("tmdb_networks_title", {}, "Networks"),
              subtitle: t("tmdb_networks_subtitle", {}, "Networks with logos from TMDB"),
              checked: model.tmdb.useNetworks !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:episodes",
              title: t("tmdb_episodes_title", {}, "Episodes"),
              subtitle: t("tmdb_episodes_subtitle", {}, "Episode titles, overviews, thumbnails, and runtime from TMDB"),
              checked: model.tmdb.useEpisodes !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:trailers",
              title: t("tmdb_trailers_title", {}, "Trailers"),
              subtitle: t("tmdb_trailers_subtitle", {}, "Trailer candidates from TMDB videos for the detail trailer section"),
              checked: model.tmdb.useTrailers !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:moreLikeThis",
              title: t("tmdb_more_like_this_title", {}, "More Like This"),
              subtitle: t("tmdb_more_like_this_subtitle", {}, "TMDB recommendation backdrops on detail page"),
              checked: model.tmdb.useMoreLikeThis !== false,
              disabled: !model.tmdb.enabled
            })}
            ${this.renderToggleRow({
              focusKey: "integration:tmdb:collections",
              title: t("tmdb_collections_title", {}, "Collections"),
              subtitle: t("tmdb_collections_subtitle", {}, "TMDB movie collections in release order"),
              checked: model.tmdb.useCollections !== false,
              disabled: !model.tmdb.enabled
            })}
          </div>
        </div>
      `;
}
