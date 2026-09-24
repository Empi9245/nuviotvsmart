import { Router } from "../../navigation/routerState.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { metaRepository } from "../../../data/repository/metaRepository.js";

import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";

import { savedLibraryRepository } from "../../../data/repository/savedLibraryRepository.js";

import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";

import { watchedItemsShareIdentity } from "../../../data/repository/watchedIdentity.js";

import { watchedTitleStateRepository } from "../../../data/repository/watchedTitleStateRepository.js";

import { libraryRepository, LibrarySourceMode } from "../../../data/repository/libraryRepository.js";

import { detailWatchedEnrichmentService } from "../../../data/repository/detailWatchedEnrichmentService.js";

import { watchedSeriesReconciliationService } from "../../../data/repository/watchedSeriesReconciliationService.js";

import { TmdbService } from "../../../core/tmdb/tmdbService.js";

import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";

import { normalizeTmdbBackdropUrl } from "../../../core/tmdb/tmdbImageUrl.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { showHomeRatings, showStandardDetailRatings } from "../../../core/util/imdbRatingVisibility.js";

import { imdbEpisodeRatingsRepository } from "../../../data/repository/imdbEpisodeRatingsRepository.js";

import { formatHeroRuntime, normalizeEpisodeImdbRating, parseEpisodeRuntimeMinutes } from "./episodeCardMetadata.js";

import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";

import { MoreLikeThisSourcePreference, TraktSettingsStore, WatchProgressSource } from "../../../data/local/traktSettingsStore.js";

import { requestJson as traktRequestJson, TraktAuthService } from "../../../data/repository/traktAuthService.js";

import { toTraktImageUrl } from "../../../core/trakt/traktImageUrl.js";

import { supportsMembershipFor } from "../../../core/tracking/trackingLibraryMembership.js";

import { Environment } from "../../../platform/environment.js";

import { Platform } from "../../../platform/index.js";

import { getTvRuntimePerformanceProfile } from "../../../platform/tvRuntimePerformance.js";

import { TMDB_API_KEY, TRAKT_API_URL, TRAKT_CLIENT_ID, YOUTUBE_PROXY_URL } from "../../../config.js";

import { I18n } from "../../../i18n/index.js";

import { localizedGenreLabel } from "../../../i18n/genreLabels.js";

import { contentTextDirection } from "../../../core/util/contentTextDirection.js";

import { mdbListRatingIcon } from "../../../core/util/mdbListRatingStatus.js";

import { NuvioDialog } from "../../components/nuvioDialog.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { resolveMovieStreamIdentity } from "./movieStreamIdentity.js";

import { posterItemFromNode, PosterOptionsDialogController } from "../../components/posterOptionsMenu.js";

import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";

import { buildWatchedTitleIdSet, isTitleItemWatched } from "../../components/watchedTitleBadge.js";

import {
  getWatchProgressFraction,
  isWatchProgressCompleted,
  isWatchProgressInProgress,
  watchProgressCompletedThreshold,
  resolveWatchProgressResumePositionMs
} from "../../../domain/model/watchProgress.js";

import { detailProgressFraction, isDetailProgressCompleted, t, normalizeEpisodes } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";
import { formatDurationMinutes } from "./metaDetailsScreenHelpers-04-detect-quality.js";

export function hasInProgressSimklMovieProgress(progressItems = [], contentReference = {}) {
  return (Array.isArray(progressItems) ? progressItems : []).some((entry) => {
    return (
      String(entry?.source || "")
        .trim()
        .toLowerCase() === "simkl_playback" &&
      String(entry?.contentType || "")
        .trim()
        .toLowerCase() === "movie" &&
      entry?.season == null &&
      entry?.episode == null &&
      watchedItemsShareIdentity(entry, contentReference) &&
      detailProgressFraction(entry) > 0 &&
      !isDetailProgressCompleted(entry)
    );
  });
}

export function pushUniqueResumeId(ids, value) {
  const normalized = String(value || "").trim();
  if (normalized && !ids.includes(normalized)) {
    ids.push(normalized);
  }
}

export function buildResumeContentIds(meta = {}, params = {}) {
  const ids = [];
  pushUniqueResumeId(ids, params?.itemId);
  pushUniqueResumeId(ids, params?.originalItemId);
  pushUniqueResumeId(ids, meta?.id);
  const imdb = String(meta?.ids?.imdb || meta?.imdb_id || meta?.imdbId || params?.imdbId || "").trim();
  if (imdb) {
    pushUniqueResumeId(ids, imdb);
    pushUniqueResumeId(ids, `imdb:${imdb}`);
  }
  const tmdb = meta?.ids?.tmdb ?? meta?.tmdb_id ?? meta?.tmdbId ?? params?.tmdbId;
  if (tmdb != null && String(tmdb).trim() !== "") {
    pushUniqueResumeId(ids, String(tmdb));
    pushUniqueResumeId(ids, `tmdb:${tmdb}`);
  }
  const trakt = meta?.ids?.trakt ?? meta?.trakt_id ?? meta?.traktId;
  if (trakt != null && String(trakt).trim() !== "") {
    pushUniqueResumeId(ids, String(trakt));
    pushUniqueResumeId(ids, `trakt:${trakt}`);
  }
  return ids;
}

export function formatResumeRemaining(progress = {}) {
  const positionMs = Number(progress?.positionMs || 0);
  const durationMs = Number(progress?.durationMs || 0);
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || positionMs <= 0 || durationMs <= positionMs) {
    return "";
  }
  const minutes = Math.max(1, Math.round((durationMs - positionMs) / 60000));
  const durationText = formatDurationMinutes(minutes);
  return durationText ? t("detail.timeLeftDuration", { time: durationText }, "{{time}} left") : "";
}

export function isSeriesDetailMeta(meta = {}, episodes = null) {
  const normalizedType = String(meta?.type || "")
    .trim()
    .toLowerCase();
  if (normalizedType === "series") {
    return true;
  }
  const resolvedEpisodes = Array.isArray(episodes) ? episodes : normalizeEpisodes(meta?.videos || [], normalizedType);
  // Addon-defined types such as `other` can be episodic when their full meta
  // contains unnumbered playable videos; live `tv` channels stay non-episodic.
  return resolvedEpisodes.length > 0;
}

export function resolveWatchedProjectionType(itemType, meta = {}) {
  const candidate = String(meta?.type || itemType || "")
    .trim()
    .toLowerCase();
  return ["series", "tv", "anime", "show", "tvshow"].includes(candidate) ? candidate : "series";
}

export function buildDetailContentReference(contentId, meta = {}, params = {}) {
  return {
    ...meta,
    contentId,
    id: contentId,
    imdbId: resolveMetaImdbId(meta, params),
    tmdbId: resolveMetaTmdbId(meta, params),
    traktId: resolveMetaTraktId(meta, params)
  };
}

export async function isDetailTitleWatched(itemId, itemType, meta, baseWatchedItems) {
  if (!isSeriesDetailMeta(meta)) {
    return false;
  }
  const titleItem = {
    ...meta,
    id: itemId,
    contentId: itemId,
    type: resolveWatchedProjectionType(itemType, meta),
    apiType: meta?.apiType || itemType || "series"
  };
  const projectedItems = await watchedTitleStateRepository
    .getTitleWatchedItems([titleItem], {
      baseWatchedItems,
      limit: 5000
    })
    .catch(() => baseWatchedItems);
  return isTitleItemWatched(titleItem, buildWatchedTitleIdSet(projectedItems));
}

export function resolvePlayableDetailType(itemType, meta = {}) {
  const rawType = String(itemType || meta?.type || "").trim();
  if (!rawType) {
    return "movie";
  }
  const normalizedType = rawType.toLowerCase();
  if (["movie", "series", "channel", "tv"].includes(normalizedType)) {
    return normalizedType;
  }
  // Match Android's ContentType.UNKNOWN behavior: preserve addon-defined API
  // types so the stream request uses the exact catalog type instead of movie.
  return rawType;
}

export function resolveMetaImdbId(meta = {}, params = {}) {
  const candidates = [
    meta?.imdbId,
    meta?.imdb_id,
    meta?.externalIds?.imdb,
    meta?.external_ids?.imdb_id,
    params?.imdbId,
    params?.imdb_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .split(":")[0]
      )
      .find((value) => /^tt\d+$/i.test(value)) || null
  );
}

export function resolveMetaTmdbId(meta = {}, params = {}) {
  const candidates = [
    meta?.tmdbId,
    meta?.tmdb_id,
    meta?.ids?.tmdb,
    meta?.externalIds?.tmdb,
    meta?.external_ids?.tmdb,
    params?.tmdbId,
    params?.tmdb_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .replace(/^tmdb:/i, "")
            .split(":")[0]
      )
      .find((value) => /^\d+$/.test(value)) || null
  );
}

export function resolveMetaTraktId(meta = {}, params = {}) {
  const candidates = [
    meta?.traktId,
    meta?.trakt_id,
    meta?.ids?.trakt,
    meta?.externalIds?.trakt,
    meta?.external_ids?.trakt,
    params?.traktId,
    params?.trakt_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .replace(/^trakt:/i, "")
            .split(":")[0]
      )
      .find((value) => /^\d+$/.test(value)) || null
  );
}

export function resolveMetaOriginalLanguage(meta = {}, params = {}) {
  return (
    [meta?.originalLanguage, meta?.original_language, params?.contentLanguage, params?.originalLanguage, params?.original_language]
      .map((value) => String(value || "").trim())
      .find(Boolean) || null
  );
}
