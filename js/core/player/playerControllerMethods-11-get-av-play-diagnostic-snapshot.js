/* eslint-disable no-unused-vars */
import * as internals from "./playerController.js";

export function createPlayerControllerMethods11() {
  const { Platform, HLS_BUFFER_STALL_WARNING_DELAY_MS, TRANSIENT_HLS_BUFFER_ERROR_DETAILS } = internals;

  return {
    getAvPlayDiagnosticSnapshot() {
      if (!this.isUsingAvPlay()) {
        return null;
      }
      const state = this.getAvPlayState();
      const currentTimeMs = Number(this.avplayCurrentTimeMs || 0);
      const durationMs = Number(this.avplayDurationMs || 0);
      const bufferingStartedAt = Number(this.avplayBufferingStartedAt || 0);
      const bufferingProgress = this.avplayBufferingProgress;
      return {
        state: state || null,
        currentTimeMs: Number.isFinite(currentTimeMs) ? currentTimeMs : null,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        buffering: Boolean(this.avplayBufferingStartedAt),
        bufferingProgress:
          bufferingProgress !== null && bufferingProgress !== undefined && Number.isFinite(Number(bufferingProgress))
            ? Math.max(0, Math.min(100, Number(bufferingProgress)))
            : null,
        bufferingDurationMs: bufferingStartedAt
          ? Math.max(0, Date.now() - bufferingStartedAt)
          : Number(this.avplayLastBufferingDurationMs || 0) || null,
        currentBandwidth: this.getAvPlayStreamingProperty("CURRENT_BANDWIDTH") || null,
        availableBitrate: this.getAvPlayStreamingProperty("AVAILABLE_BITRATE") || null,
        selectedAudioTrackIndex:
          Number.isFinite(Number(this.selectedAvPlayAudioTrackIndex)) && Number(this.selectedAvPlayAudioTrackIndex) >= 0
            ? Number(this.selectedAvPlayAudioTrackIndex)
            : null,
        audioTracks: this.getAvPlayTrackDiagnosticSummary(),
        currentStreams: this.getAvPlayCurrentStreamDiagnosticSummary()
      };
    },
    clearHlsBufferStallWarning() {
      if (this.hlsBufferStallWarningTimer) {
        clearTimeout(this.hlsBufferStallWarningTimer);
        this.hlsBufferStallWarningTimer = null;
      }
    },
    scheduleHlsBufferStallWarning(diagnostic) {
      const video = this.video;
      const hls = this.hlsInstance;
      if (!video || !hls || video.paused || video.ended) {
        return;
      }
      if (this.hlsBufferStallWarningTimer) {
        return;
      }

      const initialTime = Number(video.currentTime);
      const startedAt = Date.now();
      this.hlsBufferStallWarningTimer = setTimeout(() => {
        this.hlsBufferStallWarningTimer = null;
        const currentTime = Number(this.video?.currentTime);
        const hasAdvanced = Number.isFinite(currentTime) && Number.isFinite(initialTime) && currentTime > initialTime + 0.25;
        const samePlayback = this.hlsInstance === hls && this.video === video;
        const stillStalled = samePlayback && !video.paused && !video.ended && !hasAdvanced;
        const stallDurationMs = Math.max(0, Date.now() - startedAt);
        if (!stillStalled) {
          return;
        }
        console.warn("[Nuvio playback] hls.js error", {
          ...diagnostic,
          stallDurationMs,
          readyState: Number(video.readyState || 0),
          networkState: Number(video.networkState || 0),
          currentTime: Number.isFinite(currentTime) ? Number(currentTime.toFixed(3)) : null
        });
      }, HLS_BUFFER_STALL_WARNING_DELAY_MS);
    },
    captureHlsErrorDiagnostic(data = {}) {
      const video = this.video || null;
      const hls = this.hlsInstance || null;
      const buffered = [];
      try {
        for (let index = 0; index < Number(video?.buffered?.length || 0); index += 1) {
          buffered.push(`${Number(video.buffered.start(index)).toFixed(3)}-${Number(video.buffered.end(index)).toFixed(3)}`);
        }
      } catch (_) {
        // Buffered ranges are best-effort diagnostics only.
      }

      const fragment = data?.frag || null;
      const responseCode = Number(data?.response?.code || data?.networkDetails?.status || 0);
      const mediaErrorCode = Number(video?.error?.code || 0);
      const hlsCurrentLevel = Number(hls?.currentLevel);
      const hlsNextAutoLevel = Number(hls?.nextAutoLevel);
      const hlsBandwidthEstimate = Number(hls?.bandwidthEstimate);
      const hlsLatency = Number(hls?.latency);
      const hlsLiveSyncPosition = Number(hls?.liveSyncPosition);
      const diagnostic = {
        fatal: Boolean(data?.fatal),
        type: this.sanitizePlaybackDiagnosticText(data?.type),
        details: this.sanitizePlaybackDiagnosticText(data?.details),
        reason: this.sanitizePlaybackDiagnosticText(data?.reason),
        error: this.sanitizePlaybackDiagnosticText(data?.error?.message || data?.error?.name),
        sourceBuffer: this.sanitizePlaybackDiagnosticText(data?.sourceBufferName || data?.parent || fragment?.type),
        responseCode: responseCode || null,
        level: Number.isFinite(Number(data?.level ?? fragment?.level)) ? Number(data?.level ?? fragment?.level) : null,
        currentLevel: Number.isFinite(hlsCurrentLevel) ? hlsCurrentLevel : null,
        nextAutoLevel: Number.isFinite(hlsNextAutoLevel) ? hlsNextAutoLevel : null,
        bandwidthEstimate: Number.isFinite(hlsBandwidthEstimate) ? hlsBandwidthEstimate : null,
        latency: Number.isFinite(hlsLatency) ? Number(hlsLatency.toFixed(3)) : null,
        liveSyncPosition: Number.isFinite(hlsLiveSyncPosition) ? Number(hlsLiveSyncPosition.toFixed(3)) : null,
        fragmentSn: fragment?.sn == null ? null : this.sanitizePlaybackDiagnosticText(fragment.sn, 80),
        fragmentCc: Number.isFinite(Number(fragment?.cc)) ? Number(fragment.cc) : null,
        readyState: Number(video?.readyState || 0),
        networkState: Number(video?.networkState || 0),
        currentTime: Number.isFinite(Number(video?.currentTime)) ? Number(Number(video.currentTime).toFixed(3)) : null,
        buffered: buffered.join(", ") || "none",
        mediaErrorCode: mediaErrorCode || null,
        mediaError: this.sanitizePlaybackDiagnosticText(video?.error?.message)
      };
      this.lastHlsErrorDiagnostic = diagnostic;
      const transientBufferError =
        !diagnostic.fatal && diagnostic.type === "mediaError" && TRANSIENT_HLS_BUFFER_ERROR_DETAILS.has(diagnostic.details);
      if (transientBufferError) {
        if (diagnostic.details === "bufferStalledError") {
          this.scheduleHlsBufferStallWarning(diagnostic);
        }
        return diagnostic;
      }
      this.clearHlsBufferStallWarning();
      console.warn("[Nuvio playback] hls.js error", diagnostic);
      return diagnostic;
    },
    getLastHlsErrorDetail() {
      const diagnostic = this.lastHlsErrorDiagnostic;
      if (!diagnostic) {
        return "";
      }
      const fields = [
        diagnostic.type,
        diagnostic.details,
        diagnostic.reason,
        diagnostic.error,
        diagnostic.sourceBuffer ? `buffer=${diagnostic.sourceBuffer}` : "",
        diagnostic.responseCode ? `HTTP ${diagnostic.responseCode}` : "",
        diagnostic.level == null ? "" : `level=${diagnostic.level}`,
        diagnostic.currentLevel == null ? "" : `currentLevel=${diagnostic.currentLevel}`,
        diagnostic.nextAutoLevel == null ? "" : `nextAutoLevel=${diagnostic.nextAutoLevel}`,
        diagnostic.bandwidthEstimate == null ? "" : `bandwidth=${diagnostic.bandwidthEstimate}`,
        diagnostic.latency == null ? "" : `latency=${diagnostic.latency}`,
        diagnostic.fragmentSn == null ? "" : `sn=${diagnostic.fragmentSn}`,
        diagnostic.fragmentCc == null ? "" : `cc=${diagnostic.fragmentCc}`,
        `fatal=${diagnostic.fatal}`,
        `readyState=${diagnostic.readyState}`,
        `networkState=${diagnostic.networkState}`,
        diagnostic.currentTime == null ? "" : `time=${diagnostic.currentTime}`,
        `buffered=${diagnostic.buffered}`,
        diagnostic.mediaErrorCode ? `mediaCode=${diagnostic.mediaErrorCode}` : "",
        diagnostic.mediaError
      ].filter(Boolean);
      return fields.join("; ");
    },
    getLastHlsErrorDiagnostic() {
      return this.lastHlsErrorDiagnostic ? { ...this.lastHlsErrorDiagnostic } : null;
    },
    forceAvPlayFallbackForCurrentSource(reason = "fallback") {
      const url = String(this.currentPlaybackUrl || this.video?.currentSrc || this.video?.src || "").trim();
      if (!url || this.avplayFallbackAttempts.has(url) || !this.canUseAvPlay()) {
        return false;
      }

      this.avplayFallbackAttempts.add(url);
      console.warn("Forcing AVPlay fallback:", { reason, url });
      this.play(url, {
        itemId: this.currentItemId,
        itemType: this.currentItemType || "movie",
        imdbId: this.currentImdbId,
        tmdbId: this.currentTmdbId,
        traktId: this.currentTraktId,
        videoId: this.currentVideoId,
        season: this.currentSeason,
        episode: this.currentEpisode,
        requestHeaders: { ...(this.currentPlaybackHeaders || {}) },
        mediaSourceType: this.currentPlaybackMediaSourceType || null,
        forceEngine: this.getPlatformAvplayEngineName()
      });
      return true;
    },
    getAttemptedPlaybackEngines(url = this.currentPlaybackUrl) {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) {
        return new Set();
      }
      return new Set(this.playbackEngineAttempts.get(normalizedUrl) || []);
    },
    rememberPlaybackEngineAttempt(url, engineName, { reset = false } = {}) {
      const normalizedUrl = String(url || "").trim();
      const normalizedEngine = String(engineName || "").trim();
      if (!normalizedUrl || !normalizedEngine) {
        return;
      }
      const nextSet = reset ? new Set() : new Set(this.playbackEngineAttempts.get(normalizedUrl) || []);
      nextSet.add(normalizedEngine);
      this.playbackEngineAttempts.set(normalizedUrl, nextSet);
    },
    clearPlaybackEngineAttempts(url = null) {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) {
        this.playbackEngineAttempts.clear();
        return;
      }
      this.playbackEngineAttempts.delete(normalizedUrl);
    },
    isLivePlaybackItemType(itemType = this.currentItemType) {
      const normalized = String(itemType || "")
        .trim()
        .toLowerCase();
      const hasEpisodeIdentity =
        this.currentSeason != null &&
        this.currentEpisode != null &&
        Number.isFinite(Number(this.currentSeason)) &&
        Number.isFinite(Number(this.currentEpisode));
      return (
        normalized === "channel" ||
        normalized === "live" ||
        normalized === "tvchannel" ||
        normalized === "stream" ||
        (normalized === "tv" && !hasEpisodeIdentity)
      );
    },
    isTizenHlsSource(url, sourceType = null) {
      const normalizedSourceType = String(sourceType || this.guessMediaMimeType(url) || "").trim();
      return Platform.isTizen() && this.isLikelyHlsMimeType(normalizedSourceType);
    }
  };
}
