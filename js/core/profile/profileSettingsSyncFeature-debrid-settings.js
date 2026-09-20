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

export const debrid_settings = {
  export(profileId) {
    const settings = DebridSettingsStore.getForProfile(profileId);
    return {
      debrid_enabled: Boolean(settings.enabled),
      cloud_library_enabled: settings.cloudLibraryEnabled !== false,
      torbox_api_key: String(settings.torboxApiKey || "").trim(),
      premiumize_api_key: String(settings.premiumizeApiKey || "").trim(),
      real_debrid_api_key: String(settings.realDebridApiKey || "").trim(),
      preferred_resolver_provider_id: String(settings.preferredResolverProviderId || "").trim(),
      instant_playback_preparation_limit: Math.max(0, Math.min(5, Math.trunc(Number(settings.instantPlaybackPreparationLimit || 0)))),
      stream_max_results: Math.max(0, Math.min(100, Math.trunc(Number(settings.streamMaxResults || 0)))),
      stream_sort_mode: String(settings.streamSortMode || "DEFAULT").toUpperCase(),
      stream_minimum_quality: String(settings.streamMinimumQuality || "ANY").toUpperCase(),
      stream_dolby_vision_filter: String(settings.streamDolbyVisionFilter || "ANY").toUpperCase(),
      stream_hdr_filter: String(settings.streamHdrFilter || "ANY").toUpperCase(),
      stream_codec_filter: String(settings.streamCodecFilter || "ANY").toUpperCase(),
      stream_preferences: JSON.stringify(normalizeDebridStreamPreferences(settings.streamPreferences)),
      debrid_stream_name_template: String(settings.streamNameTemplate || ""),
      debrid_stream_description_template: String(settings.streamDescriptionTemplate ?? ANDROID_DEBRID_STREAM_DESCRIPTION_TEMPLATE)
    };
  },
  project(rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const projected = {};
    ["debrid_enabled", "cloud_library_enabled"].forEach((key) => {
      if (booleanOrNull(raw[key]) != null) {
        projected[key] = Boolean(raw[key]);
      }
    });
    [
      "torbox_api_key",
      "premiumize_api_key",
      "real_debrid_api_key",
      "preferred_resolver_provider_id",
      "stream_sort_mode",
      "stream_minimum_quality",
      "stream_dolby_vision_filter",
      "stream_hdr_filter",
      "stream_codec_filter",
      "debrid_stream_name_template",
      "debrid_stream_description_template"
    ].forEach((key) => {
      if (raw[key] != null) {
        projected[key] = String(raw[key] || "").trim();
      }
    });
    if (raw.stream_preferences != null) {
      projected.stream_preferences = JSON.stringify(normalizeDebridStreamPreferences(String(raw.stream_preferences || "").trim()));
    }
    ["instant_playback_preparation_limit", "stream_max_results"].forEach((key) => {
      if (numberOrNull(raw[key]) != null) {
        const max = key === "instant_playback_preparation_limit" ? 5 : 100;
        projected[key] = Math.max(0, Math.min(max, Math.trunc(Number(raw[key]))));
      }
    });
    return projected;
  },
  import(profileId, rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const partial = {};
    if (booleanOrNull(raw.debrid_enabled) != null) {
      partial.enabled = Boolean(raw.debrid_enabled);
    }
    if (booleanOrNull(raw.cloud_library_enabled) != null) {
      partial.cloudLibraryEnabled = Boolean(raw.cloud_library_enabled);
    }
    if (raw.torbox_api_key != null) {
      partial.torboxApiKey = String(raw.torbox_api_key || "").trim();
    }
    if (raw.premiumize_api_key != null) {
      partial.premiumizeApiKey = String(raw.premiumize_api_key || "").trim();
    }
    if (raw.real_debrid_api_key != null) {
      partial.realDebridApiKey = String(raw.real_debrid_api_key || "").trim();
    }
    if (raw.preferred_resolver_provider_id != null) {
      partial.preferredResolverProviderId = String(raw.preferred_resolver_provider_id || "").trim();
    }
    if (numberOrNull(raw.instant_playback_preparation_limit) != null) {
      partial.instantPlaybackPreparationLimit = Math.max(0, Math.min(5, Math.trunc(Number(raw.instant_playback_preparation_limit))));
    }
    if (numberOrNull(raw.stream_max_results) != null) {
      partial.streamMaxResults = Math.max(0, Math.min(100, Math.trunc(Number(raw.stream_max_results))));
    }
    if (raw.stream_sort_mode != null) {
      partial.streamSortMode = String(raw.stream_sort_mode || "DEFAULT")
        .trim()
        .toUpperCase();
    }
    if (raw.stream_minimum_quality != null) {
      partial.streamMinimumQuality = String(raw.stream_minimum_quality || "ANY")
        .trim()
        .toUpperCase();
    }
    if (raw.stream_dolby_vision_filter != null) {
      partial.streamDolbyVisionFilter = String(raw.stream_dolby_vision_filter || "ANY")
        .trim()
        .toUpperCase();
    }
    if (raw.stream_hdr_filter != null) {
      partial.streamHdrFilter = String(raw.stream_hdr_filter || "ANY")
        .trim()
        .toUpperCase();
    }
    if (raw.stream_codec_filter != null) {
      partial.streamCodecFilter = String(raw.stream_codec_filter || "ANY")
        .trim()
        .toUpperCase();
    }
    if (raw.stream_preferences != null) {
      partial.streamPreferences = normalizeDebridStreamPreferences(String(raw.stream_preferences || "").trim());
    }
    if (raw.debrid_stream_name_template != null) {
      partial.streamNameTemplate = String(raw.debrid_stream_name_template || "");
    }
    if (raw.debrid_stream_description_template != null) {
      partial.streamDescriptionTemplate = String(raw.debrid_stream_description_template || "");
    }
    if (!Object.keys(partial).length) {
      return false;
    }
    DebridSettingsStore.setForProfile(profileId, partial, { silentSync: true });
    return true;
  }
};
