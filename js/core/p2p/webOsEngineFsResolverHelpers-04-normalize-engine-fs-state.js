import { Platform } from "../../platform/index.js";

import { isWebOsCompanionServiceAvailable, requestWebOsCompanionService } from "../../platform/webos/webosCompanionService.js";

import { TorrentSettingsStore } from "../../data/local/torrentSettingsStore.js";

import {
  ENGINEFS_KIND,
  normalizeInfoHash,
  isLocalHostUrl,
  normalizeLocalPlaybackUrl
} from "./webOsEngineFsResolverHelpers-01-enginefs-create-timeout-ms.js";
import { guessMimeFromPath } from "./webOsEngineFsResolverHelpers-03-wait-for-engine-fs-ready.js";

export function normalizeEngineFsState(value = {}) {
  const source = value || {};
  if (source.kind !== ENGINEFS_KIND) {
    return null;
  }
  const infoHash = normalizeInfoHash(source.infoHash);
  if (!infoHash) {
    return null;
  }
  const fileIdx = Number(source.fileIdx);
  const rawPlaybackUrl = String(source.playbackUrl || source.url || "").trim();
  if (rawPlaybackUrl && !isLocalHostUrl(rawPlaybackUrl)) {
    return null;
  }
  const playbackUrl = normalizeLocalPlaybackUrl(rawPlaybackUrl);
  return {
    kind: ENGINEFS_KIND,
    infoHash,
    fileIdx: Number.isFinite(fileIdx) ? fileIdx : -1,
    playbackUrl,
    mimeType: String(source.mimeType || source.sourceType || "").trim() || null,
    baseUrlKind: "local-service",
    publicPlaybackUrl: normalizeLocalPlaybackUrl(source.publicPlaybackUrl || "") || null
  };
}

export function getResolvedMimeType(stream = {}, filename = "", playbackUrl = "") {
  return (
    guessMimeFromPath(filename) ||
    guessMimeFromPath(playbackUrl) ||
    stream?.mimeType ||
    stream?.raw?.mimeType ||
    stream?.sourceType ||
    stream?.raw?.type ||
    null
  );
}

export function buildResolvedStream(
  stream = {},
  { infoHash, fileIdx, playbackUrl, filename = "", baseUrlKind = "public-service", publicPlaybackUrl = "" } = {}
) {
  const finalMime = getResolvedMimeType(stream, filename, playbackUrl);
  const engineFs = {
    kind: ENGINEFS_KIND,
    infoHash,
    fileIdx,
    playbackUrl,
    baseUrlKind,
    publicPlaybackUrl,
    mimeType: finalMime
  };
  return {
    ...stream,
    infoHash,
    fileIdx,
    url: playbackUrl,
    mimeType: finalMime,
    sourceType: finalMime || stream.sourceType,
    externalUrl: null,
    behaviorHints: {
      ...(stream.behaviorHints || {}),
      filename: filename || (stream.behaviorHints && stream.behaviorHints.filename) || null
    },
    engineFs,
    raw: {
      ...(stream.raw || stream),
      engineFs,
      mimeType: finalMime,
      sourceType: finalMime || stream.sourceType,
      type: finalMime
    }
  };
}
