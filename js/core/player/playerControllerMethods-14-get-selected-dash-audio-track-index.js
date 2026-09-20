/* eslint-disable no-unused-vars */
import * as internals from "./playerController.js";

export function createPlayerControllerMethods14() {
  const { Platform, hlsJsEngine, logTizenAvPlayDebug, isValidAvPlayPlaybackSpeedState } = internals;

  return {
    getSelectedDashAudioTrackIndex() {
      const current = this.dashInstance?.getCurrentTrackFor?.("audio");
      const tracks = this.getDashAudioTracks();
      if (!current || !tracks.length) {
        return -1;
      }
      const exactMatch = tracks.findIndex((track) => track.raw === current);
      if (exactMatch >= 0) {
        return exactMatch;
      }
      const currentId = String(current?.id ?? "");
      const currentLang = String(current?.lang ?? "");
      return tracks.findIndex((track) => String(track?.id ?? "") === currentId && String(track?.language ?? "") === currentLang);
    },
    setDashAudioTrack(index) {
      const targetIndex = Number(index);
      const tracks = this.getDashAudioTracks();
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= tracks.length) {
        return false;
      }
      const target = tracks[targetIndex]?.raw || null;
      if (!target || typeof this.dashInstance?.setCurrentTrack !== "function") {
        return false;
      }
      try {
        this.dashInstance.setCurrentTrack(target);
        const currentTime = Number(this.video?.currentTime || 0);
        if (Number.isFinite(currentTime) && currentTime > 0) {
          this.video.currentTime = Math.max(0, currentTime - 0.001);
        }
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      } catch (_) {
        return false;
      }
    },
    getDashTextTracks() {
      const tracks = this.dashInstance?.getTracksFor?.("text");
      if (!Array.isArray(tracks)) {
        return [];
      }
      return tracks.filter(Boolean).map((track, index) => ({
        id: String(track?.id ?? `dash-text-${index}`),
        index,
        textTrackIndex: Number(track?.index),
        label: String(track?.labels?.[0]?.text || track?.lang || `Subtitle ${index + 1}`),
        language: String(track?.lang || ""),
        raw: track
      }));
    },
    getSelectedDashTextTrackIndex() {
      const current = this.dashInstance?.getCurrentTrackFor?.("text");
      const tracks = this.getDashTextTracks();
      if (!current || !tracks.length) {
        return -1;
      }
      const exactMatch = tracks.findIndex((track) => track.raw === current);
      if (exactMatch >= 0) {
        return exactMatch;
      }
      const currentId = String(current?.id ?? "");
      const currentLang = String(current?.lang ?? "");
      return tracks.findIndex((track) => String(track?.id ?? "") === currentId && String(track?.language ?? "") === currentLang);
    },
    setDashTextTrack(index) {
      const targetIndex = Number(index);
      const player = this.dashInstance;
      if (!player) {
        return false;
      }

      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        try {
          player.setTextTrack?.(-1);
        } catch (_) {
          // Ignore disable-text failures.
        }
        try {
          player.enableText?.(false);
        } catch (_) {
          // Ignore text disable fallback failures.
        }
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      }

      const tracks = this.getDashTextTracks();
      if (targetIndex >= tracks.length) {
        return false;
      }

      const target = tracks[targetIndex] || null;
      try {
        player.enableText?.(true);
      } catch (_) {
        // Ignore text enable failures.
      }
      try {
        if (Number.isFinite(target?.textTrackIndex) && typeof player.setTextTrack === "function") {
          player.setTextTrack(target.textTrackIndex);
        } else if (target?.raw && typeof player.setCurrentTrack === "function") {
          player.setCurrentTrack(target.raw);
        } else {
          return false;
        }
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      } catch (_) {
        return false;
      }
    },
    getHlsAudioTracks() {
      return hlsJsEngine.getAudioTracks(this.hlsInstance);
    },
    getSelectedHlsAudioTrackIndex() {
      return hlsJsEngine.getSelectedAudioTrackIndex(this.hlsInstance);
    },
    setHlsAudioTrack(index) {
      const applied = hlsJsEngine.setAudioTrack(this.hlsInstance, index);
      if (applied) {
        this.emitVideoEvent("hlstrackschanged", { playbackEngine: "hls.js" });
      }
      return applied;
    },
    getHlsSubtitleTracks() {
      return hlsJsEngine.getSubtitleTracks(this.hlsInstance);
    },
    getSelectedHlsSubtitleTrackIndex() {
      return hlsJsEngine.getSelectedSubtitleTrackIndex(this.hlsInstance);
    },
    setHlsSubtitleTrack(index) {
      const applied = hlsJsEngine.setSubtitleTrack(this.hlsInstance, index);
      if (applied) {
        this.emitVideoEvent("hlstrackschanged", { playbackEngine: "hls.js" });
      }
      return applied;
    },
    normalizePlaybackRate(speed = 1) {
      const targetSpeed = Number(speed || 1);
      if (!Number.isFinite(targetSpeed) || targetSpeed <= 0) {
        return NaN;
      }
      return targetSpeed;
    },
    getSupportedPlaybackRates() {
      if (Platform.isTizen() && this.isUsingAvPlay()) {
        // AVPlay setSpeed() is trick play, not Android-style playback-speed
        // processing. It cannot guarantee that audio is tempo-adjusted with
        // video, so only expose the rate that preserves A/V synchronization.
        return [1];
      }
      if (Platform.isWebOS() && !this.isUsingNativePlayback()) {
        // MSE-backed hls.js/dash.js playback never exposes a mediaId, so the
        // native Luna setPlayRate command cannot target that pipeline.
        return [1];
      }
      return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    },
    isSupportedAvPlayPlaybackRate(speed = 1) {
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!Number.isFinite(targetSpeed)) {
        return false;
      }
      return targetSpeed === 1;
    },
    applyAvPlayPlaybackRate(speed = this.desiredPlaybackRate) {
      if (!this.isUsingAvPlay()) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!this.isSupportedAvPlayPlaybackRate(targetSpeed)) {
        return false;
      }
      if (targetSpeed === 1) {
        // Normal speed is AVPlay's native state. Tizen exposes no alternative
        // rate in this app, so avoid repeatedly re-entering Samsung trick-play
        // after play, buffering completion, resume, and seek.
        this.appliedAvPlayPlaybackRate = 1;
        return true;
      }
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.setSpeed !== "function") {
        return false;
      }
      const state = this.getAvPlayState();
      if (!isValidAvPlayPlaybackSpeedState(state)) {
        return false;
      }
      try {
        avplay.setSpeed(targetSpeed);
        this.appliedAvPlayPlaybackRate = targetSpeed;
        logTizenAvPlayDebug("Tizen AVPlay setSpeed succeeded", {
          speed: targetSpeed,
          state
        });
        return true;
      } catch (error) {
        logTizenAvPlayDebug("Tizen AVPlay setSpeed failed", {
          speed: targetSpeed,
          state,
          error: error?.message || String(error || "")
        });
        return false;
      }
    },
    reapplyAvPlayPlaybackRate() {
      if (!this.isUsingAvPlay() || this.avplaySeekInFlight) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(this.desiredPlaybackRate);
      if (!Number.isFinite(targetSpeed)) {
        return false;
      }
      return this.applyAvPlayPlaybackRate(targetSpeed);
    },
    isSupportedWebOsPlaybackRate(speed = 1) {
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!Number.isFinite(targetSpeed) || targetSpeed > 2) {
        return false;
      }
      if (targetSpeed === 1) {
        return true;
      }
      return Platform.isWebOS() && this.isUsingNativePlayback();
    },
    async applyWebOsPlaybackRate(speed = this.desiredPlaybackRate) {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback()) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!this.isSupportedWebOsPlaybackRate(targetSpeed)) {
        return false;
      }

      // A native webOS pipeline publishes its private mediaId asynchronously.
      // MSE pipelines never publish one, which is why they are rejected above.
      const mediaId = this.syncNativeMediaId() || (await this.waitForNativeMediaId({ maxAttempts: 20, intervalMs: 250 }));
      if (!mediaId) {
        return false;
      }
      // Treat nativeMediaIdLookupToken as the native-pipeline generation. Once
      // mediaId exists, waitForNativeMediaId() does not increment it, so a later
      // token change means the source was reset while this Luna command was in
      // flight.
      const nativeMediaStateToken = Number(this.nativeMediaIdLookupToken || 0);

      try {
        // Do not locally time out this command. Luna requests cannot be cancelled
        // through the shared wrapper, so declaring failure while one is still in
        // flight can let a late success change the native rate after the UI has
        // reverted to its previous value.
        const result = await this.requestWebOsMediaCommand("setPlayRate", {
          mediaId,
          playRate: targetSpeed,
          audioOutput: true
        });
        if (result?.returnValue !== true) {
          return false;
        }
        if (nativeMediaStateToken !== Number(this.nativeMediaIdLookupToken || 0)) {
          return false;
        }
        this.appliedWebOsPlaybackRate = targetSpeed;
        return true;
      } catch (_) {
        return false;
      }
    },
    queueWebOsPlaybackRate(speed = this.desiredPlaybackRate) {
      const previousCommand = this.webOsPlaybackRateCommandPromise;
      const commandPromise = previousCommand
        ? Promise.resolve(previousCommand)
            .catch(() => false)
            .then(() => this.applyWebOsPlaybackRate(speed))
        : this.applyWebOsPlaybackRate(speed);
      const trackedPromise = commandPromise.finally(() => {
        if (this.webOsPlaybackRateCommandPromise === trackedPromise) {
          this.webOsPlaybackRateCommandPromise = null;
        }
      });
      this.webOsPlaybackRateCommandPromise = trackedPromise;
      return trackedPromise;
    },
    reapplyWebOsPlaybackRate() {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback() || this.desiredPlaybackRate === 1) {
        return Promise.resolve(false);
      }
      if (this.webOsPlaybackRateReapplyPromise) {
        return this.webOsPlaybackRateReapplyPromise;
      }
      const reapplyPromise = this.queueWebOsPlaybackRate(this.desiredPlaybackRate).finally(() => {
        if (this.webOsPlaybackRateReapplyPromise === reapplyPromise) {
          this.webOsPlaybackRateReapplyPromise = null;
        }
      });
      this.webOsPlaybackRateReapplyPromise = reapplyPromise;
      return reapplyPromise;
    },
    getPlaybackRate() {
      const targetSpeed = this.normalizePlaybackRate(this.desiredPlaybackRate);
      if (Number.isFinite(targetSpeed)) {
        return targetSpeed;
      }
      return Number(this.video?.playbackRate || 1);
    }
  };
}
