import { Router } from "../../navigation/routerState.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { I18n } from "../../../i18n/index.js";
import { TraktClientSettingsStore, getTraktClientCredentials } from "../../../data/local/traktClientSettingsStore.js";
import { TraktAuthService } from "../../../data/repository/traktAuthService.js";

const t = (key, fallback) => I18n.t(key, {}, { fallback });

export function renderTraktClientCredentialRows({ prefix = "integration:trakt", onSaved = null } = {}) {
  const profileId = String(ProfileManager.getActiveProfileId() || "1");
  const settings = TraktClientSettingsStore.get(profileId);
  const effective = getTraktClientCredentials(profileId);
  const configuredLabel = t("trakt_client_value_set", "Configured");
  const defaultLabel = t("trakt_client_value_default", "App default");
  const unsetLabel = t("mdblist_not_set", "Not set");
  const titles = {
    clientId: t("trakt_client_id_title", "Client ID"),
    clientSecret: t("trakt_client_secret_title", "Client Secret")
  };
  const save = async (field, value) => {
    if (String(ProfileManager.getActiveProfileId() || "1") !== profileId) return false;
    this.stopTraktPolling?.();
    TraktClientSettingsStore.set({ [field]: String(value || "").trim() }, profileId);
    this.traktStats = null;
    this.traktStatusMessage = null;
    this.traktErrorMessage = null;
    await onSaved?.();
    return true;
  };
  return ["clientId", "clientSecret"]
    .map((field) => {
      const focusKey = `${prefix}:${field}`;
      this.actionMap.set(focusKey, () =>
        this.openTextDialog({
          title: `Trakt — ${titles[field]}`,
          value: TraktClientSettingsStore.get(profileId)[field],
          inputType: "password",
          placeholder: titles[field],
          returnFocusKey: focusKey,
          clearLabel: t("action_clear", "Clear"),
          onClear: () => save(field, ""),
          onSubmit: (value) => save(field, value)
        })
      );
      return this.renderActionRow({
        focusKey,
        title: titles[field],
        subtitle: t("trakt_client_credentials_local", "Saved on this device for the current profile"),
        value: settings[field] ? configuredLabel : effective[field] ? defaultLabel : unsetLabel
      });
    })
    .join("");
}

export function renderTraktIntegrationDetail() {
  this.actionMap.set("integration:trakt:account", () => Router.navigate("trakt"));
  return `
    ${this.renderSectionHeader({ label: "Trakt", subtitle: t("trakt_client_settings_subtitle", "Configure app credentials and connect your Trakt account") })}
    <div class="settings-group-card settings-group-card-fill"><div class="settings-stack">
      ${this.renderActionRow({
        focusKey: "integration:back",
        title: t("settings_integration_back", "Back to integrations"),
        icon: "back"
      })}
      ${renderTraktClientCredentialRows.call(this)}
      ${this.renderActionRow({
        focusKey: "integration:trakt:account",
        title: t("trakt_account_login", "Trakt account"),
        subtitle: TraktAuthService.hasRequiredCredentials()
          ? t("trakt_login_instruction_short", "Open tracking to connect your Trakt account")
          : t("trakt_missing_credentials", "Set your Client ID and Client Secret in Integrations > Trakt")
      })}
    </div></div>`;
}
