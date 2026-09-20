import { LocalStore } from "../storage/localStore.js";

import { AuthManager } from "../auth/authManager.js";

import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";

import { accentColorForTheme, ThemeStore } from "../../data/local/themeStore.js";

import { LayoutPreferences } from "../../data/local/layoutPreferences.js";

import { ExperienceModeStore } from "../../data/local/experienceModeStore.js";

import { TrackPreferencesStore } from "../../data/local/trackPreferencesStore.js";

import { ContinueWatchingPreferences } from "../../data/local/continueWatchingPreferences.js";

import { PlayerSettingsStore } from "../../data/local/playerSettingsStore.js";

import { TmdbSettingsStore } from "../../data/local/tmdbSettingsStore.js";

import { MdbListSettingsStore } from "../../data/local/mdbListSettingsStore.js";

import { TraktSettingsStore, normalizeTraktContinueWatchingDaysCap } from "../../data/local/traktSettingsStore.js";

import { AnimeSkipSettingsStore } from "../../data/local/animeSkipSettingsStore.js";

import { StreamBadgeSettingsStore } from "../../data/local/streamBadgeSettingsStore.js";

import {
  ANDROID_DEBRID_STREAM_DESCRIPTION_TEMPLATE,
  DebridSettingsStore,
  normalizeDebridStreamPreferences
} from "../../data/local/debridSettingsStore.js";

import { parseStreamBadgeRulesFromPayload, normalizeStreamBadgeRules } from "../../core/streams/streamBadgeRules.js";

import { ProfileManager } from "./profileManager.js";

import {
  clearProfileSettingsCloudSyncPending,
  getProfileSettingsCloudSyncPendingVersion,
  hasProfileSettingsCloudSyncPending
} from "../../data/local/profileScopedStore.js";

import { isSyncBackoffActive } from "../sync/syncBackoffPolicy.js";

import { normalizeSubtitleVerticalOffset } from "../player/subtitleVerticalOffset.js";

import { androidColorIntToSubtitleTextOpacity, normalizeSubtitleTextOpacity } from "../player/subtitleTextOpacity.js";

import { isFastHorizontalNavigationEnabled } from "../../platform/sharedKeys.js";

import {
  normalizeFeaturePayload,
  stringOrNull,
  booleanOrNull,
  numberOrNull,
  normalizeNextEpisodeThresholdModeForSync,
  booleanFromAnyKey
} from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";

import {
  normalizeHomeLayoutForAndroid,
  normalizeDiscoverLocationForAndroid,
  normalizeTrailerTargetForAndroid,
  normalizeHomeLayoutForWeb,
  normalizeDiscoverLocationForWeb,
  normalizeTrailerTargetForWeb,
  normalizeAudioLanguageForAndroid,
  normalizeSecondaryAudioLanguageForAndroid,
  normalizePreferredSubtitleLanguageForAndroid,
  normalizeSecondarySubtitleLanguageForAndroid,
  shouldUseForcedSubtitlesForAndroid,
  normalizeStillWatchingThresholdForSync,
  normalizeHalfStepForSync,
  normalizeSubtitleLanguage,
  normalizeAudioLanguageForWeb,
  normalizeTraktWatchProgressSourceForAndroid,
  normalizeTraktLibrarySourceForAndroid,
  normalizeTraktWatchProgressSourceForWeb,
  normalizeTraktLibrarySourceForWeb
} from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";

import {
  normalizeContinueWatchingSortModeForAndroid,
  normalizeContinueWatchingSortModeForWeb,
  hexToAndroidColorInt,
  cssColorToAndroidColorInt,
  androidColorIntToHex,
  androidColorIntToCss,
  normalizeTmdbLanguageForAndroid,
  normalizeTmdbLanguageForWeb
} from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";

export const theme_settings = {
  export(profileId) {
    const theme = ThemeStore.getForProfile(profileId);
    return {
      selected_theme: String(theme.themeName || "WHITE").toUpperCase(),
      selected_font: String(theme.fontFamily || "INTER").toUpperCase(),
      amoled_mode: Boolean(theme.amoledMode),
      amoled_surfaces_mode: Boolean(theme.amoledSurfacesMode),
      settings_ui_style: String(theme.settingsUiStyle || "CLASSIC").toUpperCase()
    };
  },
  project(rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const projected = {};
    if (stringOrNull(raw.selected_theme)) {
      projected.selected_theme = String(raw.selected_theme).toUpperCase();
    }
    if (stringOrNull(raw.selected_font)) {
      projected.selected_font = String(raw.selected_font).toUpperCase();
    }
    if (booleanOrNull(raw.amoled_mode) != null) {
      projected.amoled_mode = Boolean(raw.amoled_mode);
    }
    if (booleanOrNull(raw.amoled_surfaces_mode) != null) {
      projected.amoled_surfaces_mode = Boolean(raw.amoled_surfaces_mode);
    }
    if (stringOrNull(raw.settings_ui_style)) projected.settings_ui_style = String(raw.settings_ui_style).toUpperCase();
    return projected;
  },
  import(profileId, rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const partial = {};
    if (stringOrNull(raw.selected_theme)) {
      const selectedTheme = String(raw.selected_theme).toUpperCase();
      partial.themeName = selectedTheme;
      partial.accentColor = accentColorForTheme(selectedTheme);
    }
    if (stringOrNull(raw.selected_font)) {
      partial.fontFamily = String(raw.selected_font).toUpperCase();
    }
    if (booleanOrNull(raw.amoled_mode) != null) {
      partial.amoledMode = Boolean(raw.amoled_mode);
    }
    if (booleanOrNull(raw.amoled_surfaces_mode) != null) {
      partial.amoledSurfacesMode = Boolean(raw.amoled_surfaces_mode);
    }
    if (stringOrNull(raw.settings_ui_style)) partial.settingsUiStyle = String(raw.settings_ui_style).toUpperCase();
    if (!Object.keys(partial).length) {
      return false;
    }
    ThemeStore.setForProfile(profileId, partial, { silentSync: true });
    return true;
  }
};
