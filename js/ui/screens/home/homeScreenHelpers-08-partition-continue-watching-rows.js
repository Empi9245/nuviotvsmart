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

import {
  nextUpReleaseTimestamp,
  parseEpisodeReleaseDateForContinueWatching,
  buildNextUpAirDateStatus
} from "./homeScreenHelpers-07-map-absolute-watched-episode-keys.js";
import { t, resolveImdbRating } from "./homeScreenHelpers-01-modern-sidebar-pill-auto-collapse-ms.js";
import { formatDurationMinutes, parseRuntimeMinutes } from "./homeScreenHelpers-04-animate-hero-logo-swap.js";
import { progressFractionForContinueWatching } from "./homeScreenHelpers-06-resolve-trailer-source.js";

export function partitionContinueWatchingRows(items = [], mode = "default") {
  const normalizedMode = String(mode || "default")
    .trim()
    .toLowerCase();
  if (normalizedMode !== "split_upcoming") {
    return { main: [...items], upcoming: [] };
  }

  const main = [];
  const upcoming = [];
  (items || []).forEach((item) => {
    if (item?.isNextUp && item?.hasAired === false) {
      upcoming.push(item);
    } else {
      main.push(item);
    }
  });
  upcoming.sort((left, right) => {
    const leftTime = nextUpReleaseTimestamp(left);
    const rightTime = nextUpReleaseTimestamp(right);
    if (leftTime == null && rightTime == null) return 0;
    if (leftTime == null) return 1;
    if (rightTime == null) return -1;
    return leftTime - rightTime;
  });
  return { main, upcoming };
}

export function shouldShowNextUpEpisodeForContinueWatching(candidate = {}, anchorSeason = null, showUnairedNextUp = true) {
  const candidateSeason = Number(candidate?.season || 0);
  const seedSeason = Number(anchorSeason || 0);
  const isSeasonRollover = seedSeason > 0 && candidateSeason > 0 && candidateSeason !== seedSeason;
  const releaseTime = parseEpisodeReleaseDateForContinueWatching(candidate?.released);
  if (isSeasonRollover && releaseTime == null) {
    return false;
  }
  // Android treats an episode without a release date as unaired. Keep the
  // same setting gate so missing metadata cannot make an upcoming episode
  // appear as an already aired Next Up item.
  if (releaseTime == null) {
    if (candidate?.available === false) {
      return false;
    }
    return showUnairedNextUp;
  }
  if (releaseTime <= Date.now()) {
    return true;
  }
  if (!showUnairedNextUp) {
    return false;
  }
  if (!isSeasonRollover) {
    return true;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor((releaseTime - todayStart.getTime()) / (24 * 60 * 60 * 1000));
  return daysUntil <= CW_NEXT_UP_NEW_SEASON_UNAIRED_WINDOW_DAYS;
}

export function buildProgressStatus(item) {
  if (item?.isNextUp) {
    if (item?.isReleaseAlert) {
      return item?.isNewSeasonRelease ? t("cw_new_season", {}, "New Season") : t("cw_new_episode", {}, "New Episode");
    }
    if (item?.hasAired === false) {
      return buildNextUpAirDateStatus(item) || t("cw_upcoming", {}, "Upcoming");
    }
    return t("home.continueStatusNextUp", {}, "Next Up");
  }
  const durationMs = continueWatchingDurationMs(item);
  const rawPositionMs = Number(item?.positionMs || 0);
  const progressPercent = Number(item?.progressPercent);
  const positionMs =
    rawPositionMs > 0
      ? rawPositionMs
      : durationMs > 0 && Number.isFinite(progressPercent)
        ? (durationMs * Math.max(0, Math.min(100, progressPercent))) / 100
        : 0;
  if (!durationMs || !positionMs) {
    if (Number.isFinite(progressPercent) && progressPercent > 0) {
      const percent = Math.max(1, Math.min(99, Math.round(progressPercent)));
      return t("home.continueStatusWatchedPercent", { percent }, "{{percent}}% watched");
    }
    return t("home.continueStatusContinue", {}, "Continue");
  }
  const effectivePositionMs = Math.max(0, Math.min(durationMs, positionMs));
  const remainingMinutes = Math.max(1, Math.floor(Math.max(0, durationMs - effectivePositionMs) / 60000));
  if (remainingMinutes < 60) {
    return t("home.timeLeft", { minutes: remainingMinutes }, "{{minutes}}m left");
  }
  const remainingLabel = formatDurationMinutes(remainingMinutes);
  return t("home.timeLeftDuration", { time: remainingLabel }, "{{time}} left");
}

export function continueWatchingDurationMs(item = {}) {
  const explicitDurationMs = Number(item?.durationMs || 0);
  if (Number.isFinite(explicitDurationMs) && explicitDurationMs > 0) {
    return Math.trunc(explicitDurationMs);
  }
  const runtimeMinutes = parseRuntimeMinutes(item?.runtimeMinutes ?? item?.runtime ?? item?.durationMinutes ?? item?.duration_minutes ?? 0);
  return runtimeMinutes > 0 ? Math.round(runtimeMinutes * 60000) : 0;
}

export function buildProgressFraction(item) {
  if (item?.isNextUp) {
    return 0;
  }
  return progressFractionForContinueWatching(item);
}

export function buildCatalogLoadingItems(rowKey, count = HOME_LOADING_ROW_ITEMS_DEFAULT) {
  const safeCount = Math.max(1, Math.min(HOME_MAX_ITEMS_PER_ROW_DEFAULT, Number(count || HOME_LOADING_ROW_ITEMS_DEFAULT)));
  return Array.from({ length: safeCount }, (_, index) => ({
    id: `${rowKey || "row"}__loading_${index}`,
    name: t("common.loading", {}, "Loading"),
    isLoading: true
  }));
}

export function normalizeCatalogItem(item, fallbackType = "movie") {
  if (!item) {
    return null;
  }
  return {
    ...item,
    id: String(item.id || "").trim(),
    type: String(item.type || item.apiType || fallbackType || "movie").trim() || "movie",
    apiType: String(item.apiType || item.type || fallbackType || "movie").trim() || "movie",
    name: firstNonEmpty(item.name, item.title, prettyId(item.id)),
    landscapePoster: firstNonEmpty(item.landscapePoster, item.backdrop, item.backdropUrl, item.background),
    poster: firstNonEmpty(item.poster, item.backdrop, item.backdropUrl, item.thumbnail),
    background: firstNonEmpty(item.background, item.backdrop, item.backdropUrl, item.poster, item.thumbnail),
    logo: firstNonEmpty(item.logo),
    description: firstNonEmpty(item.description, item.overview, item.plot),
    releaseInfo: firstNonEmpty(item.releaseInfo, item.released),
    genres: Array.isArray(item.genres) ? item.genres.filter(Boolean) : [],
    runtimeMinutes: parseRuntimeMinutes(item.runtimeMinutes ?? item.runtime ?? 0),
    imdbRating: resolveImdbRating(item),
    ageRating: firstNonEmpty(item.ageRating, item.age_rating),
    status: firstNonEmpty(item.status),
    language: firstNonEmpty(item.language),
    country: firstNonEmpty(item.country)
  };
}
