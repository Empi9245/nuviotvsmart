import { Platform } from "../../platform/index.js";

import { isWebOsCompanionServiceAvailable, requestWebOsCompanionService } from "../../platform/webos/webosCompanionService.js";

import { TorrentSettingsStore } from "../../data/local/torrentSettingsStore.js";

export const ENGINEFS_CREATE_TIMEOUT_MS = 60000;

export const ENGINEFS_KIND = "webos-enginefs";

export function isP2pEnabledForActiveProfile() {
  return Boolean(TorrentSettingsStore.get().p2pEnabled);
}

export const LOCAL_HOST_NAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export function logEngineFsDebug(...args) {
  if (globalThis.__NUVIO_DEBUG_ENGINEFS__) {
    console.info(...args);
  }
}

export function normalizeInfoHash(value = "") {
  const hash = String(value || "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{40}$/.test(hash) ? hash : "";
}

export function getInfoHash(stream = {}) {
  // Try direct infoHash fields first
  const direct = stream.infoHash || stream.raw?.infoHash || stream.clientResolve?.infoHash || stream.raw?.clientResolve?.infoHash;
  if (normalizeInfoHash(direct)) {
    return normalizeInfoHash(direct);
  }

  // Helper: extract from magnet URI
  function extractInfoHashFromMagnet(value = "") {
    if (typeof value !== "string") return "";
    const m = value.match(/xt=urn:btih:([0-9A-Fa-f]{40})/);
    if (m) return normalizeInfoHash(m[1]);
    const m2 = value.match(/magnet:\?xt=urn:btih:([0-9A-Fa-f]{40})/);
    if (m2) return normalizeInfoHash(m2[1]);
    return "";
  }

  // Check known URI fields
  const fieldsToCheck = [
    stream.url,
    stream.externalUrl,
    stream.torrentMagnetUri,
    stream.clientResolve?.magnetUri,
    stream.raw?.magnetUri,
    stream.raw?.torrentMagnetUri
  ];
  for (const val of fieldsToCheck) {
    const ih = normalizeInfoHash(val) || extractInfoHashFromMagnet(val);
    if (ih) return ih;
  }

  // Recursively scan `raw` for a magnet/xt entry
  function scanObjectForMagnet(obj) {
    if (!obj || typeof obj !== "object") return "";
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string") {
        const ih = normalizeInfoHash(v) || extractInfoHashFromMagnet(v);
        if (ih) return ih;
      } else if (typeof v === "object") {
        const ih = scanObjectForMagnet(v);
        if (ih) return ih;
      }
    }
    return "";
  }

  const rawScan = scanObjectForMagnet(stream.raw || stream);
  if (rawScan) return rawScan;

  return "";
}

export function getMagnetUri(stream = {}) {
  const candidates = [
    stream.torrentMagnetUri,
    stream.magnetUri,
    stream.url,
    stream.externalUrl,
    stream.clientResolve?.magnetUri,
    stream.raw?.torrentMagnetUri,
    stream.raw?.magnetUri,
    stream.raw?.url,
    stream.raw?.externalUrl,
    stream.raw?.clientResolve?.magnetUri
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().toLowerCase().startsWith("magnet:?")) {
      return value.trim();
    }
  }
  return "";
}

export function isMagnetUri(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .startsWith("magnet:");
}

export function isLocalEngineFsPlaybackUrl(value = "") {
  if (!isLocalHostUrl(value)) {
    return false;
  }
  try {
    return /^\/[0-9a-f]{40}\/-?\d+(?:\/|$)/i.test(new URL(String(value)).pathname);
  } catch (_) {
    return false;
  }
}

export function getDirectPlaybackUrl(stream = {}) {
  const candidates = [stream.url, stream.externalUrl];
  return (
    candidates.find((value) => {
      const url = String(value || "").trim();
      return url && !isMagnetUri(url) && !isLocalEngineFsPlaybackUrl(url);
    }) || ""
  );
}

export function normalizeTrackerSource(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  return source.replace(/^tracker:/i, "").trim();
}

export function trackerSourcesFromMagnet(magnetUri = "") {
  const raw = String(magnetUri || "").trim();
  if (!raw.toLowerCase().startsWith("magnet:?")) {
    return [];
  }
  try {
    const query = raw.slice(raw.indexOf("?") + 1);
    const params = new URLSearchParams(query);
    return params.getAll("tr").map(normalizeTrackerSource).filter(Boolean);
  } catch (_) {
    const matches = raw.match(/[?&]tr=([^&]+)/gi) || [];
    return matches
      .map((entry) => decodeURIComponent(String(entry).replace(/^[?&]tr=/i, "")))
      .map(normalizeTrackerSource)
      .filter(Boolean);
  }
}

export function getTrackerSources(stream = {}, magnetUri = "") {
  const lists = [
    trackerSourcesFromMagnet(magnetUri),
    stream.sources,
    stream.announce,
    stream.trackers,
    stream.clientResolve?.sources,
    stream.clientResolve?.announce,
    stream.raw?.sources,
    stream.raw?.announce,
    stream.raw?.trackers,
    stream.raw?.clientResolve?.sources,
    stream.raw?.clientResolve?.announce
  ];
  const seen = new Set();
  const result = [];
  lists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((entry) => {
      const normalized = normalizeTrackerSource(entry);
      const key = normalized.toLowerCase();
      if (normalized && !seen.has(key)) {
        seen.add(key);
        result.push(normalized);
      }
    });
  });
  return result;
}

export function normalizeBaseUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (parsed.protocol !== "http:" || !LOCAL_HOST_NAMES.has(hostname)) {
      return "";
    }
    return `http://${parsed.hostname}:${parsed.port || "80"}`;
  } catch (_) {
    return "";
  }
}

export function isLocalHostUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return parsed.protocol === "http:" && LOCAL_HOST_NAMES.has(hostname);
  } catch (_) {
    return false;
  }
}

export function normalizeLocalPlaybackUrl(value = "") {
  const normalized = String(value || "").trim();
  return normalized && isLocalHostUrl(normalized) ? normalized : "";
}

export function buildPlaybackUrl(baseUrl, infoHash, fileIdx, sources = []) {
  const url = `${String(baseUrl || "").replace(/\/$/, "")}/${encodeURIComponent(infoHash)}/${String(fileIdx)}`;
  const cleanSources = (Array.isArray(sources) ? sources : []).map((source) => String(source || "").trim()).filter(Boolean);
  if (!cleanSources.length) {
    return url;
  }
  const params = new URLSearchParams();
  cleanSources.forEach((source) => {
    params.append("tr", source);
  });
  return `${url}?${params.toString()}`;
}

export function withTimeout(promise, timeoutMs, message) {
  let timeoutId = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => {
        reject(new Error(message || "Request timed out"));
      },
      Math.max(1, Number(timeoutMs || 0))
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
