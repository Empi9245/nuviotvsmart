/* eslint-disable no-unused-vars */
import * as internals from "./playerController.js";

export function createPlayerControllerMethods07() {
  const { Platform, parseAspectRatio, isAbsoluteLocalAvPlaySubtitlePath } = internals;

  return {
    setAvPlayExternalSubtitle(subtitleUrl) {
      if (!this.isUsingAvPlay()) {
        return false;
      }

      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.setExternalSubtitlePath !== "function") {
        return false;
      }

      this.avplaySubtitleSelectionToken = Number(this.avplaySubtitleSelectionToken || 0) + 1;

      const path = String(subtitleUrl || "").trim();
      // Samsung AVPlay does not download external subtitles. Passing an HTTP(S)
      // URL is accepted synchronously on some TVs but later aborts through the
      // player onerror callback with PLAYER_ERROR_CONNECTION_FAILED.
      if (Platform.isTizen() && !isAbsoluteLocalAvPlaySubtitlePath(path)) {
        return false;
      }
      try {
        avplay.setExternalSubtitlePath(path);
        try {
          avplay.setSilentSubtitle?.(!path);
          this.avplaySubtitlesSilent = !path;
        } catch (_) {
          this.avplaySubtitlesSilent = !path;
          // Ignore subtitle mute/unmute failures.
        }
        this.pendingAvPlaySubtitleTrackIndex = -1;
        this.pendingAvPlaySubtitleReactivation = false;
        this.desiredAvPlaySubtitleTrackIndex = -1;
        this.desiredAvPlaySubtitleTrackUntil = 0;
        this.avplayNativeSubtitleRendering = false;
        this.selectedAvPlaySubtitleTrackIndex = -1;
        this.selectedWebOsEmbeddedSubtitleTrackIndex = -1;
        this.avplayExternalSubtitlePath = path;
        this.appliedAvPlayExternalSubtitleDelayKey = "";
        this.applyAvPlayExternalSubtitleDelay();
        this.emitVideoEvent("avplaytrackschanged", { playbackEngine: this.playbackEngine });
        return true;
      } catch (_) {
        return false;
      }
    },
    hasActiveAvPlaySubtitleOutput() {
      if (!this.isUsingAvPlay() || this.avplaySubtitlesSilent) {
        return false;
      }
      if (String(this.avplayExternalSubtitlePath || "").trim()) {
        return true;
      }
      const selectedIndex = Number(this.selectedAvPlaySubtitleTrackIndex);
      const pendingIndex = Number(this.pendingAvPlaySubtitleTrackIndex);
      const desiredIndex = Number(this.desiredAvPlaySubtitleTrackIndex);
      return (
        (Number.isFinite(selectedIndex) && selectedIndex >= 0) ||
        (Number.isFinite(pendingIndex) && pendingIndex >= 0) ||
        (Number.isFinite(desiredIndex) && desiredIndex >= 0 && Date.now() < Number(this.desiredAvPlaySubtitleTrackUntil || 0))
      );
    },
    shouldRenderAvPlaySubtitleCallbacksInHtml() {
      return (
        !this.avplayNativeSubtitleRendering && !String(this.avplayExternalSubtitlePath || "").trim() && this.hasActiveAvPlaySubtitleOutput()
      );
    },
    getAvPlaySubtitleOutputMode() {
      if (!this.isUsingAvPlay() || this.avplaySubtitlesSilent) {
        return "none";
      }
      if (String(this.avplayExternalSubtitlePath || "").trim()) {
        return "external-native";
      }
      if (this.avplayNativeSubtitleRendering && this.hasActiveAvPlaySubtitleOutput()) {
        return "embedded-native";
      }
      if (this.hasActiveAvPlaySubtitleOutput()) {
        return "html-callback";
      }
      return "none";
    },
    supportsAvPlayExternalSubtitleDelay() {
      return typeof this.getAvPlay()?.setSubtitlePosition === "function";
    },
    setAvPlayExternalSubtitleDelay(delayMs = 0) {
      const normalizedDelayMs = Number(delayMs);
      this.avplayExternalSubtitleDelayMs = Number.isFinite(normalizedDelayMs) ? Math.round(normalizedDelayMs) : 0;
      this.appliedAvPlayExternalSubtitleDelayKey = "";
      return this.applyAvPlayExternalSubtitleDelay();
    },
    applyAvPlayExternalSubtitleDelay() {
      if (this.avplaySeekInFlight) {
        return false;
      }
      const path = String(this.avplayExternalSubtitlePath || "").trim();
      if (!this.isUsingAvPlay() || !path) {
        return false;
      }
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.setSubtitlePosition !== "function") {
        return false;
      }
      const delayMs = Math.round(Number(this.avplayExternalSubtitleDelayMs || 0));
      const applyKey = `${path}:${delayMs}`;
      if (this.appliedAvPlayExternalSubtitleDelayKey === applyKey) {
        return true;
      }
      const state = this.getAvPlayState();
      if (state !== "PLAYING" && state !== "PAUSED") {
        return false;
      }
      try {
        avplay.setSubtitlePosition(delayMs);
        this.appliedAvPlayExternalSubtitleDelayKey = applyKey;
        return true;
      } catch (_) {
        return false;
      }
    },
    getAvPlayVideoDimensions() {
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.getCurrentStreamInfo !== "function") {
        return null;
      }
      let streams = [];
      try {
        const value = avplay.getCurrentStreamInfo();
        streams = Array.isArray(value) ? value : [];
      } catch (_) {
        streams = [];
      }
      const videoTrack = streams.find((track) => this.normalizeAvPlayTrackType(track?.type) === "VIDEO") || null;
      if (!videoTrack) {
        return null;
      }
      const extraInfo = this.parseAvPlayExtraInfo(videoTrack.extra_info || videoTrack.extraInfo || null) || {};
      const widthCandidates = [
        videoTrack.width,
        videoTrack.Width,
        videoTrack.videoWidth,
        extraInfo.width,
        extraInfo.Width,
        extraInfo.videoWidth,
        extraInfo.video_width
      ];
      const heightCandidates = [
        videoTrack.height,
        videoTrack.Height,
        videoTrack.videoHeight,
        extraInfo.height,
        extraInfo.Height,
        extraInfo.videoHeight,
        extraInfo.video_height
      ];
      const displayAspectCandidates = [
        videoTrack.display_aspect_ratio,
        videoTrack.displayAspectRatio,
        videoTrack.video_aspect_ratio,
        videoTrack.videoAspectRatio,
        videoTrack.dar,
        videoTrack.aspect,
        extraInfo.display_aspect_ratio,
        extraInfo.displayAspectRatio,
        extraInfo.video_aspect_ratio,
        extraInfo.videoAspectRatio,
        extraInfo.dar,
        extraInfo.aspect
      ];
      const pixelAspectCandidates = [
        videoTrack.pixel_aspect_ratio,
        videoTrack.pixelAspectRatio,
        videoTrack.par,
        extraInfo.pixel_aspect_ratio,
        extraInfo.pixelAspectRatio,
        extraInfo.par
      ];
      let width = widthCandidates.map(Number).find((value) => Number.isFinite(value) && value > 0) || 0;
      let height = heightCandidates.map(Number).find((value) => Number.isFinite(value) && value > 0) || 0;
      if (!width || !height) {
        const resolutionText = String(videoTrack.resolution || videoTrack.Resolution || extraInfo.resolution || extraInfo.Resolution || "");
        const match = resolutionText.match(/(\d{2,5})\s*[xX]\s*(\d{2,5})/);
        if (match) {
          width = Number(match[1]);
          height = Number(match[2]);
        }
      }
      if (!width || !height) {
        return null;
      }
      const displayAspect = displayAspectCandidates.map(parseAspectRatio).find(Boolean) || null;
      const pixelAspect = pixelAspectCandidates.map(parseAspectRatio).find(Boolean) || 1;
      return {
        width,
        height,
        aspect: displayAspect || (width / height) * pixelAspect
      };
    },
    mapAvPlayErrorToMediaCode(errorValue) {
      const errorText = String(errorValue || "").toLowerCase();
      if (!errorText) {
        return 4;
      }
      if (errorText.includes("network") || errorText.includes("connection") || errorText.includes("timeout")) {
        return 2;
      }
      if (errorText.includes("decode")) {
        return 3;
      }
      return 4;
    },
    getPlayerViewportSize() {
      const playerRect =
        this.video?.parentElement?.getBoundingClientRect?.() || document.getElementById("player")?.getBoundingClientRect?.() || null;
      const playerWidth = Number(playerRect?.width || 0);
      const playerHeight = Number(playerRect?.height || 0);
      if (Number.isFinite(playerWidth) && playerWidth > 0 && Number.isFinite(playerHeight) && playerHeight > 0) {
        return {
          width: Math.max(1, Math.round(playerWidth)),
          height: Math.max(1, Math.round(playerHeight))
        };
      }
      const windowWidth = Number(window.innerWidth || 0);
      const windowHeight = Number(window.innerHeight || 0);
      const documentWidth = Number(document.documentElement?.clientWidth || 0);
      const documentHeight = Number(document.documentElement?.clientHeight || 0);
      const visualViewportWidth = Number(globalThis.visualViewport?.width || 0);
      const visualViewportHeight = Number(globalThis.visualViewport?.height || 0);
      const screenWidth = Number(globalThis.screen?.width || 0);
      const screenHeight = Number(globalThis.screen?.height || 0);
      const width = [windowWidth, documentWidth, visualViewportWidth, screenWidth].find((value) => Number.isFinite(value) && value > 0);
      const height = [windowHeight, documentHeight, visualViewportHeight, screenHeight].find(
        (value) => Number.isFinite(value) && value > 0
      );
      return {
        width: Math.max(1, Math.round(width || 1920)),
        height: Math.max(1, Math.round(height || 1080))
      };
    },
    getCssPlayerViewportSize() {
      const playerSize = this.getPlayerViewportSize();
      const documentWidth = Number(document.documentElement?.clientWidth || 0);
      const documentHeight = Number(document.documentElement?.clientHeight || 0);
      const windowWidth = Number(window.innerWidth || 0);
      const windowHeight = Number(window.innerHeight || 0);
      const widthCandidates = [playerSize.width, documentWidth, windowWidth].filter((value) => Number.isFinite(value) && value > 0);
      const heightCandidates = [playerSize.height, documentHeight, windowHeight].filter((value) => Number.isFinite(value) && value > 0);
      return {
        width: Math.max(1, Math.round(widthCandidates[0] || 1920)),
        height: Math.max(1, Math.round(heightCandidates[0] || 1080))
      };
    },
    getAvPlayViewportSize() {
      if (Platform.isTizen()) {
        return {
          width: 1920,
          height: 1080
        };
      }
      const documentWidth = Number(document.documentElement?.clientWidth || 0);
      const documentHeight = Number(document.documentElement?.clientHeight || 0);
      const screenWidth = Number(globalThis.screen?.width || 0);
      const screenHeight = Number(globalThis.screen?.height || 0);
      const windowWidth = Number(window.innerWidth || 0);
      const windowHeight = Number(window.innerHeight || 0);
      const webOsMajorVersion = Platform.isWebOS() ? Number(Platform.getWebOsMajorVersion() || 0) : 0;
      if (webOsMajorVersion > 0 && webOsMajorVersion <= 6) {
        return this.getPlayerViewportSize();
      }
      return {
        width: Math.max(1, Math.round(Math.max(windowWidth, documentWidth, screenWidth, 1920))),
        height: Math.max(1, Math.round(Math.max(windowHeight, documentHeight, screenHeight, 1080)))
      };
    }
  };
}
