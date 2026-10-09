import { MDBLIST_API_BASE_URL } from "../../config.js";
import { MdbListSettingsStore } from "../local/mdbListSettingsStore.js";
import { parseMdbListRottenTomatoesPayload } from "../../core/util/mdbListRatingStatus.js";
import { withRequestTimeout } from "../../core/network/requestTimeout.js";
import { Platform } from "../../platform/index.js";
import { PluginServiceClient } from "../../platform/pluginServiceClient.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const API_BASE_URL = String(MDBLIST_API_BASE_URL || "https://api.mdblist.com/").replace(/\/+$/, "");

const PROVIDERS = [
  { key: "trakt", sources: ["trakt"], settingsKey: "showTrakt" },
  { key: "imdb", sources: ["imdb"], settingsKey: "showImdb", maximum: 10 },
  { key: "tmdb", sources: ["tmdb"], settingsKey: "showTmdb" },
  { key: "letterboxd", sources: ["letterboxd"], settingsKey: "showLetterboxd", maximum: 5 },
  { key: "tomatoes", sources: ["tomatoes"], settingsKey: "showTomatoes" },
  {
    key: "audience",
    sources: ["popcorn", "audience", "tomatoesaudience"],
    settingsKey: "showAudience"
  },
  { key: "metacritic", sources: ["metacritic"], settingsKey: "showMetacritic" },
  { key: "mal", sources: ["myanimelist", "mal"], settingsKey: "showMal", maximum: 10 }
];

const cache = new Map();
const inFlight = new Map();

function javaStringHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return hash;
}

function normalizeMediaType(rawType) {
  return ["series", "tv", "show", "tvshow"].includes(
    String(rawType || "")
      .trim()
      .toLowerCase()
  )
    ? "show"
    : "movie";
}

function extractImdbId(rawId) {
  return (
    String(rawId || "")
      .match(/tt\d+/i)?.[0]
      ?.toLowerCase() || ""
  );
}

function extractTmdbId(rawId) {
  const value = String(rawId || "").trim();
  return value.match(/^(?:tmdb:)?(?:(?:movie|series|tv):)?(\d+)(?:$|[:/])/i)?.[1] || "";
}

function numericId(value) {
  const trimmed = String(value || "").trim();
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function resolveMediaId(meta = {}, fallbackItemId = "", mediaType = "movie") {
  const imdb = firstNonEmpty(
    extractImdbId(meta.id),
    extractImdbId(fallbackItemId),
    extractImdbId(meta.imdbId),
    extractImdbId(meta.imdb_id),
    extractImdbId(meta.ids?.imdb),
    extractImdbId(meta.externalIds?.imdb),
    extractImdbId(meta.external_ids?.imdb_id)
  );
  if (imdb) return { provider: "imdb", id: imdb };

  // The media-info endpoint accepts TMDB IDs directly. A user's MDBList key
  // must work even when the separate TMDB enrichment integration is disabled.
  const tmdb = firstNonEmpty(
    extractTmdbId(meta.id),
    extractTmdbId(fallbackItemId),
    numericId(meta.tmdbId),
    numericId(meta.tmdb_id),
    numericId(meta.ids?.tmdb),
    numericId(meta.externalIds?.tmdb),
    numericId(meta.external_ids?.tmdb),
    numericId(meta.external_ids?.tmdb_id)
  );
  if (tmdb) return { provider: "tmdb", id: tmdb };

  const tvdb = firstNonEmpty(
    String(meta.id || "").match(/^tvdb:(\d+)(?:$|[:/])/i)?.[1],
    String(fallbackItemId || "").match(/^tvdb:(\d+)(?:$|[:/])/i)?.[1],
    numericId(meta.tvdbId),
    numericId(meta.tvdb_id),
    numericId(meta.ids?.tvdb),
    numericId(meta.externalIds?.tvdb),
    numericId(meta.external_ids?.tvdb_id)
  );
  return tvdb && mediaType === "show" ? { provider: "tvdb", id: tvdb } : null;
}

function requestError(status) {
  const error = new Error("MDBList request failed (" + (Number(status) || 0) + ")");
  error.status = Number(status) || 0;
  return error;
}

async function requestJson(path, apiKey, includeKeywords = false) {
  const url =
    API_BASE_URL +
    "/" +
    path +
    "?apikey=" +
    encodeURIComponent(apiKey) +
    (includeKeywords ? "&append_to_response=keyword" : "");
  // Read all sources through one GET, avoiding eight JSON POST preflights on
  // browser-based TVs and counting only one request against the API quota.
  return withRequestTimeout(async (signal) => {
    if (Platform.isWebOS() || Platform.isTizen()) {
      let serviceResponse;
      try {
        serviceResponse = await PluginServiceClient.fetch({
          url,
          method: "GET",
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxResponseBytes: MAX_RESPONSE_BYTES,
          signal
        });
      } catch (_error) {
        if (signal?.aborted) throw requestError(0);
        // Older packages may lack the service; use the normal browser path.
      }
      if (serviceResponse) {
        if (!serviceResponse.ok) throw requestError(serviceResponse.status);
        if (serviceResponse.truncated) throw new Error("MDBList response was truncated");
        return JSON.parse(serviceResponse.body || "");
      }
    }
    const response = await fetch(url, { method: "GET", ...(signal ? { signal } : {}) });
    if (!response.ok) throw requestError(response.status);
    return response.json();
  }, REQUEST_TIMEOUT_MS);
}

function validRating(value, maximum = 100) {
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= maximum ? numeric : null;
}

function parseRatings(payload) {
  if (!payload || !Array.isArray(payload.ratings)) return null;
  const entries = payload.ratings.map((entry) => ({
    source: String(entry?.source || "")
      .trim()
      .toLowerCase(),
    value: validRating(entry?.value),
    score: validRating(entry?.score)
  }));
  const ratings = Object.fromEntries(
    PROVIDERS.map(({ key, sources, maximum }) => [
      key,
      entries
        .filter((entry) => sources.includes(entry.source) && entry.value != null)
        .map((entry) =>
          validRating(
            key === "letterboxd" && entry.score != null ? entry.score / 20 : entry.value,
            maximum
          )
        )
        .find((value) => value != null) ?? null
    ])
  );
  const status = parseMdbListRottenTomatoesPayload(payload);
  return {
    ...ratings,
    tomatoesCertified: ratings.tomatoes != null && status.tomatoesCertified,
    audienceCertified: ratings.audience != null && status.audienceCertified
  };
}

function filterRatings(ratings, settings) {
  if (!ratings) return null;
  const filtered = Object.fromEntries(
    PROVIDERS.map(({ key, settingsKey }) => [
      key,
      settings[settingsKey] !== false ? ratings[key] : null
    ])
  );
  if (!Object.values(filtered).some((value) => value != null)) return null;
  return {
    ratings: {
      ...filtered,
      tomatoesCertified: filtered.tomatoes != null && ratings.tomatoesCertified,
      audienceCertified: filtered.audience != null && ratings.audienceCertified
    },
    hasImdbRating: filtered.imdb != null
  };
}

async function getRatings(meta, fallbackItemId, fallbackItemType, apiKey) {
  const mediaType = normalizeMediaType(meta?.apiType || meta?.type || fallbackItemType);
  const mediaId = resolveMediaId(meta, fallbackItemId, mediaType);
  if (!mediaId) return null;
  const cacheKey =
    mediaId.provider + ":" + mediaType + ":" + mediaId.id + ":" + javaStringHash(apiKey);
  const cached = cache.get(cacheKey);
  if (cached?.expiresAtMs > Date.now()) return cached.ratings;
  cache.delete(cacheKey);
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const request = requestJson(
    mediaId.provider + "/" + mediaType + "/" + encodeURIComponent(mediaId.id),
    apiKey,
    true
  )
    .then((payload) => {
      const ratings = parseRatings(payload);
      // A connection failure or empty/malformed response must not suppress
      // ratings for the rest of the session after the network recovers.
      if (ratings && PROVIDERS.some(({ key }) => ratings[key] != null)) {
        cache.set(cacheKey, { ratings, expiresAtMs: Date.now() + CACHE_TTL_MS });
      }
      return ratings;
    })
    .catch((error) => {
      console.warn(
        "MDBList ratings request failed",
        Number(error?.status) || error?.name || "Error"
      );
      return null;
    })
    .finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, request);
  return request;
}

export const mdbListRepository = {
  async validateApiKey(apiKey) {
    const trimmed = String(apiKey || "").trim();
    if (!trimmed) return true;
    try {
      await requestJson("user", trimmed);
      return true;
    } catch (error) {
      if ([401, 403].includes(error?.status)) return false;
      throw error;
    }
  },

  async getImdbRatingForItem(itemId, itemType = "movie") {
    const settings = MdbListSettingsStore.get();
    const apiKey = String(settings.apiKey || "").trim();
    if (!settings.enabled || !apiKey || settings.showImdb === false) return null;
    const ratings = await getRatings({ id: itemId, type: itemType }, itemId, itemType, apiKey);
    return ratings?.imdb ?? null;
  },

  async getRatingsForMeta(meta = {}, fallbackItemId = "", fallbackItemType = "movie") {
    const settings = MdbListSettingsStore.get();
    const apiKey = String(settings.apiKey || "").trim();
    if (
      !settings.enabled ||
      !apiKey ||
      !PROVIDERS.some(({ settingsKey }) => settings[settingsKey] !== false)
    ) {
      return null;
    }
    return filterRatings(
      await getRatings(meta, fallbackItemId, fallbackItemType, apiKey),
      settings
    );
  }
};
