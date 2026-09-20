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

import {
  META_BATCH_SIZE,
  enrichedLibraryMetaCache,
  ENRICHED_LIBRARY_META_CACHE_TTL_MS,
  withTimeout,
  META_TIMEOUT_MS,
  LibraryListType,
  PERSONAL_KEY_PREFIX,
  LibraryListPrivacy,
  readRemoteState,
  normalizeSavedItem,
  WATCHLIST_KEY,
  cloneState,
  toRemoteListItem
} from "./libraryRepositoryHelpers-01-library-source-mode.js";

export function mergeItemIntoMap(target, listKey, baseItem, listedAt, traktRank) {
  const key = `${baseItem.contentType}:${baseItem.contentId}`;
  const existing = target.get(key);
  const nextListMeta = {
    ...(existing?.listMeta || {}),
    [listKey]: {
      listedAt: Number(listedAt || Date.now()),
      traktRank: traktRank == null ? null : Number(traktRank)
    }
  };
  const nextListKeys = Array.from(new Set([...(existing?.listKeys || []), listKey]));
  target.set(key, {
    id: baseItem.contentId,
    type: baseItem.contentType,
    name: baseItem.title || existing?.name || baseItem.contentId,
    poster: baseItem.poster || existing?.poster || null,
    background: baseItem.background || existing?.background || null,
    description: baseItem.description || existing?.description || "",
    releaseInfo: baseItem.releaseInfo || existing?.releaseInfo || "",
    imdbRating: baseItem.imdbRating == null ? (existing?.imdbRating ?? null) : Number(baseItem.imdbRating),
    genres: Array.isArray(baseItem.genres) && baseItem.genres.length ? baseItem.genres : existing?.genres || [],
    addonBaseUrl: baseItem.addonBaseUrl || existing?.addonBaseUrl || null,
    imdbId: baseItem.imdbId || existing?.imdbId || null,
    tmdbId: baseItem.tmdbId ?? existing?.tmdbId ?? null,
    traktId: baseItem.traktId ?? existing?.traktId ?? null,
    year: baseItem.year ?? existing?.year ?? null,
    listKeys: nextListKeys,
    listedAt: Number(listedAt || existing?.listedAt || Date.now()),
    traktRank: traktRank == null ? (existing?.traktRank ?? null) : Number(traktRank),
    listMeta: nextListMeta
  });
}

export async function hydrateEntries(entries, { onBatch = null, shouldContinue = null } = {}) {
  const nextEntries = entries.map((entry) => ({
    ...entry,
    listKeys: [...entry.listKeys],
    listMeta: { ...(entry.listMeta || {}) }
  }));
  let hasPendingChanges = false;

  for (let index = 0; index < nextEntries.length; index += META_BATCH_SIZE) {
    if (shouldContinue && !shouldContinue()) {
      break;
    }
    const batch = nextEntries.slice(index, index + META_BATCH_SIZE);
    let didChange = false;
    await Promise.all(
      batch.map(async (entry) => {
        if (entry.poster && entry.name && entry.description) {
          return;
        }
        const cacheKey = `${entry.type}:${entry.id}`;
        const cached = enrichedLibraryMetaCache.get(cacheKey);
        const now = Date.now();
        let meta = cached && now - cached.timestamp < ENRICHED_LIBRARY_META_CACHE_TTL_MS ? cached.meta : null;
        if (!meta) {
          const result = await withTimeout(metaRepository.getMetaFromAllAddons(entry.type, entry.id), META_TIMEOUT_MS, {
            status: "error",
            message: "timeout"
          });
          if (result?.status !== "success" || !result?.data) {
            return;
          }
          meta = result.data;
          enrichedLibraryMetaCache.set(cacheKey, { meta, timestamp: now });
        }
        const before = JSON.stringify([entry.name, entry.poster, entry.background, entry.description, entry.releaseInfo, entry.genres]);
        entry.name = entry.name || meta.name || entry.id;
        entry.poster = entry.poster || meta.poster || meta.background || null;
        entry.background = entry.background || meta.background || null;
        entry.description = entry.description || meta.description || "";
        entry.releaseInfo = entry.releaseInfo || meta.releaseInfo || "";
        entry.genres = entry.genres?.length ? entry.genres : Array.isArray(meta.genres) ? meta.genres : [];
        didChange =
          didChange ||
          before !== JSON.stringify([entry.name, entry.poster, entry.background, entry.description, entry.releaseInfo, entry.genres]);
      })
    );
    hasPendingChanges = hasPendingChanges || didChange;
    const processedCount = Math.min(index + META_BATCH_SIZE, nextEntries.length);
    const shouldNotify = processedCount === nextEntries.length || processedCount % (META_BATCH_SIZE * 4) === 0;
    if (hasPendingChanges && shouldNotify && (!shouldContinue || shouldContinue())) {
      onBatch?.(nextEntries);
      hasPendingChanges = false;
    }
  }

  return nextEntries;
}

export function buildPersonalListTab(list = {}) {
  return {
    key: String(list.key || ""),
    title: String(list.title || "Untitled"),
    type: LibraryListType.PERSONAL,
    traktListId: String(list.traktListId || list.key || "").replace(PERSONAL_KEY_PREFIX, ""),
    slug: list.slug || null,
    description: list.description || null,
    privacy: list.privacy || LibraryListPrivacy.PRIVATE,
    sortBy: list.sortBy || null,
    sortHow: list.sortHow || null
  };
}

export async function getRemotePersonalTabs() {
  const state = await readRemoteState();
  return state.lists.map((entry) => buildPersonalListTab(entry));
}

export async function getLocalEntries({ hydrate = true } = {}) {
  const savedItems = await savedLibraryRepository.getAll(1000);
  const entriesMap = new Map();
  savedItems.forEach((item) => {
    const normalized = normalizeSavedItem(item);
    mergeItemIntoMap(entriesMap, "local", normalized, normalized.updatedAt, null);
  });
  const entries = Array.from(entriesMap.values());
  return hydrate ? hydrateEntries(entries) : entries;
}

export async function getRemoteEntries({ hydrate = true } = {}) {
  const personalState = await readRemoteState();
  const entriesMap = new Map();

  personalState.watchlist.forEach((item, index) => {
    const normalized = normalizeSavedItem(item);
    mergeItemIntoMap(entriesMap, WATCHLIST_KEY, normalized, normalized.updatedAt, index);
  });

  personalState.lists.forEach((list) => {
    const listKey = String(list.key || "");
    const items = Array.isArray(personalState.listItems?.[listKey]) ? personalState.listItems[listKey] : [];
    items.forEach((item, index) => {
      const normalized = normalizeSavedItem(item);
      mergeItemIntoMap(entriesMap, listKey, normalized, Number(item.listedAt || normalized.updatedAt || Date.now()), index);
    });
  });

  const entries = Array.from(entriesMap.values());
  return hydrate ? hydrateEntries(entries) : entries;
}

export function membershipMapFromEntries(entries, listTabs) {
  const allKeys = listTabs.map((tab) => tab.key);
  return (item) => {
    const itemKey = `${item.itemType || item.type || "movie"}:${item.itemId || item.id || ""}`;
    const found = entries.find((entry) => `${entry.type}:${entry.id}` === itemKey);
    return {
      listMembership: Object.fromEntries(allKeys.map((key) => [key, Boolean(found?.listKeys?.includes(key))]))
    };
  };
}

export function upsertPersonalItem(state, listKey, item) {
  const nextState = cloneState(state);
  const list = Array.isArray(nextState.listItems[listKey]) ? nextState.listItems[listKey] : [];
  const normalized = toRemoteListItem(item, { listedAt: Date.now() });
  nextState.listItems[listKey] = [
    normalized,
    ...list.filter((entry) => !(String(entry.contentId) === normalized.contentId && String(entry.contentType) === normalized.contentType))
  ];
  return nextState;
}

export function removePersonalItem(state, listKey, item) {
  const nextState = cloneState(state);
  const current = Array.isArray(nextState.listItems[listKey]) ? nextState.listItems[listKey] : [];
  nextState.listItems[listKey] = current.filter((entry) => {
    return !(
      String(entry.contentId) === String(item.itemId || item.id || "") &&
      String(entry.contentType || "movie") === String(item.itemType || item.type || "movie")
    );
  });
  return nextState;
}

export function traktErrorMessage(payload, fallback, status) {
  const message = payload && typeof payload === "object" ? payload.message || payload.error_description || payload.error : null;
  return String(message || `${fallback} (${status})`);
}
