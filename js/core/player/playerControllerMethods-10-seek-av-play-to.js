/* eslint-disable no-unused-vars */
import * as internals from "./playerController.js";

export function createPlayerControllerMethods10() {
  const { AVPLAY_SEEK_TIMEOUT_MS, logTizenAvPlayDebug } = internals;

  return {
    seekAvPlayTo(targetMs, { emitEvents = true } = {}) {
      if (!this.isUsingAvPlay() || this.avplaySeekInFlight) {
        return false;
      }

      const avplay = this.getAvPlay();
      if (!avplay) {
        return false;
      }

      const normalizedTargetMs = Math.max(0, Math.floor(Number(targetMs) || 0));
      const seekToken = Number(this.avplaySeekRequestToken || 0) + 1;
      const shouldRestartTick = Boolean(this.avplayTickTimer || this.isPlaying);
      let settled = false;
      this.avplaySeekRequestToken = seekToken;
      this.avplaySeekInFlight = true;
      this.stopAvPlayTickTimer();

      if (emitEvents) {
        this.avplayReady = false;
        this.emitVideoEvent("waiting", { playbackEngine: this.playbackEngine });
        this.emitVideoEvent("seeking", { playbackEngine: this.playbackEngine });
      }
      this.avplayCurrentTimeMs = normalizedTargetMs;
      if (emitEvents) {
        this.emitVideoEvent("timeupdate", { playbackEngine: this.playbackEngine });
      }

      const settle = (success, errorValue = null) => {
        if (settled) {
          return;
        }
        settled = true;
        if (seekToken !== Number(this.avplaySeekRequestToken || 0) || !this.isUsingAvPlay()) {
          return;
        }
        this.clearAvPlaySeekTimeout();

        this.avplaySeekInFlight = false;
        this.refreshAvPlayTimeline();
        this.avplayReady = true;
        this.reapplyAvPlayPlaybackRate();
        this.retryPendingAvPlayStartupAudioTrackSelection();
        this.applyPendingAvPlayAudioTrackSelection();
        this.applyPendingAvPlaySubtitleTrackSelection();
        this.applyAvPlayExternalSubtitleDelay();
        if (shouldRestartTick) {
          this.startAvPlayTickTimer();
        }
        if (!success) {
          logTizenAvPlayDebug("Tizen AVPlay seek failed", {
            targetMs: normalizedTargetMs,
            error: errorValue?.message || String(errorValue || "")
          });
        }
        if (emitEvents) {
          if (success) {
            this.emitVideoEvent("seeked", { playbackEngine: this.playbackEngine });
          }
          this.emitVideoEvent("canplay", { playbackEngine: this.playbackEngine });
        }
      };

      this.avplaySeekTimeoutTimer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        if (seekToken !== Number(this.avplaySeekRequestToken || 0) || !this.isUsingAvPlay()) {
          return;
        }
        this.clearAvPlaySeekTimeout();

        const failedPlaybackEngine = this.playbackEngine;
        const timeoutError = "PLAYER_ERROR_SEEK_FAILED (timeout)";
        logTizenAvPlayDebug("Tizen AVPlay seek timed out; tearing down player", {
          targetMs: normalizedTargetMs,
          timeoutMs: AVPLAY_SEEK_TIMEOUT_MS
        });
        this.cancelProgressSyncAfterSeek();
        this.teardownAvPlay();
        this.playbackEngine = "none";
        this.isPlaying = false;
        this.syncWebOsPlaybackKeepAwake();
        this.lastPlaybackErrorCode = this.mapAvPlayErrorToMediaCode("timeout");
        this.emitVideoEvent("error", {
          playbackEngine: failedPlaybackEngine,
          mediaErrorCode: this.lastPlaybackErrorCode,
          avplayError: timeoutError,
          seekTimeout: true
        });
      }, AVPLAY_SEEK_TIMEOUT_MS);

      try {
        if (typeof avplay.seekTo === "function") {
          // Samsung documents seekTo as asynchronous: no other AVPlay API may
          // be called until one of these callbacks has completed the seek.
          avplay.seekTo(
            normalizedTargetMs,
            () => settle(true),
            (errorValue) => settle(false, errorValue)
          );
        } else {
          const currentMs = Number(avplay.getCurrentTime?.() || 0);
          if (normalizedTargetMs > currentMs && typeof avplay.jumpForward === "function") {
            avplay.jumpForward(normalizedTargetMs - currentMs);
            settle(true);
          } else if (normalizedTargetMs < currentMs && typeof avplay.jumpBackward === "function") {
            avplay.jumpBackward(currentMs - normalizedTargetMs);
            settle(true);
          } else if (normalizedTargetMs === currentMs) {
            settle(true);
          } else {
            settle(false, "seek_not_supported");
            return false;
          }
        }
        return true;
      } catch (error) {
        settle(false, error);
        return false;
      }
    },
    seekToSeconds(targetSeconds) {
      const seconds = Number(targetSeconds || 0);
      if (!Number.isFinite(seconds) || seconds < 0) {
        return false;
      }

      if (!this.isUsingAvPlay()) {
        if (!this.video) {
          return false;
        }
        this.video.currentTime = seconds;
        this.scheduleProgressSyncAfterSeek();
        return true;
      }

      const didSeek = this.seekAvPlayTo(Math.max(0, Math.floor(seconds * 1000)));
      if (didSeek) {
        this.scheduleProgressSyncAfterSeek();
      }
      return didSeek;
    },
    isPlaybackEnded() {
      if (this.isLivePlaybackItemType()) {
        return false;
      }
      if (this.isUsingAvPlay()) {
        return Boolean(this.avplayEnded);
      }
      return Boolean(this.video?.ended);
    },
    getPlaybackReadyState() {
      if (this.isUsingAvPlay()) {
        return this.avplayReady ? 4 : 1;
      }
      return Number(this.video?.readyState || 0);
    },
    getLastPlaybackErrorCode() {
      return Number(this.lastPlaybackErrorCode || 0);
    },
    sanitizePlaybackDiagnosticText(value, maxLength = 240) {
      const text = String(value ?? "")
        .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
        .replace(/((?:clear_?key|clearkey|api_password|authorization|cookie|token)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/((?:clear_?key|clearkey|api_password|authorization|cookie|token)\s*:\s*)(?:"[^"]*"|'[^']*'|[^,;\s}]+)/gi, "$1[redacted]")
        .trim();
      if (!text) {
        return "";
      }
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    },
    normalizeAvPlayErrorDiagnostic(errorType = "", errorMessage = "") {
      const detail = {};
      const normalizedErrorType = this.sanitizePlaybackDiagnosticText(errorType, 120);
      if (normalizedErrorType) {
        detail.errorType = normalizedErrorType;
      }

      const parsed = this.parseAvPlayExtraInfo(errorMessage);
      const allowedFields = {
        error_code: "errorCode",
        codec: "codec",
        audio_codec: "audioCodec",
        video_codec: "videoCodec",
        demux: "demux",
        resolution: "resolution",
        fps: "fps",
        bitrate: "bitrate",
        width: "width",
        height: "height",
        channels: "channels",
        sample_rate: "sampleRate",
        downloadspeed: "downloadSpeed",
        download_speed: "downloadSpeed",
        detail_info: "detailInfo"
      };

      if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([key, value]) => {
          const outputKey =
            allowedFields[
              String(key || "")
                .trim()
                .toLowerCase()
            ];
          if (!outputKey || value === null || typeof value === "object") {
            return;
          }
          const safeValue = this.sanitizePlaybackDiagnosticText(value, 180);
          if (safeValue) {
            detail[outputKey] = safeValue;
          }
        });
      } else {
        // AVPlay documents errorMsg as JSON. Older firmware may return plain
        // text, but do not retain it when it resembles a header or request
        // diagnostic; redaction alone cannot make arbitrary header content
        // safe to display.
        const plainMessage = String(errorMessage || "");
        const containsSensitiveDiagnostic =
          /["']?\s*(?:authorization|cookie|user-agent|request[_ ]header|response[_ ]header|http_request_header|http_response_header)\s*["']?\s*[:=]/i.test(
            plainMessage
          );
        if (!containsSensitiveDiagnostic) {
          const safeMessage = this.sanitizePlaybackDiagnosticText(plainMessage, 240);
          if (safeMessage) {
            detail.message = safeMessage;
          }
        }
      }

      return Object.keys(detail).length ? detail : null;
    },
    getLastAvPlayErrorDiagnostic() {
      return this.avplayLastErrorDiagnostic ? { ...this.avplayLastErrorDiagnostic } : null;
    },
    getAvPlayStreamingProperty(propertyType) {
      if (!this.isUsingAvPlay() || this.avplaySeekInFlight) {
        return "";
      }
      const state = this.getAvPlayState();
      if (!["READY", "PLAYING", "PAUSED"].includes(state)) {
        return "";
      }
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.getStreamingProperty !== "function") {
        return "";
      }
      try {
        return this.sanitizePlaybackDiagnosticText(avplay.getStreamingProperty(propertyType), 180);
      } catch (_) {
        return "";
      }
    },
    getAvPlayTrackDiagnosticSummary() {
      return this.avplayAudioTracks.map((track) => ({
        index: Number(track?.avplayTrackIndex),
        language: this.sanitizePlaybackDiagnosticText(track?.language, 40) || null,
        codec: this.sanitizePlaybackDiagnosticText(track?.codec, 80) || null,
        channels: this.sanitizePlaybackDiagnosticText(track?.channels, 40) || null,
        sampleRate: Number(track?.sampleRate) || null
      }));
    },
    getAvPlayCurrentStreamDiagnosticSummary() {
      if (!this.isUsingAvPlay() || this.avplaySeekInFlight) {
        return [];
      }
      const state = this.getAvPlayState();
      if (!["READY", "PLAYING", "PAUSED"].includes(state)) {
        return [];
      }
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.getCurrentStreamInfo !== "function") {
        return [];
      }

      let streams = [];
      try {
        const value = avplay.getCurrentStreamInfo();
        streams = Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }

      return streams
        .map((track) => {
          const type = this.normalizeAvPlayTrackType(track?.type);
          if (!["AUDIO", "VIDEO"].includes(type)) {
            return null;
          }
          const extraInfo = this.parseAvPlayExtraInfo(track?.extra_info || track?.extraInfo || null) || {};
          const pick = (keys) => this.sanitizePlaybackDiagnosticText(this.pickAvPlayExtraValue(extraInfo, keys), 120) || null;
          const pickNumber = (keys) => {
            const rawValue = this.pickAvPlayExtraValue(extraInfo, keys);
            if (rawValue === null || rawValue === undefined || !String(rawValue).trim()) {
              return null;
            }
            const value = Number(rawValue);
            return Number.isFinite(value) && value >= 0 ? value : null;
          };
          const trackIndex = Number(track?.index);
          return {
            type,
            index: Number.isFinite(trackIndex) && trackIndex >= 0 ? trackIndex : null,
            codec: pick(["codec", "codec_name", "codec_id", "codec_tag_string", "fourCC", "fourcc", "audioCodec", "videoCodec"]),
            profile: pick(["profile", "codecProfile", "codec_profile"]),
            resolution: pick(["resolution", "video_resolution"]),
            width: pickNumber(["width", "video_width"]),
            height: pickNumber(["height", "video_height"]),
            bitrate: pick(["bitrate", "bit_rate", "video_bitrate", "audio_bitrate"]),
            fps: pick(["fps", "frame_rate", "framerate"]),
            channels: type === "AUDIO" ? pick(["channels", "channel", "channel_layout"]) : null,
            sampleRate: type === "AUDIO" ? pickNumber(["sampleRate", "audioSampleRate", "sample_rate"]) : null,
            hdr: type === "VIDEO" ? pick(["hdr", "hdr_format", "transfer", "color_transfer"]) : null
          };
        })
        .filter(Boolean);
    }
  };
}
