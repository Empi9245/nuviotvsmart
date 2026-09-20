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

export const mdblist_settings = {
  export(profileId) {
    const settings = MdbListSettingsStore.getForProfile(profileId);
    return {
      mdblist_enabled: Boolean(settings.enabled),
      mdblist_api_key: String(settings.apiKey || "").trim(),
      mdblist_show_trakt: settings.showTrakt !== false,
      mdblist_show_imdb: settings.showImdb !== false,
      mdblist_show_tmdb: settings.showTmdb !== false,
      mdblist_show_letterboxd: settings.showLetterboxd !== false,
      mdblist_show_tomatoes: settings.showTomatoes !== false,
      mdblist_show_audience: settings.showAudience !== false,
      mdblist_show_metacritic: settings.showMetacritic !== false,
      mdblist_show_mal: settings.showMal !== false
    };
  },
  project(rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const projected = {};
    if (booleanOrNull(raw.mdblist_enabled) != null) {
      projected.mdblist_enabled = Boolean(raw.mdblist_enabled);
    }
    if (raw.mdblist_api_key != null) {
      projected.mdblist_api_key = String(raw.mdblist_api_key || "").trim();
    }
    [
      "mdblist_show_trakt",
      "mdblist_show_imdb",
      "mdblist_show_tmdb",
      "mdblist_show_letterboxd",
      "mdblist_show_tomatoes",
      "mdblist_show_audience",
      "mdblist_show_metacritic",
      "mdblist_show_mal"
    ].forEach((key) => {
      if (booleanOrNull(raw[key]) != null) {
        projected[key] = Boolean(raw[key]);
      }
    });
    return projected;
  },
  import(profileId, rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const partial = {};
    if (booleanOrNull(raw.mdblist_enabled) != null) {
      partial.enabled = Boolean(raw.mdblist_enabled);
    }
    if (raw.mdblist_api_key != null) {
      partial.apiKey = String(raw.mdblist_api_key || "").trim();
    }
    if (booleanOrNull(raw.mdblist_show_trakt) != null) {
      partial.showTrakt = Boolean(raw.mdblist_show_trakt);
    }
    if (booleanOrNull(raw.mdblist_show_imdb) != null) {
      partial.showImdb = Boolean(raw.mdblist_show_imdb);
    }
    if (booleanOrNull(raw.mdblist_show_tmdb) != null) {
      partial.showTmdb = Boolean(raw.mdblist_show_tmdb);
    }
    if (booleanOrNull(raw.mdblist_show_letterboxd) != null) {
      partial.showLetterboxd = Boolean(raw.mdblist_show_letterboxd);
    }
    if (booleanOrNull(raw.mdblist_show_tomatoes) != null) {
      partial.showTomatoes = Boolean(raw.mdblist_show_tomatoes);
    }
    if (booleanOrNull(raw.mdblist_show_audience) != null) {
      partial.showAudience = Boolean(raw.mdblist_show_audience);
    }
    if (booleanOrNull(raw.mdblist_show_metacritic) != null) {
      partial.showMetacritic = Boolean(raw.mdblist_show_metacritic);
    }
    if (booleanOrNull(raw.mdblist_show_mal) != null) {
      partial.showMal = Boolean(raw.mdblist_show_mal);
    }
    if (!Object.keys(partial).length) {
      return false;
    }
    MdbListSettingsStore.setForProfile(profileId, partial, { silentSync: true });
    return true;
  }
};
