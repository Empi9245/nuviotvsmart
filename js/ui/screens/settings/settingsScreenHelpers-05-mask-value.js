import { Router } from "../../navigation/router.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { addonRepository } from "../../../data/repository/addonRepository.js";

import { LocalStore } from "../../../core/storage/localStore.js";

import { SessionStore } from "../../../core/storage/sessionStore.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { HomeCatalogStore } from "../../../data/local/homeCatalogStore.js";

import { accentColorForTheme, ThemeStore } from "../../../data/local/themeStore.js";

import { MemberAccessRepository } from "../../../data/remote/supabase/memberAccessRepository.js";

import { ThemeManager } from "../../theme/themeManager.js";

import { ThemeColors } from "../../theme/themeColors.js";

import { availableThemeIds, resolveThemeName } from "../../theme/themeAccess.js";

import { renderMemberBrandWordmark } from "../../components/memberBrandWordmark.js";

import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";

import {
  SUBTITLE_VERTICAL_OFFSET_DEFAULT,
  SUBTITLE_VERTICAL_OFFSET_MAX,
  SUBTITLE_VERTICAL_OFFSET_MIN,
  normalizeSubtitleVerticalOffset
} from "../../../core/player/subtitleVerticalOffset.js";

import {
  SUBTITLE_TEXT_OPACITY_MAX,
  SUBTITLE_TEXT_OPACITY_MIN,
  SUBTITLE_TEXT_OPACITY_STEP,
  normalizeSubtitleTextOpacity
} from "../../../core/player/subtitleTextOpacity.js";

import { TorrentSettingsStore } from "../../../data/local/torrentSettingsStore.js";

import { WebOsAudioCompatibilityStore } from "../../../data/local/webOsAudioCompatibilityStore.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";

import { MdbListSettingsStore } from "../../../data/local/mdbListSettingsStore.js";

import { AnimeSkipSettingsStore } from "../../../data/local/animeSkipSettingsStore.js";

import {
  DEBRID_SETTINGS_DEFAULTS,
  DEBRID_SORT_PROFILES,
  DEBRID_STREAM_AUDIO_CHANNELS,
  DEBRID_STREAM_AUDIO_TAGS,
  DEBRID_STREAM_ENCODES,
  DEBRID_STREAM_LANGUAGES,
  DEBRID_STREAM_QUALITIES,
  DEBRID_STREAM_RESOLUTIONS,
  DEBRID_STREAM_VISUAL_TAGS,
  DEFAULT_STREAM_PREFERENCES,
  normalizeDebridStreamPreferences,
  DebridSettingsStore
} from "../../../data/local/debridSettingsStore.js";

import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";

import { DebridApi } from "../../../data/remote/api/debridApi.js";

import { DEBRID_AUTH_METHODS, DebridProviders } from "../../../core/debrid/debridProviders.js";

import { DEBRID_DEVICE_AUTH_STATUS, DebridDeviceAuthService } from "../../../core/debrid/debridDeviceAuthService.js";

import { ProfileManager } from "../../../core/profile/profileManager.js";

import { AuthManager } from "../../../core/auth/authManager.js";

import { SupabaseApi } from "../../../data/remote/supabase/supabaseApi.js";

import { Platform } from "../../../platform/index.js";

import { TizenCapabilities } from "../../../platform/tizen/tizenCapabilities.js";

import { isFastHorizontalNavigationEnabled } from "../../../platform/sharedKeys.js";

import { CW_DISPLAY_SNAPSHOT_KEY, CW_ENRICHMENT_CACHE_KEY } from "../home/homeConstants.js";

import { I18n } from "../../../i18n/index.js";

import { isContentRtl } from "../../../core/util/contentTextDirection.js";

import { PluginManager } from "../../../core/player/pluginManager.js";

import { QrCodeGenerator } from "../../../core/qr/qrCodeGenerator.js";

import { TraktAuthService } from "../../../data/repository/traktAuthService.js";

import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";

import {
  getStreamBadgePreviewSections,
  normalizeStreamBadgeChipColor,
  STREAM_BADGE_IMPORT_LIMIT
} from "../../../core/streams/streamBadgeRules.js";

import {
  TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL,
  TraktLibrarySourceMode,
  TraktSettingsStore,
  WatchProgressSource
} from "../../../data/local/traktSettingsStore.js";

import {
  activateLegacySidebarAction,
  bindRootSidebarEvents,
  getRootSidebarNodes,
  getRootSidebarSelectedNode,
  getSidebarProfileState,
  isModernSidebarBlurAvailable,
  isSelectedSidebarAction,
  isRootSidebarNode,
  renderRootSidebar,
  setModernSidebarExpanded,
  setLegacySidebarExpanded
} from "../../components/sidebarNavigation.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { getLatestAppUpdate } from "../../../core/update/appUpdateService.js";

import { showAppUpdatePrompt } from "../../components/appUpdatePrompt.js";

import { FONT_OPTIONS, LANGUAGE_OPTIONS } from "./settingsScreenHelpers-01-settings-ui-state-key.js";
import { translateOptionLabel, t, escapeHtml } from "./settingsScreenHelpers-04-row-icons.js";
import {
  TRAKT_WATCH_PROGRESS_OPTIONS,
  TRAKT_LIBRARY_SOURCE_OPTIONS,
  TMDB_LANGUAGE_OPTIONS,
  DEBRID_SORT_PROFILE_OPTIONS
} from "./settingsScreenHelpers-03-clamp-subtitle-text-opacity.js";
import { normalizeTmdbLanguageCode } from "./settingsScreenHelpers-07-normalize-tmdb-language-code.js";
import { PREFERRED_PLAYBACK_LANGUAGE_OPTIONS } from "./settingsScreenHelpers-02-available-languages.js";

export function maskValue(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.length <= 4) {
    return "••••";
  }
  return `••••••${trimmed.slice(-4)}`;
}

export function labelForFont(fontFamily) {
  return FONT_OPTIONS.find((item) => item.id === String(fontFamily || "").toUpperCase())?.label || "Inter";
}

export function labelForLanguage(language) {
  return translateOptionLabel(
    LANGUAGE_OPTIONS.find((item) => String(item.id) === String(language)),
    t("common.systemDefault")
  );
}

export function labelForTraktContinueWatchingDays(days) {
  const normalizedDays = Number(days || 0);
  if (normalizedDays === TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL) {
    return t("trakt_all_history", {}, "All history");
  }
  return t("trakt_days_format", [normalizedDays], `${normalizedDays} days`);
}

export function labelForTraktWatchProgressSource(source) {
  return translateOptionLabel(
    TRAKT_WATCH_PROGRESS_OPTIONS.find((item) => item.id === String(source || WatchProgressSource.TRAKT)),
    t("trakt_watch_progress_source_trakt", {}, "Trakt")
  );
}

export function labelForTraktLibrarySource(mode) {
  return translateOptionLabel(
    TRAKT_LIBRARY_SOURCE_OPTIONS.find((item) => item.id === String(mode || TraktLibrarySourceMode.TRAKT)),
    t("trakt_library_source_trakt", {}, "Trakt")
  );
}

export function labelForTraktComments(enabled) {
  return enabled ? t("trakt_setting_on", {}, "On") : t("trakt_setting_off", {}, "Off");
}

export function formatTraktDuration(valueMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(valueMs || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function renderTraktCountdownText(key, remainingMs, fallbackPrefix, attributeName) {
  const duration = formatTraktDuration(remainingMs);
  const text = t(key, [duration], `${fallbackPrefix} ${duration}`);
  const escapedDuration = escapeHtml(duration);
  return escapeHtml(text).replace(escapedDuration, `<span ${attributeName}>${escapedDuration}</span>`);
}

export function createTraktQrDataUrl(userCode) {
  if (!userCode || typeof document === "undefined") {
    return "";
  }
  try {
    const canvas = document.createElement("canvas");
    QrCodeGenerator.generate(canvas, `https://trakt.tv/activate/${encodeURIComponent(userCode)}`, 420);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("Failed to generate Trakt QR", error);
    return "";
  }
}

export function labelForTmdbLanguage(language) {
  const normalized = normalizeTmdbLanguageCode(language);
  return translateOptionLabel(
    TMDB_LANGUAGE_OPTIONS.find((item) => String(item.id) === normalized),
    String(language || normalized || "en")
  );
}

export function labelForPlaybackLanguage(language) {
  return translateOptionLabel(
    PREFERRED_PLAYBACK_LANGUAGE_OPTIONS.find((item) => String(item.id) === String(language)),
    t("common.system")
  );
}

export function labelForDebridProvider(providerId) {
  const provider = DebridProviders.byId(providerId);
  return provider?.displayName || t("common.none", {}, "None");
}

export function labelForOption(options, value, fallback = "") {
  return translateOptionLabel(
    options.find((option) => String(option.id) === String(value)),
    fallback || String(value ?? "")
  );
}

export function sameDebridSortCriteria(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((criterion, index) => criterion?.key === right[index]?.key && criterion?.direction === right[index]?.direction);
}

export function debridSortProfileFor(criteria = []) {
  const normalized = Array.isArray(criteria) ? criteria : [];
  const legacyQuality = [
    { key: "RESOLUTION", direction: "DESC" },
    { key: "QUALITY", direction: "DESC" },
    { key: "SIZE", direction: "DESC" }
  ];
  if (!normalized.length) return "ORIGINAL";
  if (sameDebridSortCriteria(normalized, DEBRID_SORT_PROFILES.BEST_QUALITY) || sameDebridSortCriteria(normalized, legacyQuality)) {
    return "BEST_QUALITY";
  }
  if (sameDebridSortCriteria(normalized, DEBRID_SORT_PROFILES.LARGEST)) return "LARGEST";
  if (sameDebridSortCriteria(normalized, DEBRID_SORT_PROFILES.SMALLEST)) return "SMALLEST";
  if (
    normalized[0]?.key === "AUDIO_TAG" &&
    normalized[0]?.direction === "DESC" &&
    normalized[1]?.key === "AUDIO_CHANNEL" &&
    normalized[1]?.direction === "DESC"
  ) {
    return "AUDIO";
  }
  if (normalized[0]?.key === "LANGUAGE" && normalized[0]?.direction === "DESC") {
    return "LANGUAGE";
  }
  return "BEST_QUALITY";
}

export function debridSortProfileLabel(criteria = []) {
  return labelForOption(
    DEBRID_SORT_PROFILE_OPTIONS,
    debridSortProfileFor(criteria),
    t("debrid_stream_sort_best_quality", {}, "Best quality first")
  );
}

export function debridSelectionCountLabel(values = []) {
  const count = Array.isArray(values) ? values.length : 0;
  if (!count) {
    return t("debrid_selection_count_any", {}, "Any");
  }
  return t("debrid_selection_count_value", { count }, `${count} selected`);
}

export function debridSizeRangeId(preferences = {}) {
  const min = Math.max(0, Math.trunc(Number(preferences.sizeMinGb || 0)));
  const max = Math.max(0, Math.trunc(Number(preferences.sizeMaxGb || 0)));
  return `${min}:${max}`;
}

export function debridSizeRangeLabel(minGb = 0, maxGb = 0) {
  const min = Math.max(0, Math.trunc(Number(minGb || 0)));
  const max = Math.max(0, Math.trunc(Number(maxGb || 0)));
  if (min <= 0 && max <= 0) {
    return t("debrid_size_range_any", {}, "Any");
  }
  if (min <= 0) {
    return t("debrid_size_range_up_to", { count: max, max }, `Up to ${max} GB`);
  }
  if (max <= 0) {
    return t("debrid_size_range_min_plus", { count: min, min }, `${min} GB+`);
  }
  return t("debrid_size_range_min_max", { min, max }, `${min}-${max} GB`);
}

export function debridOptionList(items = []) {
  return items.map((item) => ({ id: item.id, label: item.label }));
}
