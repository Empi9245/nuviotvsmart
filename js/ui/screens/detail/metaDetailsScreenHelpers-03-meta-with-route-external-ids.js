import { Router } from "../../navigation/router.js";

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

import {
  resolveMetaImdbId,
  resolveMetaTmdbId,
  resolveMetaTraktId
} from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

export function metaWithRouteExternalIds(meta = {}, params = {}) {
  const imdbId = resolveMetaImdbId(meta, params);
  const tmdbId = resolveMetaTmdbId(meta, params);
  const traktId = resolveMetaTraktId(meta, params);
  const ids = {
    ...(meta?.ids && typeof meta.ids === "object" ? meta.ids : {})
  };
  if (imdbId && !ids.imdb) {
    ids.imdb = imdbId;
  }
  if (tmdbId && !ids.tmdb) {
    ids.tmdb = tmdbId;
  }
  if (traktId && !ids.trakt) {
    ids.trakt = traktId;
  }
  return {
    ...(meta || {}),
    ids,
    imdbId: meta?.imdbId || imdbId || null,
    tmdbId: meta?.tmdbId || tmdbId || null,
    traktId: meta?.traktId || traktId || null
  };
}

export function extractCast(meta = {}) {
  const toPhoto = (value) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.startsWith("//")) {
      return `https:${raw}`;
    }
    if (raw.startsWith("http://")) {
      return `https://${raw.slice("http://".length)}`;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    if (raw.startsWith("/")) {
      return `https://image.tmdb.org/t/p/w300${raw}`;
    }
    return toTraktImageUrl(raw);
  };
  const normalizeCastValue = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const selectBetterCastEntry = (current, candidate) => {
    if (!candidate) {
      return current;
    }
    if (!current) {
      return candidate;
    }
    const currentScore = Number(Boolean(current.photo)) + Number(Boolean(current.tmdbId));
    const candidateScore = Number(Boolean(candidate.photo)) + Number(Boolean(candidate.tmdbId));
    return candidateScore > currentScore ? candidate : current;
  };
  const mergeCastEntries = (primary = [], supplemental = []) => {
    if (!primary.length) {
      return supplemental;
    }
    if (!supplemental.length) {
      return primary;
    }

    const exactMatches = new Map();
    const nameMatches = new Map();
    supplemental.forEach((entry) => {
      const normalizedName = normalizeCastValue(entry?.name);
      if (!normalizedName) {
        return;
      }
      const normalizedCharacter = normalizeCastValue(entry?.character);
      if (normalizedCharacter) {
        const exactKey = `${normalizedName}|${normalizedCharacter}`;
        exactMatches.set(exactKey, selectBetterCastEntry(exactMatches.get(exactKey), entry));
      }
      nameMatches.set(normalizedName, selectBetterCastEntry(nameMatches.get(normalizedName), entry));
    });

    return primary.map((entry) => {
      const normalizedName = normalizeCastValue(entry?.name);
      const normalizedCharacter = normalizeCastValue(entry?.character);
      const exactKey = normalizedName && normalizedCharacter ? `${normalizedName}|${normalizedCharacter}` : "";
      const match = (exactKey ? exactMatches.get(exactKey) : null) || (normalizedName ? nameMatches.get(normalizedName) : null);
      return {
        ...entry,
        character: entry?.character || match?.character || "",
        photo: entry?.photo || match?.photo || "",
        tmdbId: entry?.tmdbId || match?.tmdbId || null
      };
    });
  };
  const mapCastEntries = (items = [], mapper) => (Array.isArray(items) ? items : []).map(mapper).filter((entry) => Boolean(entry?.name));

  const members = Array.isArray(meta.castMembers) ? meta.castMembers : [];
  const memberEntries = mapCastEntries(members, (entry) => ({
    name: entry?.name || "",
    character: entry?.character || entry?.role || "",
    photo: toPhoto(entry?.photo || entry?.profilePath || entry?.profile_path || entry?.avatar || entry?.image || entry?.poster || ""),
    tmdbId: entry?.tmdbId || entry?.id || null
  }));

  const direct = Array.isArray(meta.cast) ? meta.cast : [];
  const directEntries = mapCastEntries(direct, (entry) => {
    if (typeof entry === "string") {
      return { name: entry, character: "", photo: "", tmdbId: null };
    }
    return {
      name: entry?.name || "",
      character: entry?.character || "",
      photo: toPhoto(entry?.photo || entry?.profilePath || entry?.profile_path || entry?.avatar || entry?.image || entry?.poster || ""),
      tmdbId: entry?.tmdbId || entry?.id || null
    };
  });

  const credits = meta.credits?.cast;
  const creditEntries = mapCastEntries(credits, (entry) => ({
    name: entry?.name || entry?.character || "",
    character: entry?.character || "",
    photo: toPhoto(entry?.profile_path || entry?.photo || entry?.profilePath || entry?.avatar_path || entry?.avatar || entry?.image || ""),
    tmdbId: entry?.id || null
  }));

  if (memberEntries.length) {
    return mergeCastEntries(memberEntries, [...directEntries, ...creditEntries]).slice(0, 18);
  }
  if (directEntries.length) {
    return mergeCastEntries(directEntries, creditEntries).slice(0, 12);
  }
  if (creditEntries.length) {
    return creditEntries.slice(0, 12);
  }

  return [];
}

export function isBackEvent(event) {
  return Environment.isBackEvent(event);
}

export function getDpadDirection(event) {
  const keyCode = Number(event?.keyCode || 0);
  const key = String(event?.key || "").toLowerCase();
  if (keyCode === 37 || key === "arrowleft" || key === "left") return "left";
  if (keyCode === 39 || key === "arrowright" || key === "right") return "right";
  if (keyCode === 38 || key === "arrowup" || key === "up") return "up";
  if (keyCode === 40 || key === "arrowdown" || key === "down") return "down";
  return null;
}

export function getTrailerSeekStepSeconds(event) {
  const repeatCount = Number(event?.repeatCount || event?.detail?.repeatCount || 0);
  if (repeatCount >= 12) return 12;
  if (repeatCount >= 6) return 8;
  if (repeatCount >= 2) return 5;
  return 3;
}

export function getTrailerMediaAction(event) {
  const keyCode = Number(event?.keyCode || event?.which || event?.originalKeyCode || 0);
  const key = String(event?.key || "").toLowerCase();
  const keyName = String(event?.keyName || event?.detail?.keyName || "").toLowerCase();
  const code = String(event?.code || "").toLowerCase();
  const names = [key, keyName, code];
  if (names.some((name) => name === "mediaplaypause" || name === "playpause")) {
    return "toggle";
  }
  if (names.some((name) => name === "mediaplay" || name === "play")) {
    return "play";
  }
  if (names.some((name) => name === "mediapause" || name === "pause")) {
    return "pause";
  }
  if (keyCode === 179 || keyCode === 10252) return "toggle";
  if (keyCode === 415) return "play";
  if (keyCode === 19) return "pause";
  return "";
}

export async function withTimeout(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), ms);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
