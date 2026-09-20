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

import { numberOrNull } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";

export function normalizeContinueWatchingSortModeForAndroid(value) {
  const normalized = String(value || "default")
    .trim()
    .toLowerCase();
  if (normalized === "split_upcoming" || normalized === "split-upcoming" || normalized === "splitupcoming") {
    return "SPLIT_UPCOMING";
  }
  return normalized === "streaming_style" || normalized === "streaming-style" || normalized === "streamingstyle"
    ? "STREAMING_STYLE"
    : "DEFAULT";
}

export function normalizeContinueWatchingSortModeForWeb(value) {
  const normalized = String(value || "default")
    .trim()
    .toLowerCase();
  if (normalized === "split_upcoming" || normalized === "split-upcoming" || normalized === "splitupcoming") {
    return "split_upcoming";
  }
  return normalized === "streaming_style" || normalized === "streaming-style" || normalized === "streamingstyle"
    ? "streaming_style"
    : "default";
}

export function normalizeTmdbLanguageForAndroid(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/_/g, "-");
  if (!normalized) {
    return "en";
  }

  // Android's TMDB catalogue stores Portuguese (Brazil) as lowercase "pt-br".
  return normalized === "pt-BR" ? "pt-br" : normalized;
}

export function normalizeTmdbLanguageForWeb(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/_/g, "-");
  if (!normalized) {
    return "en";
  }

  switch (normalized.toLowerCase()) {
    case "en":
    case "en-us":
      return "en";
    case "en-au":
      return "en-AU";
    case "en-ca":
      return "en-CA";
    case "en-gb":
      return "en-GB";
    case "it-it":
      return "it";
    case "es-es":
      return "es";
    case "pt-pt":
      return "pt";
    default:
      return normalized.toLowerCase();
  }
}

export function hexToAndroidColorInt(value, fallback = "#ffffff", alphaPercent = 100) {
  const match = String(value || fallback)
    .trim()
    .match(/^#([0-9a-f]{6})$/i);
  const hex = match ? match[1] : String(fallback || "#ffffff").replace(/^#/, "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const alpha = Math.round((normalizeSubtitleTextOpacity(alphaPercent) / 100) * 0xff);
  return (alpha << 24) | (red << 16) | (green << 8) | blue;
}

export function androidColorIntToHex(value, fallback = "#ffffff") {
  const parsed = numberOrNull(value);
  if (parsed == null) {
    return fallback;
  }
  const unsigned = parsed >>> 0;
  return `#${unsigned.toString(16).slice(-6).padStart(6, "0")}`;
}

export function cssColorToAndroidColorInt(value, fallback = "#00000000") {
  const match = String(value || fallback)
    .trim()
    .match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  const rgb = match?.[1] || "000000";
  const alpha = match?.[2] || "ff";
  return parseInt(`${alpha}${rgb}`, 16) | 0;
}

export function androidColorIntToCss(value, fallback = "#00000000") {
  const parsed = numberOrNull(value);
  if (parsed == null) return fallback;
  const argb = (parsed >>> 0).toString(16).padStart(8, "0");
  return `#${argb.slice(2)}${argb.slice(0, 2)}`.toUpperCase();
}
