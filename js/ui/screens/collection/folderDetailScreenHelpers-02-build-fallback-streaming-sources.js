import { Router } from "../../navigation/router.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { Environment } from "../../../platform/environment.js";

import { getTvRuntimePerformanceProfile } from "../../../platform/tvRuntimePerformance.js";

import { addonRepository } from "../../../data/repository/addonRepository.js";

import { catalogRepository } from "../../../data/repository/catalogRepository.js";

import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";

import { watchedTitleStateRepository } from "../../../data/repository/watchedTitleStateRepository.js";

import { CollectionsStore } from "../../../data/local/collectionsStore.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { TmdbService } from "../../../core/tmdb/tmdbService.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";

import { catalogSkipStep, catalogSupportsExtra } from "../../../core/addons/homeCatalogs.js";

import { toTraktImageUrl } from "../../../core/trakt/traktImageUrl.js";

import { TMDB_API_KEY, TRAKT_API_URL, TRAKT_CLIENT_ID } from "../../../config.js";

import {
  HomeScreen,
  buildModernHomeSizingStyle,
  buildModernHeroPresentation,
  createPosterCardMarkup,
  createSeeAllCardMarkup,
  escapeAttribute,
  escapeHtml,
  formatCatalogRowTitle,
  normalizeCollectionFolderItem,
  renderContinueWatchingSection
} from "../home/homeScreen.js";

import { renderModernHomeLayout } from "../home/modernHomeLayout.js";

import { buildWatchedTitleIdSet, isTitleItemWatched, renderTitleWatchedBadge } from "../../components/watchedTitleBadge.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import {
  normalizePresetKey,
  STREAMING_NETWORK_PRESETS,
  firstNonEmpty,
  normalizeItem
} from "./folderDetailScreenHelpers-01-tmdb-api-url.js";

export function buildFallbackStreamingSources(folder = {}) {
  const key = normalizePresetKey(folder.title || folder.name || "");
  const preset = STREAMING_NETWORK_PRESETS.get(key);
  if (!preset?.tmdbId) {
    return [];
  }
  return [
    {
      provider: "tmdb",
      tmdbSourceType: "NETWORK",
      title: `${preset.title} Popular`,
      tmdbId: preset.tmdbId,
      mediaType: "TV",
      sortBy: "popularity.desc",
      filters: {}
    },
    {
      provider: "tmdb",
      tmdbSourceType: "NETWORK",
      title: `${preset.title} Recent`,
      tmdbId: preset.tmdbId,
      mediaType: "TV",
      sortBy: "first_air_date.desc",
      filters: {}
    }
  ];
}

export function groupNodesByOffsetTop(nodes = []) {
  const grouped = [];
  nodes.forEach((node) => {
    const top = Math.round(node.offsetTop);
    const bucket = grouped.find((entry) => Math.abs(entry.top - top) <= 6);
    if (bucket) {
      bucket.nodes.push(node);
      return;
    }
    grouped.push({ top, nodes: [node] });
  });
  grouped.sort((left, right) => left.top - right.top);
  return grouped.map((entry) => entry.nodes);
}

export function roundRobinMerge(lists = []) {
  const result = [];
  const seen = new Set();
  const maxSize = lists.reduce((max, list) => Math.max(max, Array.isArray(list) ? list.length : 0), 0);
  for (let index = 0; index < maxSize; index += 1) {
    lists.forEach((list) => {
      const item = list?.[index];
      const key = `${item?.type || item?.apiType || "movie"}:${item?.id || ""}`;
      if (!item?.id || seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(item);
    });
  }
  return result;
}

export function buildAddonTabLabel(source = {}, addons = []) {
  const addon = findAddonForSource(source, addons);
  const catalog =
    addon?.catalogs?.find(
      (entry) => String(entry?.id || "") === String(source.catalogId || "") && String(entry?.apiType || "") === String(source.type || "")
    ) || null;
  const baseName = firstNonEmpty(catalog?.name, source.catalogName, source.title, source.catalogId || source.type || "Catalog");
  return source.genre ? `${baseName} · ${source.genre}` : baseName;
}

export function sameAddonUrl(left = "", right = "") {
  const leftUrl = String(left || "").trim();
  const rightUrl = String(right || "").trim();
  if (!leftUrl || !rightUrl) {
    return false;
  }
  return addonRepository.canonicalizeUrl(leftUrl) === addonRepository.canonicalizeUrl(rightUrl);
}

export function findAddonForSource(source = {}, addons = []) {
  return (
    addons.find((entry) => String(entry?.id || "") === String(source.addonId || "")) ||
    addons.find((entry) => sameAddonUrl(entry?.baseUrl, source.addonBaseUrl)) ||
    null
  );
}

export function buildTmdbTabLabel(source = {}) {
  return firstNonEmpty(source.title, source.tmdbSourceType || "TMDB");
}

export function buildTraktTabLabel(source = {}) {
  return firstNonEmpty(source.title, `List ${source.traktListId || ""}`);
}

export function stableSourceValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSourceValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = stableSourceValue(value[key]);
        return accumulator;
      }, {});
  }
  return value ?? null;
}

export function buildFolderSourceKey(source = {}, index = 0) {
  const provider = String(source.provider || "addon").toLowerCase();
  const signature = {
    provider,
    index,
    addonId: source.addonId || "",
    catalogId: source.catalogId || "",
    type: source.type || source.apiType || "",
    genre: source.genre || "",
    tmdbSourceType: source.tmdbSourceType || "",
    tmdbId: source.tmdbId ?? "",
    mediaType: source.mediaType || "",
    title: source.title || "",
    sortBy: source.sortBy || "",
    filters: stableSourceValue(source.filters || {})
  };
  return `${provider}:${index}:${JSON.stringify(stableSourceValue(signature))}`;
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(payload?.message || payload?.error || response.statusText || "Request failed"));
  }
  return { response, payload };
}

export async function fetchAddonSourceItems(source = {}, page = 1, skipOverride = null) {
  const addons = await addonRepository.getInstalledAddons();
  let effectiveAddon = findAddonForSource(source, addons);
  const extraArgs = source.genre ? { genre: source.genre } : {};
  const sourceCatalogId = String(source.catalogId || "");
  const sourceCatalogIdBase = sourceCatalogId.split(",")[0].trim();
  const sourceTypeValue = String(source.type || source.apiType || "");
  const findCatalog = (candidateAddon, allowBaseId = false) => {
    const catalogs = candidateAddon?.catalogs || [];
    return (
      catalogs.find((entry) => String(entry?.id || "") === sourceCatalogId && String(entry?.apiType || "") === sourceTypeValue) ||
      (allowBaseId && sourceCatalogIdBase && sourceCatalogIdBase !== sourceCatalogId
        ? catalogs.find((entry) => String(entry?.id || "") === sourceCatalogIdBase && String(entry?.apiType || "") === sourceTypeValue)
        : null)
    );
  };
  let catalog = findCatalog(effectiveAddon, true) || null;
  if (!catalog) {
    for (const candidate of addons) {
      const match = findCatalog(candidate);
      if (match) {
        effectiveAddon = candidate;
        catalog = match;
        break;
      }
    }
  }
  const addonBaseUrl = firstNonEmpty(effectiveAddon?.baseUrl, source.addonBaseUrl);
  if (!addonBaseUrl) {
    throw new Error("Addon not found");
  }
  const supportsSkip = catalogSupportsExtra(catalog, "skip");
  const skipStep = catalogSkipStep(catalog);
  const requestedSkip = skipOverride == null ? Number.NaN : Number(skipOverride);
  const skip = Number.isFinite(requestedSkip) ? Math.max(0, Math.trunc(requestedSkip)) : Math.max(0, (page - 1) * skipStep);
  const result = await catalogRepository.getCatalog({
    addonBaseUrl,
    addonId: firstNonEmpty(effectiveAddon?.id, source.addonId, addonBaseUrl),
    addonName: firstNonEmpty(effectiveAddon?.displayName, effectiveAddon?.name, source.addonName, "Addon"),
    catalogId: source.catalogId,
    catalogName: buildAddonTabLabel(source, addons),
    type: source.type,
    skip,
    skipStep,
    extraArgs,
    supportsSkip
  });
  if (result?.status !== "success") {
    throw new Error(String(result?.message || "Could not load catalog"));
  }
  const reportedNextSkip = Number(result.data?.nextSkip);
  const items = (result.data?.items || []).map((item) => normalizeItem(item, source.type)).filter((item) => item.id);
  return {
    items,
    hasMore: Boolean(result.data?.hasMore),
    supportsSkip: Boolean(result.data?.supportsSkip),
    skipStep: Number(result.data?.skipStep || skipStep),
    page,
    nextSkip: Number.isFinite(reportedNextSkip) ? Math.max(0, Math.trunc(reportedNextSkip)) : skip + items.length
  };
}

export function getTmdbApiKey() {
  const settings = TmdbSettingsStore.get();
  return settings.enabled ? String(TMDB_API_KEY || "").trim() : "";
}

export function getTmdbLanguage() {
  return String(TmdbSettingsStore.get().language || "en-US").trim() || "en-US";
}
