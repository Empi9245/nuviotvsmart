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

export const PULL_RPC = "sync_pull_profile_settings_blob";

export const PUSH_RPC = "sync_push_profile_settings_blob";

export const SETTINGS_SYNC_PLATFORM = "tv";

export const CACHE_KEY = "profileSettingsSyncCache";

export const syncInFlightByProfile = new Map();

export const EXCLUDED_PROFILE_KEYS = {
  layout_settings: new Set(["search_discover_enabled"]),
  player_settings: new Set(["audio_amplification_db", "persist_audio_amplification"]),
  mdblist_settings: new Set(["mdblist_api_key"]),
  debrid_settings: new Set([
    "torbox_api_key",
    "premiumize_api_key",
    "real_debrid_api_key",
    "stream_badges_enabled",
    "stream_show_badges",
    "show_stream_badges"
  ]),
  animeskip_settings: new Set(["animeskip_client_id"])
};

export function profileSettingsExcludedKeys(featureName) {
  return Array.from(EXCLUDED_PROFILE_KEYS[String(featureName || "").trim()] || []).sort();
}

export function withoutExcludedProfileSettingsKeys(featureName, featurePayload = {}) {
  const sanitized = cloneValue(featurePayload) || {};
  EXCLUDED_PROFILE_KEYS[featureName]?.forEach((key) => delete sanitized[key]);
  return sanitized;
}

export function resolveProfileId(profileId = null) {
  const raw = Number(profileId ?? ProfileManager.getActiveProfileId() ?? 1);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return 1;
}

export async function withProfileSettingsSyncLock(profileId, task) {
  const key = String(resolveProfileId(profileId));
  const previous = syncInFlightByProfile.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  syncInFlightByProfile.set(key, current);
  await previous.catch(() => false);
  try {
    return await task();
  } finally {
    release();
    if (syncInFlightByProfile.get(key) === current) {
      syncInFlightByProfile.delete(key);
    }
  }
}

export function cloneValue(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isEncodedPreferenceValue(value) {
  return isPlainObject(value) && typeof value.type === "string" && Object.prototype.hasOwnProperty.call(value, "value");
}

export function normalizeFeaturePayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const cloned = cloneValue(value) || {};
  return Object.entries(cloned).reduce((accumulator, [key, entry]) => {
    if (isPlainObject(entry) && typeof entry.type === "string" && Object.prototype.hasOwnProperty.call(entry, "value")) {
      accumulator[key] = entry.value;
    } else {
      accumulator[key] = entry;
    }
    return accumulator;
  }, {});
}

export function normalizeBlob(blob = {}) {
  const features = isPlainObject(blob?.features) ? blob.features : {};
  return {
    version: Number(blob?.version || 1) || 1,
    features: Object.entries(features).reduce((accumulator, [featureName, featureValue]) => {
      const normalizedFeatureName = String(featureName || "").trim();
      if (!normalizedFeatureName || !isPlainObject(featureValue)) {
        return accumulator;
      }
      accumulator[normalizedFeatureName] = cloneValue(featureValue) || {};
      return accumulator;
    }, {})
  };
}

export function shouldSerializeLayoutStringArrayAsString(featureName = "", keyName = "") {
  return (
    String(featureName || "").trim() === "layout_settings" &&
    ["hero_catalog_keys", "home_catalog_order_keys", "disabled_home_catalog_keys"].includes(String(keyName || "").trim())
  );
}

export function encodePreferenceValue(value, keyName = "", featureName = "") {
  if (isEncodedPreferenceValue(value)) {
    if (shouldSerializeLayoutStringArrayAsString(featureName, keyName) && value.type === "string_set") {
      const normalized = Array.isArray(value.value) ? value.value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
      return { type: "string", value: JSON.stringify(Array.from(new Set(normalized)).sort()) };
    }
    return cloneValue(value);
  }
  if (typeof value === "string") {
    return { type: "string", value };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? { type: "int", value: Math.trunc(value) } : { type: "float", value };
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    const normalized = Array.from(new Set(value)).sort();
    if (shouldSerializeLayoutStringArrayAsString(featureName, keyName)) {
      return { type: "string", value: JSON.stringify(normalized) };
    }
    return { type: "string_set", value: normalized };
  }
  return null;
}

export function encodeFeaturePayload(featurePayload = {}, featureName = "") {
  if (!isPlainObject(featurePayload)) {
    return {};
  }
  return Object.entries(featurePayload).reduce((accumulator, [key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return accumulator;
    }
    const encodedValue = encodePreferenceValue(value, normalizedKey, featureName);
    if (encodedValue) {
      accumulator[normalizedKey] = encodedValue;
    }
    return accumulator;
  }, {});
}

export function readCache() {
  const cached = LocalStore.get(CACHE_KEY, {}) || {};
  return isPlainObject(cached) ? cached : {};
}

export function setCachedBlob(profileId, blob) {
  const cache = readCache();
  cache[String(resolveProfileId(profileId))] = normalizeBlob(blob);
  LocalStore.set(CACHE_KEY, cache);
}

export function shouldTreatAsMissingResource(error) {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  if (typeof error.code === "string" && (error.code === "PGRST202" || error.code === "PGRST205")) {
    return true;
  }
  const message = String(error.message || "");
  return (
    message.includes("PGRST202") ||
    message.includes("PGRST205") ||
    message.includes("Could not find the function") ||
    message.includes("Could not find the table")
  );
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

export function booleanFromAnyKey(raw = {}, keys = []) {
  for (const key of keys) {
    if (booleanOrNull(raw[key]) != null) {
      return Boolean(raw[key]);
    }
  }
  return null;
}

export function stringOrNull(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function normalizeNextEpisodeThresholdModeForSync(value) {
  const mode = String(value || "")
    .trim()
    .toUpperCase();
  return mode === "MINUTES_BEFORE_END" ? "MINUTES_BEFORE_END" : "PERCENTAGE";
}
