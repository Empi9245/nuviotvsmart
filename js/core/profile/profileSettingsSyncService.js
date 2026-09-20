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
import {
  TraktSettingsStore,
  normalizeTraktContinueWatchingDaysCap
} from "../../data/local/traktSettingsStore.js";
import { AnimeSkipSettingsStore } from "../../data/local/animeSkipSettingsStore.js";
import { StreamBadgeSettingsStore } from "../../data/local/streamBadgeSettingsStore.js";
import {
  ANDROID_DEBRID_STREAM_DESCRIPTION_TEMPLATE,
  DebridSettingsStore,
  normalizeDebridStreamPreferences
} from "../../data/local/debridSettingsStore.js";
import {
  parseStreamBadgeRulesFromPayload,
  normalizeStreamBadgeRules
} from "../../core/streams/streamBadgeRules.js";
import { ProfileManager } from "./profileManager.js";
import {
  clearProfileSettingsCloudSyncPending,
  getProfileSettingsCloudSyncPendingVersion,
  hasProfileSettingsCloudSyncPending
} from "../../data/local/profileScopedStore.js";
import { isSyncBackoffActive } from "../sync/syncBackoffPolicy.js";
import { normalizeSubtitleVerticalOffset } from "../player/subtitleVerticalOffset.js";
import {
  androidColorIntToSubtitleTextOpacity,
  normalizeSubtitleTextOpacity
} from "../player/subtitleTextOpacity.js";
import { isFastHorizontalNavigationEnabled } from "../../platform/sharedKeys.js";

import { createProfileSettingsSyncServiceMethods01 } from "./profileSettingsSyncServiceMethods-01-pull.js";

import { PULL_RPC } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { PUSH_RPC } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { SETTINGS_SYNC_PLATFORM } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { CACHE_KEY } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { syncInFlightByProfile } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { EXCLUDED_PROFILE_KEYS } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { profileSettingsExcludedKeys } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { withoutExcludedProfileSettingsKeys } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { resolveProfileId } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { withProfileSettingsSyncLock } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { cloneValue } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { isPlainObject } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { isEncodedPreferenceValue } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { normalizeFeaturePayload } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { normalizeBlob } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { shouldSerializeLayoutStringArrayAsString } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { encodePreferenceValue } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { encodeFeaturePayload } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { readCache } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { setCachedBlob } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { shouldTreatAsMissingResource } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { stableStringify } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { numberOrNull } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { booleanOrNull } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { booleanFromAnyKey } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { stringOrNull } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { normalizeNextEpisodeThresholdModeForSync } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import { normalizeHalfStepForSync } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeStillWatchingThresholdForSync } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { extractLanguageCode } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeSubtitleLanguage } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizePreferredSubtitleLanguageForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeSecondarySubtitleLanguageForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { shouldUseForcedSubtitlesForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeAudioLanguageForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeAudioLanguageForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeSecondaryAudioLanguageForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeHomeLayoutForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeHomeLayoutForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeDiscoverLocationForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeDiscoverLocationForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTrailerTargetForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTrailerTargetForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTraktWatchProgressSourceForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTraktWatchProgressSourceForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTraktLibrarySourceForAndroid } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeTraktLibrarySourceForWeb } from "./profileSettingsSyncServiceHelpers-02-normalize-half-step-for-sync.js";
import { normalizeContinueWatchingSortModeForAndroid } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { normalizeContinueWatchingSortModeForWeb } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { normalizeTmdbLanguageForAndroid } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { normalizeTmdbLanguageForWeb } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { hexToAndroidColorInt } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { androidColorIntToHex } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { cssColorToAndroidColorInt } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { androidColorIntToCss } from "./profileSettingsSyncServiceHelpers-03-normalize-continue-watching-sort-mode-for-android.js";
import { FEATURE_ADAPTERS } from "./profileSettingsSyncServiceHelpers-04-feature-adapters.js";
import { SUPPORTED_FEATURE_NAMES } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { buildComparableFeaturesFromBlob } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { buildComparableFeaturesFromLocal } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { buildComparableSignatureFromBlob } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { buildComparableSignatureFromLocal } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { buildOutgoingBlob } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { extractBlobFromResponse } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { pullRemoteBlob } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { applyRemoteBlob } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { pullProfileSettingsUnlocked } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { pushProfileSettingsUnlocked } from "./profileSettingsSyncServiceHelpers-05-supported-feature-names.js";

export {
  LocalStore,
  AuthManager,
  SupabaseApi,
  accentColorForTheme,
  ThemeStore,
  LayoutPreferences,
  ExperienceModeStore,
  TrackPreferencesStore,
  ContinueWatchingPreferences,
  PlayerSettingsStore,
  TmdbSettingsStore,
  MdbListSettingsStore,
  TraktSettingsStore,
  normalizeTraktContinueWatchingDaysCap,
  AnimeSkipSettingsStore,
  StreamBadgeSettingsStore,
  ANDROID_DEBRID_STREAM_DESCRIPTION_TEMPLATE,
  DebridSettingsStore,
  normalizeDebridStreamPreferences,
  parseStreamBadgeRulesFromPayload,
  normalizeStreamBadgeRules,
  ProfileManager,
  clearProfileSettingsCloudSyncPending,
  getProfileSettingsCloudSyncPendingVersion,
  hasProfileSettingsCloudSyncPending,
  isSyncBackoffActive,
  normalizeSubtitleVerticalOffset,
  androidColorIntToSubtitleTextOpacity,
  normalizeSubtitleTextOpacity,
  isFastHorizontalNavigationEnabled,
  PULL_RPC,
  PUSH_RPC,
  SETTINGS_SYNC_PLATFORM,
  CACHE_KEY,
  syncInFlightByProfile,
  EXCLUDED_PROFILE_KEYS,
  resolveProfileId,
  withProfileSettingsSyncLock,
  cloneValue,
  isPlainObject,
  isEncodedPreferenceValue,
  normalizeFeaturePayload,
  normalizeBlob,
  shouldSerializeLayoutStringArrayAsString,
  encodeFeaturePayload,
  readCache,
  setCachedBlob,
  shouldTreatAsMissingResource,
  stableStringify,
  numberOrNull,
  booleanOrNull,
  booleanFromAnyKey,
  stringOrNull,
  normalizeNextEpisodeThresholdModeForSync,
  normalizeHalfStepForSync,
  normalizeStillWatchingThresholdForSync,
  extractLanguageCode,
  normalizeSubtitleLanguage,
  normalizePreferredSubtitleLanguageForAndroid,
  normalizeSecondarySubtitleLanguageForAndroid,
  shouldUseForcedSubtitlesForAndroid,
  normalizeAudioLanguageForAndroid,
  normalizeAudioLanguageForWeb,
  normalizeSecondaryAudioLanguageForAndroid,
  normalizeHomeLayoutForAndroid,
  normalizeHomeLayoutForWeb,
  normalizeDiscoverLocationForAndroid,
  normalizeDiscoverLocationForWeb,
  normalizeTrailerTargetForAndroid,
  normalizeTrailerTargetForWeb,
  normalizeTraktWatchProgressSourceForAndroid,
  normalizeTraktWatchProgressSourceForWeb,
  normalizeTraktLibrarySourceForAndroid,
  normalizeTraktLibrarySourceForWeb,
  normalizeContinueWatchingSortModeForAndroid,
  normalizeContinueWatchingSortModeForWeb,
  normalizeTmdbLanguageForAndroid,
  normalizeTmdbLanguageForWeb,
  hexToAndroidColorInt,
  androidColorIntToHex,
  cssColorToAndroidColorInt,
  androidColorIntToCss,
  FEATURE_ADAPTERS,
  SUPPORTED_FEATURE_NAMES,
  buildComparableFeaturesFromBlob,
  buildComparableFeaturesFromLocal,
  buildComparableSignatureFromBlob,
  buildComparableSignatureFromLocal,
  buildOutgoingBlob,
  extractBlobFromResponse,
  pullRemoteBlob,
  applyRemoteBlob,
  pullProfileSettingsUnlocked,
  pushProfileSettingsUnlocked
};

export const ProfileSettingsSyncService = {
  ...createProfileSettingsSyncServiceMethods01()
};
