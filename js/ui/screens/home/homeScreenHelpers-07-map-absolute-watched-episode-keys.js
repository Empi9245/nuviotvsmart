/* eslint-disable no-unused-vars */
import { Router } from "../../navigation/router.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { addonRepository } from "../../../data/repository/addonRepository.js";

import { catalogRepository } from "../../../data/repository/catalogRepository.js";

import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";

import { CloudLibraryPlaybackProgressStore, CloudLibraryPlaybackSessionStore } from "../../../data/local/cloudLibraryPlaybackStore.js";

import { cloudLibraryRepository } from "../../../data/repository/cloudLibraryRepository.js";

import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";

import { watchedItemsShareIdentity } from "../../../data/repository/watchedIdentity.js";

import { watchedTitleStateRepository } from "../../../data/repository/watchedTitleStateRepository.js";

import { watchedSeriesReconciliationService } from "../../../data/repository/watchedSeriesReconciliationService.js";

import { savedLibraryRepository } from "../../../data/repository/savedLibraryRepository.js";

import { libraryRepository, LibrarySourceMode } from "../../../data/repository/libraryRepository.js";

import { mapWithConcurrency } from "../../../core/network/mapWithConcurrency.js";

import { filterReleasedItems } from "../../../core/util/releaseInfoUtils.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { showHomeRatings } from "../../../core/util/imdbRatingVisibility.js";

import { continueWatchingUsesEpisodeThumbnails, continueWatchingImageSources } from "../../../core/util/continueWatchingImage.js";

import { ContinueWatchingPreferences } from "../../../data/local/continueWatchingPreferences.js";

import { HomeCatalogStore } from "../../../data/local/homeCatalogStore.js";

import { CollectionsStore, buildCollectionHomeKey } from "../../../data/local/collectionsStore.js";

import { TmdbService } from "../../../core/tmdb/tmdbService.js";

import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";

import { supportsMembershipFor } from "../../../core/tracking/trackingLibraryMembership.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { metaRepository } from "../../../data/repository/metaRepository.js";

import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";

import { ProfileManager } from "../../../core/profile/profileManager.js";

import { StartupSyncService } from "../../../core/profile/startupSyncService.js";

import { Platform } from "../../../platform/index.js";

import { WatchProgressSource } from "../../../data/local/traktSettingsStore.js";

import { watchProgressCompletedThreshold } from "../../../domain/model/watchProgress.js";

import { getTvHeroTransitionMode, getTvRuntimePerformanceProfile } from "../../../platform/tvRuntimePerformance.js";

import { isFastHorizontalNavigationEnabled } from "../../../platform/sharedKeys.js";

import { LocalStore } from "../../../core/storage/localStore.js";

import { TMDB_API_KEY, YOUTUBE_PROXY_URL } from "../../../config.js";

import { I18n } from "../../../i18n/index.js";

import { localizedGenreLabel } from "../../../i18n/genreLabels.js";

import { buildWatchedTitleIdSet, isTitleItemWatched, renderTitleWatchedBadge } from "../../components/watchedTitleBadge.js";

import { buildModernRowKey, MODERN_HOME_CONSTANTS, renderModernHomeLayout } from "./modernHomeLayout.js";

import { formatHomeRuntimeText, shouldPreserveHomeRuntimeText } from "./homeRuntime.js";

import { shouldKeepNextUpForAiringSetting } from "./nextUpAiringVisibility.js";

import {
  buildCatalogDisableKey,
  buildCatalogOrderKey,
  catalogShouldShowOnHome,
  catalogSkipStep,
  catalogSupportsExtra
} from "../../../core/addons/homeCatalogs.js";

import {
  activateLegacySidebarAction,
  bindRootSidebarEvents,
  getLegacySidebarNodes,
  getLegacySidebarSelectedNode,
  getModernSidebarNodes,
  getModernSidebarSelectedNode,
  getSidebarProfileState,
  focusWithoutAutoScroll,
  renderRootSidebar,
  setModernSidebarExpanded,
  setModernSidebarPillIconOnly,
  setLegacySidebarExpanded
} from "../../components/sidebarNavigation.js";

import { NuvioDialog } from "../../components/nuvioDialog.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import {
  CW_DAYS_CAP,
  CW_DISPLAY_SNAPSHOT_KEY,
  CW_DISPLAY_SNAPSHOT_MAX_AGE_MS,
  CW_DISPLAY_SNAPSHOT_MAX_ITEMS,
  CW_DISPLAY_SNAPSHOT_MAX_SCOPES,
  CW_ENRICHMENT_CACHE_KEY,
  CW_ENRICHMENT_CACHE_MAX_AGE_MS,
  CW_ENTER_DELAY_MS,
  CW_HOLD_DELAY_MS,
  CW_MAX_ENRICHMENT_CONCURRENCY,
  CW_MAX_NEXT_UP_CONCURRENCY,
  CW_MAX_NEXT_UP_LOOKUPS,
  CW_MAX_VISIBLE_ITEMS,
  CW_META_TIMEOUT_MS,
  CW_META_TIMEOUT_TV_MS,
  CW_NEXT_UP_META_TIMEOUT_MS,
  CW_NEXT_UP_NEW_SEASON_UNAIRED_WINDOW_DAYS,
  CW_PROGRESS_START_THRESHOLD,
  CW_RENDER_BATCH_ITEMS_CONSTRAINED,
  CW_RENDER_BATCH_ITEMS_DEFAULT,
  CW_RENDER_BATCH_ITEMS_LEGACY_TV,
  CW_RENDER_LOAD_AHEAD_ITEMS,
  HERO_ROTATE_FIRST_DELAY_MS,
  HERO_ROTATE_INTERVAL_MS,
  HOME_BACKGROUND_RENDER_DELAY_LEGACY_MS,
  HOME_BACKGROUND_RENDER_DELAY_MS,
  HOME_ADDON_MANIFEST_TIMEOUT_MS,
  HOME_GRID_COMPACT_ROW_COUNT,
  HOME_GRID_DEFAULT_ROW_COUNT,
  HOME_GRID_SAFE_MAX_COLUMNS,
  HOME_INITIAL_CATALOG_LOAD,
  HOME_LEGACY_HERO_BACKDROP_CROSSFADE_MS,
  HOME_LAYOUT_SEQUENCE,
  HOME_LOADING_ROW_ITEMS_CONSTRAINED,
  HOME_LOADING_ROW_ITEMS_DEFAULT,
  HOME_LOADING_ROW_ITEMS_LEGACY_TV,
  HOME_MAX_ITEMS_PER_ROW_CONSTRAINED,
  HOME_MAX_ITEMS_PER_ROW_CLASSIC,
  HOME_MAX_ITEMS_PER_ROW_DEFAULT,
  HOME_MAX_ITEMS_PER_ROW_LEGACY_TV,
  HOME_MODERN_HERO_BACKDROP_CROSSFADE_MS,
  HOME_PERF_DEBUG,
  HOME_RETURN_FOCUS_STATE_KEY,
  HOME_ROW_RETRY_TIMEOUT_MS,
  HOME_ROW_TIMEOUT_MS,
  HOME_STABLE_GATE_TIMEOUT_MS
} from "./homeConstants.js";

import { mergeRefreshedHomeRows } from "./homeRowMerge.js";

import { findHomeFocusIdentityMatch, getHomeFocusIdentity, shouldApplyLateContinueWatchingFocus } from "./homeFocusPolicy.js";

import { resolveNextUpCandidates } from "./nextUpCandidateResolver.js";

import { findAbsoluteEpisodeAnchorIndex } from "./nextUpEpisodeAnchor.js";

import { shouldSurfaceNextUpForUntrackedSeries } from "./nextUpWatchingPolicy.js";

import { getContinueWatchingRenderItems, shouldAppendContinueWatchingItems } from "./continueWatchingRenderWindow.js";

import { shouldProtectContinueWatchingDisplay } from "./continueWatchingLoadPolicy.js";

import { buildHeroBackdropSources, buildImageFallbackErrorHandler, encodeHeroBackdropFallbacks } from "./homeImageHelpers.js";

import {
  escapeAttribute,
  escapeHtml,
  firstNonEmpty,
  formatContentTypeLabel,
  formatCatalogRowTitle,
  limitTextToWordCount,
  parseCssPx,
  prettyId,
  uniqueNonEmptyValues
} from "./homeUtils.js";

import { mapAbsoluteEpisodeKey, normalizeEpisodeEntry } from "./homeScreenHelpers-06-resolve-trailer-source.js";
import { CW_RELEASE_ALERT_MAX_AGE_MS, t } from "./homeScreenHelpers-01-modern-sidebar-pill-auto-collapse-ms.js";
import { partitionContinueWatchingRows } from "./homeScreenHelpers-08-partition-continue-watching-rows.js";

export function mapAbsoluteWatchedEpisodeKeys(episodes, watchedEpisodeKeys) {
  const mapped = new Set(watchedEpisodeKeys || []);
  Array.from(mapped).forEach((key) => {
    const mappedKey = mapAbsoluteEpisodeKey(episodes, key);
    if (mappedKey) {
      mapped.add(mappedKey);
    }
  });
  return mapped;
}

export function mapAbsoluteEpisodeProgress(episodes, progressByEpisode) {
  const mapped = new Map(progressByEpisode);
  progressByEpisode.forEach((entry, key) => {
    const mappedKey = mapAbsoluteEpisodeKey(episodes, key);
    if (!mappedKey) {
      return;
    }
    const existing = mapped.get(mappedKey);
    if (!existing || Number(entry?.updatedAt || 0) > Number(existing?.updatedAt || 0)) {
      mapped.set(mappedKey, entry);
    }
  });
  return mapped;
}

export function findEpisodeEntry(videos = [], season = null, episode = null) {
  const targetSeason = Number(season);
  const targetEpisode = Number(episode || 0);
  if (season == null || !Number.isFinite(targetSeason) || targetSeason < 0 || targetEpisode <= 0) {
    return null;
  }
  return (
    (Array.isArray(videos) ? videos : [])
      .filter((video) => video?.season != null || video?.seasonNumber != null)
      .map((video) => normalizeEpisodeEntry(video))
      .find((entry) => entry.season === targetSeason && entry.episode === targetEpisode) || null
  );
}

export function hasEpisodeAiredForContinueWatching(released) {
  const parsedTime = parseEpisodeReleaseDateForContinueWatching(released);
  return parsedTime == null || parsedTime <= Date.now();
}

export function parseEpisodeReleaseDateForContinueWatching(released) {
  const raw = String(released || "").trim();
  if (!raw) {
    return null;
  }
  // Only a strict ISO 8601 date-time parses identically across engines, so keep
  // its exact time. For any other string, use the extracted ISO date portion:
  // Date.parse on non-ISO / space separated / locale date strings is
  // implementation and timezone dependent, and on some TV browsers resolved a
  // day or more off, which made Continue Watching treat episodes as aired
  // before their real release date.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const exactTime = Date.parse(raw);
    if (Number.isFinite(exactTime)) {
      return exactTime;
    }
  }
  const datePortion = raw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const parsedTime = datePortion ? Date.parse(datePortion) : NaN;
  return Number.isFinite(parsedTime) ? parsedTime : null;
}

export function resolveNextUpReleaseState(item = {}) {
  const releaseTimestamp = parseEpisodeReleaseDateForContinueWatching(firstNonEmpty(item?.released, item?.releaseInfo));
  const seedUpdatedAt = Number(item?.seedUpdatedAt ?? item?.updatedAt ?? 0) || 0;
  const hasAired = releaseTimestamp == null ? item?.hasAired !== false : releaseTimestamp <= Date.now();
  const isReleaseAlert = Boolean(
    hasAired && releaseTimestamp != null && releaseTimestamp > seedUpdatedAt && Date.now() - releaseTimestamp < CW_RELEASE_ALERT_MAX_AGE_MS
  );
  const seedSeason = Number(item?.seedSeason || 0);
  const nextSeason = Number(item?.season || 0);

  return {
    hasAired,
    releaseTimestamp,
    isReleaseAlert,
    isNewSeasonRelease: Boolean(isReleaseAlert && seedSeason > 0 && nextSeason > 0 && nextSeason !== seedSeason),
    sortTimestamp: isReleaseAlert ? releaseTimestamp : seedUpdatedAt
  };
}

export function refreshContinueWatchingReleaseState(item = {}) {
  if (!item?.isNextUp) {
    return item;
  }
  const releaseTimestamp = parseEpisodeReleaseDateForContinueWatching(firstNonEmpty(item?.released, item?.releaseInfo));
  if (releaseTimestamp == null) {
    return item;
  }
  const releaseState = resolveNextUpReleaseState(item);
  return {
    ...item,
    ...releaseState,
    airDateLabel: releaseState.hasAired ? null : buildNextUpAirDateStatus(item)
  };
}

export function parseEpisodeReleaseCalendarDateForContinueWatching(released) {
  const raw = String(released || "").trim();
  if (!raw) {
    return null;
  }
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  const embeddedDate = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return embeddedDate ? new Date(Number(embeddedDate[1]), Number(embeddedDate[2]) - 1, Number(embeddedDate[3])) : null;
}

export function continueWatchingCalendarDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / (24 * 60 * 60 * 1000));
}

export function buildNextUpAirDateStatus(item = {}) {
  const releaseValue = firstNonEmpty(item?.released, item?.releaseInfo);
  const releaseDate = parseEpisodeReleaseCalendarDateForContinueWatching(releaseValue);
  if (!releaseDate || Number.isNaN(releaseDate.getTime())) {
    return "";
  }
  const daysUntil = continueWatchingCalendarDayNumber(releaseDate) - continueWatchingCalendarDayNumber(new Date());
  if (daysUntil < 0) {
    return "";
  }
  if (daysUntil === 0) {
    return t("cw_airs_today", {}, "Airs Today");
  }
  if (daysUntil === 1) {
    return t("cw_airs_tomorrow", {}, "Airs Tomorrow");
  }
  if (daysUntil <= 7) {
    return t("cw_airs_in_days", [daysUntil], "Airs in %1$d Days");
  }
  let dateLabel = "";
  try {
    dateLabel = releaseDate.toLocaleDateString(I18n.getLocale(), {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  } catch (_) {
    dateLabel = String(releaseValue || "").match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || "";
  }
  return dateLabel ? t("cw_airs_date", [dateLabel], "Airs %1$s") : "";
}

export function continueWatchingSortTimestamp(item = {}) {
  return Number(item?.sortTimestamp || item?.updatedAt || item?.watchedAt || 0);
}

export function nextUpReleaseTimestamp(item = {}) {
  return parseEpisodeReleaseDateForContinueWatching(firstNonEmpty(item?.released, item?.releaseInfo));
}

export function sortContinueWatchingItemsForDisplay(items = [], mode = "default") {
  const normalizedMode = String(mode || "default")
    .trim()
    .toLowerCase();
  if (normalizedMode !== "streaming_style") {
    const sorted = [...items].sort((left, right) => continueWatchingSortTimestamp(right) - continueWatchingSortTimestamp(left));
    if (normalizedMode !== "split_upcoming") {
      return sorted;
    }
    const { main, upcoming } = partitionContinueWatchingRows(sorted, normalizedMode);
    return [...main, ...upcoming];
  }

  const released = [];
  const unreleased = [];
  (items || []).forEach((item) => {
    if (!item?.isNextUp || item?.hasAired !== false) {
      released.push(item);
    } else {
      unreleased.push(item);
    }
  });

  released.sort((left, right) => continueWatchingSortTimestamp(right) - continueWatchingSortTimestamp(left));
  unreleased.sort((left, right) => {
    const leftTime = nextUpReleaseTimestamp(left);
    const rightTime = nextUpReleaseTimestamp(right);
    if (leftTime == null && rightTime == null) {
      return 0;
    }
    if (leftTime == null) {
      return 1;
    }
    if (rightTime == null) {
      return -1;
    }
    return leftTime - rightTime;
  });

  return [...released, ...unreleased];
}
