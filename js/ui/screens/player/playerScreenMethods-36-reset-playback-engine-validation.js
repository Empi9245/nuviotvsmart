/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods36() {
  const {
    PlayerController,
    requestWebOsCompanionService,
    STARTUP_PLAYBACK_ADVANCE_EPSILON_SECONDS,
    PLAYBACK_ENGINE_VALIDATION_WINDOW_MS,
    PLAYBACK_ENGINE_VALIDATION_MAX_PROGRESS_GAP_SECONDS,
    POST_VALIDATION_SAME_ENGINE_RECOVERY_MAX_ATTEMPTS,
    logEngineFsDebug
  } = internals;

  return {
    resetPlaybackEngineValidation() {
      this.playbackEngineValidationEngine = "";
      this.playbackEngineValidationStartedAt = 0;
      this.playbackEngineValidationStartSeconds = null;
      this.playbackEngineValidationLastSeconds = null;
      this.playbackEngineValidationProgressSeconds = 0;
      this.playbackEngineValidated = false;
      this.postValidationRecoveryValidationActive = false;
      this.postValidationSameEngineRecoveryAttempts = 0;
    },
    resetPostValidationRecoveryValidationWindow() {
      if (!this.postValidationRecoveryValidationActive) {
        return;
      }
      this.playbackEngineValidationStartedAt = 0;
      this.playbackEngineValidationStartSeconds = null;
      this.playbackEngineValidationLastSeconds = null;
      this.playbackEngineValidationProgressSeconds = 0;
    },
    armPostValidationRecoveryValidation() {
      if (!this.playbackEngineValidated) {
        return;
      }
      this.postValidationRecoveryValidationActive = true;
      this.resetPostValidationRecoveryValidationWindow();
    },
    beginPlaybackEngineValidation() {
      if (!this.hasPresentedPlaybackFrame || (this.playbackEngineValidated && !this.postValidationRecoveryValidationActive)) {
        return;
      }
      const currentEngine = String(PlayerController.playbackEngine || "").trim();
      if (!currentEngine || !this.activePlaybackUrl) {
        return;
      }
      const currentSeconds = Number(this.getPlaybackCurrentSeconds());
      if (!Number.isFinite(currentSeconds) || currentSeconds < 0) {
        return;
      }
      if (this.playbackEngineValidationEngine !== currentEngine) {
        this.playbackEngineValidationEngine = currentEngine;
        this.playbackEngineValidationStartedAt = Date.now();
        this.playbackEngineValidationStartSeconds = currentSeconds;
        this.playbackEngineValidationLastSeconds = currentSeconds;
        this.playbackEngineValidationProgressSeconds = 0;
        this.postValidationSameEngineRecoveryAttempts = 0;
      } else if (!Number(this.playbackEngineValidationStartedAt || 0)) {
        this.playbackEngineValidationStartedAt = Date.now();
        this.playbackEngineValidationStartSeconds = currentSeconds;
        this.playbackEngineValidationLastSeconds = currentSeconds;
        this.playbackEngineValidationProgressSeconds = 0;
      }
    },
    recordPlaybackEngineValidationProgress(currentSeconds = this.getPlaybackCurrentSeconds()) {
      if (!this.hasPresentedPlaybackFrame || (this.playbackEngineValidated && !this.postValidationRecoveryValidationActive)) {
        return;
      }
      const current = Number(currentSeconds);
      if (!Number.isFinite(current) || current < 0) {
        return;
      }
      this.beginPlaybackEngineValidation();
      if (!this.playbackEngineValidationEngine) {
        return;
      }
      const last = Number(this.playbackEngineValidationLastSeconds);
      if (!Number.isFinite(last)) {
        this.playbackEngineValidationLastSeconds = current;
        return;
      }
      const delta = current - last;
      if (delta < -STARTUP_PLAYBACK_ADVANCE_EPSILON_SECONDS || delta > PLAYBACK_ENGINE_VALIDATION_MAX_PROGRESS_GAP_SECONDS) {
        this.playbackEngineValidationStartedAt = Date.now();
        this.playbackEngineValidationStartSeconds = current;
        this.playbackEngineValidationProgressSeconds = 0;
      } else if (delta > STARTUP_PLAYBACK_ADVANCE_EPSILON_SECONDS) {
        this.playbackEngineValidationProgressSeconds += delta;
      }
      this.playbackEngineValidationLastSeconds = current;
    },
    updatePlaybackEngineValidation() {
      this.beginPlaybackEngineValidation();
      const engineAlreadyValidated = Boolean(this.playbackEngineValidated);
      if (this.playbackEngineValidated && !this.postValidationRecoveryValidationActive) {
        return true;
      }
      const currentEngine = String(PlayerController.playbackEngine || "").trim();
      const validationEngine = String(this.playbackEngineValidationEngine || "").trim();
      const startedAt = Number(this.playbackEngineValidationStartedAt || 0);
      if (!currentEngine || currentEngine !== validationEngine || !startedAt) {
        return engineAlreadyValidated;
      }
      if (Date.now() - startedAt < PLAYBACK_ENGINE_VALIDATION_WINDOW_MS) {
        return engineAlreadyValidated;
      }
      if (Number(this.playbackEngineValidationProgressSeconds || 0) < PLAYBACK_ENGINE_VALIDATION_WINDOW_MS / 1000) {
        return engineAlreadyValidated;
      }
      if (Number(this.lastPlaybackProgressAt || 0) < startedAt) {
        return engineAlreadyValidated;
      }
      if (this.playbackEngineValidated) {
        this.postValidationRecoveryValidationActive = false;
        this.postValidationSameEngineRecoveryAttempts = 0;
      } else {
        this.playbackEngineValidated = true;
      }
      return true;
    },
    isPlaybackEngineValidated() {
      return this.updatePlaybackEngineValidation();
    },
    recoverValidatedPlaybackOnStall() {
      if (!this.isPlaybackEngineValidated()) {
        return false;
      }
      const stalledPlaybackUrl = String(this.activePlaybackUrl || "").trim();
      const currentEngine = String(PlayerController.playbackEngine || "").trim();
      if (
        !stalledPlaybackUrl ||
        !currentEngine ||
        currentEngine === "none" ||
        Number(this.postValidationSameEngineRecoveryAttempts || 0) >= POST_VALIDATION_SAME_ENGINE_RECOVERY_MAX_ATTEMPTS
      ) {
        return false;
      }

      const sourceCandidate = this.getStreamCandidateByUrl(stalledPlaybackUrl) || this.getCurrentStreamCandidate();
      this.postValidationSameEngineRecoveryAttempts = Number(this.postValidationSameEngineRecoveryAttempts || 0) + 1;
      console.warn("Playback stalled after engine validation; retrying the same engine", {
        url: stalledPlaybackUrl,
        engine: currentEngine,
        attempt: this.postValidationSameEngineRecoveryAttempts,
        limit: POST_VALIDATION_SAME_ENGINE_RECOVERY_MAX_ATTEMPTS
      });
      this.armPostValidationRecoveryValidation();
      void this.playStreamByUrl(stalledPlaybackUrl, {
        preservePanel: true,
        preservePlaybackState: true,
        resetSilentAudioState: false,
        preservePlaybackRecoveryState: true,
        forceEngine: currentEngine,
        sourceCandidate
      });
      return true;
    },
    markPlaybackProgress() {
      const currentSeconds = this.getPlaybackCurrentSeconds();
      const bufferingBaselineSeconds = Number(this.bufferingSpinnerBaselineSeconds);
      const bufferingRecovered =
        this.bufferingActive &&
        Number.isFinite(currentSeconds) &&
        Number.isFinite(bufferingBaselineSeconds) &&
        currentSeconds > bufferingBaselineSeconds + STARTUP_PLAYBACK_ADVANCE_EPSILON_SECONDS;
      if (bufferingRecovered) {
        this.bufferingActive = false;
        this.clearBufferingSpinnerTimer();
      }
      if (typeof PlayerController.recordProgressSnapshot === "function") {
        PlayerController.recordProgressSnapshot(
          Math.floor(currentSeconds * 1000),
          Math.floor(this.getPlaybackDurationSeconds() * 1000),
          typeof PlayerController.createProgressContext === "function" ? PlayerController.createProgressContext() : null
        );
      }
      if (this.seekLoading) {
        const seekBaselineSeconds = Number(this.seekLoadingBaselineSeconds);
        const seekTargetSeconds = Number(this.seekLoadingTargetSeconds);
        const reachedSeekTarget =
          Number.isFinite(currentSeconds) && Number.isFinite(seekTargetSeconds) && Math.abs(currentSeconds - seekTargetSeconds) <= 0.75;
        if (
          (reachedSeekTarget && this.isPlaybackFrameReady()) ||
          (Number.isFinite(currentSeconds) &&
            Number.isFinite(seekBaselineSeconds) &&
            currentSeconds > seekBaselineSeconds + STARTUP_PLAYBACK_ADVANCE_EPSILON_SECONDS)
        ) {
          this.clearSeekLoading({ hideBuffering: reachedSeekTarget });
        }
      }
      this.bufferingSpinnerBaselineSeconds = currentSeconds;
      this.lastPlaybackProgressAt = Date.now();
      this.beginPlaybackEngineValidation();
      this.recordPlaybackEngineValidationProgress(currentSeconds);
      this.updatePlaybackEngineValidation();
      this.engineFsStallExtensions = 0;
      this.lastEngineFsStallStats = null;
      if (bufferingRecovered) {
        this.updateLoadingVisibility();
      }
      this.scheduleBufferingSpinnerRefresh();
    },
    getCurrentEngineFsStatsUrl() {
      const state = this.currentEngineFsStream || null;
      const playbackUrl = String(state?.playbackUrl || this.activePlaybackUrl || "").trim();
      const infoHash = String(state?.infoHash || "")
        .trim()
        .toLowerCase();
      const fileIdx = Number(state?.fileIdx);
      if (!playbackUrl || !/^[0-9a-f]{40}$/.test(infoHash) || !Number.isFinite(fileIdx) || fileIdx < 0) {
        return "";
      }
      try {
        const parsed = new URL(playbackUrl);
        return `${parsed.origin}/${encodeURIComponent(infoHash)}/${String(fileIdx)}/stats.json`;
      } catch (_) {
        return "";
      }
    },
    async fetchCurrentEngineFsStats({ timeoutMs = 3500 } = {}) {
      const statsUrl = this.getCurrentEngineFsStatsUrl();
      if (!statsUrl) {
        return null;
      }
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs || 3500))) : 0;
      try {
        const response = await fetch(statsUrl, {
          cache: "no-cache",
          signal: controller?.signal
        });
        if (!response || !response.ok) {
          return null;
        }
        return await response.json().catch(() => null);
      } catch (error) {
        if (this.currentEngineFsStream) {
          logEngineFsDebug("EngineFS stats unavailable; requesting runtime recovery", {
            statsUrl,
            error: String(error?.message || error || "")
          });
          try {
            await requestWebOsCompanionService({ method: "status", parameters: {} });
          } catch (_) {
            // Recovery is best-effort; retry logic will decide the next step.
          }
        }
        return null;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
    getEngineFsStallSnapshot(stats = null) {
      if (!stats || typeof stats !== "object") {
        return null;
      }
      const readNumber = (keys = [], fallback = 0) => {
        for (const key of keys) {
          const parsed = Number(stats[key]);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
        return fallback;
      };
      const readOptionalNumber = (keys = []) => {
        for (const key of keys) {
          if (stats[key] == null) {
            continue;
          }
          const parsed = Number(stats[key]);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
        return null;
      };
      const progress = readNumber(["streamProgress", "progress"], -1);
      const downloaded = readNumber(["downloaded", "downloadedBytes"], -1);
      const downloadSpeed = readNumber(["downloadSpeed", "speed"], 0);
      const uploadSpeed = readNumber(["uploadSpeed"], 0);
      const peers = readNumber(["peerCount", "peers"], 0);
      const unique = readNumber(["uniquePeerCount", "unique"], 0);
      const connectionTries = readNumber(["connectionTries", "tries"], 0);
      const seeds = readOptionalNumber(["seedCount", "seeds", "seeders"]);
      return {
        progress,
        downloaded,
        downloadSpeed,
        uploadSpeed,
        peers,
        unique,
        connectionTries,
        seeds,
        peerSearchRunning: Boolean(stats.peerSearchRunning ?? stats.peerSearch),
        streamName: String(stats.streamName || "")
      };
    }
  };
}
