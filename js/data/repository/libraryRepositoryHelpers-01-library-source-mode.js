/* eslint-disable no-unused-vars */

import { AuthManager } from "../../core/auth/authManager.js";

import { toTraktImageUrl } from "../../core/trakt/traktImageUrl.js";

import { SavedLibrarySyncService } from "../../core/profile/savedLibrarySyncService.js";

import { ProfileManager } from "../../core/profile/profileManager.js";

import { LocalStore } from "../../core/storage/localStore.js";

import { savedLibraryRepository } from "./savedLibraryRepository.js";

import { metaRepository } from "./metaRepository.js";

import { requestJson, TraktAuthService } from "./traktAuthService.js";

import { TraktLibrarySourceMode, TraktSettingsStore } from "../local/traktSettingsStore.js";

import { SimklAuthService } from "./simklAuthService.js";

import { SimklSyncService } from "./simklSyncService.js";

export const LibrarySourceMode = {
  LOCAL: "local",
  TRAKT: "trakt",
  SIMKL: "simkl"
};

export const LibrarySortOptionKey = {
  DEFAULT: "default",
  ADDED_DESC: "added_desc",
  ADDED_ASC: "added_asc",
  TITLE_ASC: "title_asc",
  TITLE_DESC: "title_desc"
};

export const LibraryListPrivacy = {
  PRIVATE: "private",
  LINK: "link",
  FRIENDS: "friends",
  PUBLIC: "public"
};

export const LibraryListType = {
  WATCHLIST: "watchlist",
  PERSONAL: "personal"
};

export const REMOTE_STORE_KEY = "libraryTraktState";

export const WATCHLIST_KEY = "watchlist";

export const SIMKL_DEFAULT_LIST_KEY = "simkl:status:plantowatch";

export const PERSONAL_KEY_PREFIX = "personal:";

export const TRAKT_PAGE_LIMIT = 100;

export const TRAKT_LIST_FETCH_CONCURRENCY = 3;

export const TRAKT_LIBRARY_CACHE_TTL_MS = 60 * 1000;

export const META_TIMEOUT_MS = 2200;

export const META_BATCH_SIZE = 6;

export const VALID_POSTER_SHAPES = new Set(["POSTER", "LANDSCAPE", "SQUARE"]);

export const enrichedLibraryMetaCache = new Map();

export const ENRICHED_LIBRARY_META_CACHE_TTL_MS = 5 * 60 * 1000;

export function isMissingResourceError(error) {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  const message = String(error.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("PGRST202") ||
    message.includes("Could not find the table") ||
    message.includes("Could not find the function")
  );
}

export function withTimeout(promise, ms, fallbackValue) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackValue), ms);
    })
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export async function resolveProfileId() {
  const activeId = String(ProfileManager.getActiveProfileId() || "1");
  const direct = Number(activeId);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.trunc(direct);
  }

  const profiles = await ProfileManager.getProfiles();
  const activeProfile = profiles.find((profile) => String(profile.id || profile.profileIndex || "1") === activeId);
  const candidate = Number(activeProfile?.profileIndex || activeProfile?.id || 1);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : 1;
}

export async function resolveRemoteStoreKey() {
  const profileId = await resolveProfileId();
  let ownerId = "guest";
  if (AuthManager.isAuthenticated) {
    try {
      ownerId = String(await AuthManager.getEffectiveUserId());
    } catch {
      ownerId = "guest";
    }
  }
  return `${REMOTE_STORE_KEY}:${ownerId}:${profileId}`;
}

export function createEmptyRemoteState() {
  return {
    nextListId: 1,
    syncedAt: 0,
    watchlist: [],
    lists: [],
    listItems: {}
  };
}

export function cloneState(state) {
  return {
    nextListId: Number(state?.nextListId || 1),
    syncedAt: Number(state?.syncedAt || 0),
    watchlist: Array.isArray(state?.watchlist) ? state.watchlist.map((entry) => ({ ...entry })) : [],
    lists: Array.isArray(state?.lists) ? state.lists.map((entry) => ({ ...entry })) : [],
    listItems: Object.fromEntries(
      Object.entries(state?.listItems || {}).map(([key, value]) => [key, Array.isArray(value) ? value.map((item) => ({ ...item })) : []])
    )
  };
}

export async function readRemoteState() {
  const key = await resolveRemoteStoreKey();
  const stored = LocalStore.get(key, null);
  return cloneState(stored || createEmptyRemoteState());
}

export async function writeRemoteState(state) {
  const key = await resolveRemoteStoreKey();
  LocalStore.set(key, cloneState(state));
}

export function makeTypeLabel(type) {
  const key = String(type || "")
    .trim()
    .toLowerCase();
  if (!key) {
    return "Unknown";
  }
  if (key === "movie") {
    return "Movie";
  }
  if (key === "series") {
    return "Series";
  }
  return key
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function normalizeSavedItem(item = {}) {
  return {
    contentId: String(item.contentId || item.itemId || item.id || ""),
    contentType: String(item.contentType || item.itemType || item.type || "movie"),
    title: String(item.title || item.name || item.contentId || item.itemId || "Untitled"),
    poster: item.poster || null,
    posterShape: normalizePosterShape(item.posterShape || item.poster_shape),
    background: item.background || null,
    description: item.description || "",
    releaseInfo: item.releaseInfo || "",
    imdbRating: item.imdbRating == null ? null : Number(item.imdbRating),
    genres: Array.isArray(item.genres) ? item.genres : [],
    addonBaseUrl: item.addonBaseUrl || null,
    imdbId: item.imdbId || null,
    tmdbId: item.tmdbId == null ? null : Number(item.tmdbId),
    traktId: item.traktId == null ? null : Number(item.traktId),
    year: item.year == null ? null : Number(item.year),
    updatedAt: Number(item.updatedAt || item.listedAt || Date.now())
  };
}

export function normalizePosterShape(value) {
  const shape = String(value || "")
    .trim()
    .toUpperCase();
  return VALID_POSTER_SHAPES.has(shape) ? shape : "POSTER";
}

export function toSavedItemFromTraktWatchlist(entry) {
  if (!entry) return null;
  const itemId = entry.imdbId
    ? String(entry.imdbId)
    : entry.tmdbId
      ? `tmdb:${entry.tmdbId}`
      : entry.traktId
        ? `trakt:${entry.traktId}`
        : null;
  if (!itemId) return null;
  const listedAtMs = entry.addedAt ? new Date(entry.addedAt).getTime() : Date.now();
  return {
    itemType: entry.type === "show" ? "series" : entry.type || "movie",
    itemId,
    imdbId: entry.imdbId || null,
    tmdbId: entry.tmdbId || null,
    traktId: entry.traktId || null,
    title: entry.title || "",
    year: entry.year || null,
    releaseInfo: entry.year ? String(entry.year) : "",
    posterUrl: "",
    updatedAt: listedAtMs,
    listedAt: listedAtMs
  };
}

export function toRemoteListItem(item = {}, extra = {}) {
  const normalized = normalizeSavedItem(item);
  return {
    ...normalized,
    listedAt: Number(extra.listedAt || normalized.updatedAt || Date.now()),
    traktRank: extra.traktRank == null ? null : Number(extra.traktRank)
  };
}
