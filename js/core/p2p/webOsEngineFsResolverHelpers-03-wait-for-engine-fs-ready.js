import { Platform } from "../../platform/index.js";

import { isWebOsCompanionServiceAvailable, requestWebOsCompanionService } from "../../platform/webos/webosCompanionService.js";

import { TorrentSettingsStore } from "../../data/local/torrentSettingsStore.js";

import { withTimeout } from "./webOsEngineFsResolverHelpers-01-enginefs-create-timeout-ms.js";
import {
  PROBE_TIMEOUT_MS,
  getEngineFsReadinessSnapshot,
  READINESS_TIMEOUT_MS,
  isEngineFsSwarmActive,
  hasEnoughEngineFsBuffer,
  READINESS_MIN_ACTIVE_WAIT_MS,
  finiteNumber,
  READINESS_MIN_ACTIVE_BYTES,
  READINESS_RANGE_ONLY_FALLBACK_MS,
  READINESS_POLL_INTERVAL_MS
} from "./webOsEngineFsResolverHelpers-02-describe-error.js";

export async function waitForEngineFsReady(baseCandidate, infoHash, fileIdx, playbackUrl, _options = {}) {
  const start = Date.now();
  let baseRoot = String(baseCandidate || "").replace(/\/$/, "");
  try {
    // prefer origin when possible
    baseRoot = new URL(baseCandidate).origin;
  } catch (_) {
    // keep provided baseCandidate as-is
  }

  const diag = {
    statsAttempts: 0,
    statsSuccess: false,
    statsLastJson: null,
    statsLastStatus: null,
    rangeAttempts: 0,
    rangeSuccess: false,
    rangeLastStatus: null,
    rangeLastBytes: 0,
    elapsedMs: 0,
    readyReason: null,
    activeSeen: false,
    bufferedReady: false,
    statsLastSnapshot: null
  };

  const statsUrlFor = (ih, idx) => `${baseRoot}/${encodeURIComponent(ih)}/${idx}/stats.json`;
  const rangeUrlFor = (ih, idx) => `${baseRoot}/${encodeURIComponent(ih)}/${idx}`;

  const probeRangeAt = async (url) => {
    diag.rangeAttempts++;
    try {
      const resp = await withTimeout(
        fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" }, cache: "no-cache" }),
        PROBE_TIMEOUT_MS,
        "EngineFS range probe timed out"
      );
      if (!resp) return false;
      diag.rangeLastStatus = resp.status;
      if (resp.status === 200 || resp.status === 206) {
        try {
          const buf = await resp.arrayBuffer();
          const len = buf ? buf.byteLength : 0;
          diag.rangeLastBytes = len;
          if (len > 0) {
            diag.rangeSuccess = true;
            return true;
          }
        } catch (_) {
          const cl = resp.headers && resp.headers.get && resp.headers.get("content-length");
          const n = cl ? Number(cl) : 0;
          diag.rangeLastBytes = n;
          if (n > 0) {
            diag.rangeSuccess = true;
            return true;
          }
        }
      }
    } catch (_) {
      // ignore transient errors
    }
    return false;
  };

  const probeStats = async (ih, idx) => {
    diag.statsAttempts++;
    try {
      const url = statsUrlFor(ih, idx);
      const resp = await withTimeout(fetch(url, { method: "GET", cache: "no-cache" }), PROBE_TIMEOUT_MS, "EngineFS stats probe timed out");
      if (!resp) return false;
      diag.statsLastStatus = resp.status;
      if (!resp.ok) return false;
      const json = await resp.json().catch(() => null);
      diag.statsLastJson = json;
      if (!json) return false;
      diag.statsLastSnapshot = getEngineFsReadinessSnapshot(json);
      if (json.streamName || Number(json.streamLen) > 0) {
        diag.statsSuccess = true;
        return true;
      }
    } catch (_) {
      // ignore
    }
    return false;
  };

  while (Date.now() - start < READINESS_TIMEOUT_MS) {
    // If we have a valid fileIdx, probe stats for diagnostics
    if (Number.isFinite(fileIdx) && fileIdx >= 0) {
      try {
        await probeStats(infoHash, fileIdx);
      } catch (_) {}
    }

    const elapsedMs = Date.now() - start;
    const snapshot = diag.statsLastSnapshot || {};
    diag.activeSeen = diag.activeSeen || isEngineFsSwarmActive(snapshot);
    diag.bufferedReady = hasEnoughEngineFsBuffer(snapshot);

    // Prefer probing the exact playbackUrl when provided; otherwise probe the /{infoHash}/{idx} path
    try {
      let rangeReady = false;
      if (playbackUrl) {
        rangeReady = await probeRangeAt(playbackUrl);
      } else if (Number.isFinite(fileIdx) && fileIdx >= 0) {
        rangeReady = await probeRangeAt(rangeUrlFor(infoHash, fileIdx));
      }

      if (rangeReady) {
        if (diag.bufferedReady) {
          diag.elapsedMs = Date.now() - start;
          diag.readyReason = "buffered";
          return { ready: true, diag };
        }

        if (diag.statsSuccess && diag.activeSeen) {
          if (elapsedMs >= READINESS_MIN_ACTIVE_WAIT_MS && finiteNumber(snapshot.downloaded) >= READINESS_MIN_ACTIVE_BYTES) {
            diag.elapsedMs = Date.now() - start;
            diag.readyReason = "active-min-wait";
            return { ready: true, diag };
          }
        } else if (!diag.statsSuccess && elapsedMs >= READINESS_RANGE_ONLY_FALLBACK_MS) {
          diag.elapsedMs = Date.now() - start;
          diag.readyReason = "range-only-fallback";
          return { ready: true, diag };
        }
      }
    } catch (_) {
      // ignore transient errors
    }

    await new Promise((r) => setTimeout(r, READINESS_POLL_INTERVAL_MS));
  }

  diag.elapsedMs = Date.now() - start;
  if (diag.rangeSuccess && (diag.bufferedReady || diag.activeSeen)) {
    diag.readyReason = diag.bufferedReady ? "timeout-buffered" : "timeout-active";
    return { ready: true, diag };
  }
  return { ready: false, diag };
}

export function selectFileIdx(stream = {}, createJson = {}) {
  const explicitFileIdx = Number(stream.fileIdx ?? stream.raw?.fileIdx);
  if (Number.isFinite(explicitFileIdx) && explicitFileIdx >= 0) {
    return explicitFileIdx;
  }

  // Prefer explicit fileIdx returned by the create JSON if present
  const createFileIdxCandidates = [
    createJson && createJson.fileIdx,
    createJson && createJson.fileIndex,
    createJson && createJson.idx,
    createJson && createJson.index
  ];
  for (const cand of createFileIdxCandidates) {
    const n = Number(cand);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const guessedFileIdx = Number(createJson && createJson.guessedFileIdx);
  if (Number.isFinite(guessedFileIdx) && guessedFileIdx >= 0) {
    return guessedFileIdx;
  }
  return -1;
}

export function getFileNameFromCreateJson(createJson = {}, fileIdx) {
  try {
    if (!createJson || !Array.isArray(createJson.files)) return "";
    const f = createJson.files[fileIdx];
    if (!f) return "";
    // prefer `name` then `filename`
    return String(f.name || f.filename || "").trim();
  } catch (_) {
    return "";
  }
}

export function guessMimeFromPath(path) {
  try {
    const lower = String(path || "").toLowerCase();
    const m = lower.match(/\.(mp4|m4v|mov|webm|mkv|avi|wmv|ts|m2ts|mpg|mpeg|3gp|mp3|aac|flac)(?:$|[/?#&])/i);
    if (!m) return null;
    const ext = String(m[1] || "").toLowerCase();
    const map = {
      mp4: "video/mp4",
      m4v: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      wmv: "video/x-ms-wmv",
      ts: "video/mp2t",
      m2ts: "video/mp2t",
      mpg: "video/mpeg",
      mpeg: "video/mpeg",
      "3gp": "video/3gpp",
      mp3: "audio/mpeg",
      aac: "audio/aac",
      flac: "audio/flac"
    };
    return map[ext] || null;
  } catch (_) {
    return null;
  }
}
