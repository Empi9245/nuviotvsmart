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

import { traktErrorMessage } from "./libraryRepositoryHelpers-02-merge-item-into-map.js";
import {
  PERSONAL_KEY_PREFIX,
  LibraryListPrivacy,
  TRAKT_PAGE_LIMIT,
  TRAKT_LIST_FETCH_CONCURRENCY
} from "./libraryRepositoryHelpers-01-library-source-mode.js";

export async function authorizedTraktRequest(path, options = {}) {
  const token = await TraktAuthService.getValidAccessToken();
  if (!token) {
    throw new Error("Trakt authentication required");
  }
  const { response, payload } = await requestJson(path, {
    ...options,
    authorization: `Bearer ${token}`
  });
  if (!response.ok) {
    throw new Error(traktErrorMessage(payload, options.errorMessage || "Trakt request failed", response.status));
  }
  return { response, payload };
}

export function toPersonalList(raw = {}) {
  const traktListId = raw.ids?.trakt;
  const slug = raw.ids?.slug || null;
  const pathId = traktListId == null ? slug : String(traktListId);
  if (!pathId) return null;
  return {
    key: `${PERSONAL_KEY_PREFIX}${pathId}`,
    title: String(raw.name || "Untitled"),
    description: raw.description || null,
    privacy: raw.privacy || LibraryListPrivacy.PRIVATE,
    traktListId: traktListId == null ? null : String(traktListId),
    slug,
    sortBy: raw.sort_by || null,
    sortHow: raw.sort_how || null
  };
}

export function bestTraktImage(images = {}, kind) {
  const candidates = images?.[kind];
  let url = null;
  if (Array.isArray(candidates)) {
    url = candidates.find((entry) => typeof entry === "string") || null;
  } else if (typeof candidates === "string") {
    url = candidates;
  } else if (candidates && typeof candidates === "object") {
    url = candidates.full || candidates.medium || candidates.thumb || null;
  }
  return url ? toTraktImageUrl(url) : null;
}

export function toSavedItemFromTraktList(entry) {
  const media = entry?.movie || entry?.show;
  const type = entry?.movie ? "movie" : entry?.show ? "series" : null;
  if (!media || !type) return null;
  const ids = media.ids || {};
  const contentId = ids.imdb ? String(ids.imdb) : ids.tmdb != null ? `tmdb:${ids.tmdb}` : ids.trakt != null ? `trakt:${ids.trakt}` : null;
  if (!contentId) return null;
  const listedAt = Date.parse(entry.listed_at || "") || Date.now();
  return {
    contentId,
    contentType: type,
    title: String(media.title || contentId),
    poster: bestTraktImage(media.images, "poster"),
    background: bestTraktImage(media.images, "fanart"),
    description: media.overview || "",
    releaseInfo: media.year == null ? "" : String(media.year),
    imdbRating: media.rating == null ? null : Number(media.rating),
    genres: Array.isArray(media.genres) ? media.genres : [],
    imdbId: ids.imdb || null,
    tmdbId: ids.tmdb == null ? null : Number(ids.tmdb),
    traktId: ids.trakt == null ? null : Number(ids.trakt),
    year: media.year == null ? null : Number(media.year),
    updatedAt: listedAt,
    listedAt,
    traktRank: entry.rank == null ? null : Number(entry.rank)
  };
}

export async function fetchAllTraktPages(pathForPage) {
  const items = [];
  let page = 1;
  while (true) {
    const { response, payload } = await authorizedTraktRequest(pathForPage(page), {
      errorMessage: "Could not load Trakt list items"
    });
    if (!Array.isArray(payload)) break;
    items.push(...payload);
    const pageCount = Math.max(1, Number(response.headers.get("X-Pagination-Page-Count") || 1) || 1);
    if (page >= pageCount) break;
    page += 1;
  }
  return items;
}

export async function fetchTraktListItems(list) {
  const listId = list.traktListId || list.slug || list.key.replace(PERSONAL_KEY_PREFIX, "");
  const query = (page) => {
    const params = new URLSearchParams({
      extended: "full,images",
      page: String(page),
      limit: String(TRAKT_PAGE_LIMIT)
    });
    if (list.sortBy) params.set("sort_by", list.sortBy);
    if (list.sortHow) params.set("sort_how", list.sortHow);
    return params.toString();
  };
  const [movies, shows] = await Promise.all(
    ["movie", "show"].map((type) =>
      fetchAllTraktPages((page) => `/users/me/lists/${encodeURIComponent(listId)}/items/${type}?${query(page)}`)
    )
  );
  return [...movies, ...shows].map(toSavedItemFromTraktList).filter(Boolean);
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function fetchTraktPersonalState() {
  const { payload } = await authorizedTraktRequest("/users/me/lists", {
    errorMessage: "Could not load Trakt personal lists"
  });
  const lists = (Array.isArray(payload) ? payload : [])
    .filter((list) => String(list?.type || "personal").toLowerCase() === "personal")
    .map(toPersonalList)
    .filter(Boolean);
  const itemGroups = await mapWithConcurrency(lists, TRAKT_LIST_FETCH_CONCURRENCY, fetchTraktListItems);
  return { lists, itemGroups };
}

export function resolveTraktIds(item = {}) {
  const rawId = String(item.itemId || item.id || item.contentId || "").trim();
  const prefixed = rawId.match(/^(imdb|tmdb|trakt):(.+)$/i);
  const ids = {
    imdb: item.imdbId || (prefixed?.[1].toLowerCase() === "imdb" ? prefixed[2] : null),
    tmdb: item.tmdbId ?? (prefixed?.[1].toLowerCase() === "tmdb" ? Number(prefixed[2]) : null),
    trakt: item.traktId ?? (prefixed?.[1].toLowerCase() === "trakt" ? Number(prefixed[2]) : null)
  };
  if (!ids.imdb && /^tt\d+$/i.test(rawId)) ids.imdb = rawId;
  if (!ids.imdb && !Number.isFinite(ids.tmdb) && !Number.isFinite(ids.trakt)) {
    throw new Error("This item has no Trakt-compatible ID");
  }
  return Object.fromEntries(Object.entries(ids).filter(([, value]) => value != null && value !== ""));
}

export function buildTraktMutationBody(item) {
  const type = String(item.itemType || item.type || "movie").toLowerCase();
  const entry = {
    title: item.title || item.name || undefined,
    year: item.year == null ? undefined : Number(item.year),
    ids: resolveTraktIds(item)
  };
  return type === "movie" ? { movies: [entry] } : { shows: [entry] };
}
