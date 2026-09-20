/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods39() {
  const {
    PlayerController,
    Environment,
    STARTUP_AUDIO_PREFERENCE_RETRY_WINDOW_MS,
    SUBTITLE_LANGUAGE_OFF_KEY,
    cleanDisplayText,
    createTrackDialogCache,
    createSubtitleOptionVirtualState
  } = internals;

  return {
    refreshTrackDialogs() {
      this.invalidateTrackDialogCaches();
      this.syncTrackState();
      this.syncSubtitleDialogSession();
      const audioTrackSetSignature = this.getStartupAudioTrackSetSignature();
      if (
        Environment.isWebOS() &&
        this.startupAudioGateActive &&
        this.startupAudioFallbackApplied &&
        this.startupAudioTrackSetSignature &&
        audioTrackSetSignature !== this.startupAudioTrackSetSignature
      ) {
        // webOS may expose the default track before the complete multi-audio
        // list. Re-open matching only while startup still owns playback; after
        // the gate is released, the bounded fallback remains authoritative.
        if (this.pendingWebOsAudioSelection?.automaticFallback) {
          PlayerController.cancelWebOsAudioTrackSelection?.();
          this.pendingWebOsAudioSelection = null;
        }
        this.startupAudioFallbackApplied = false;
        this.startupAudioPreferenceApplied = false;
      }
      this.startupAudioTrackSetSignature = audioTrackSetSignature;
      this.ensureSupportedAudioTrackSelected();
      if (this.startupTrackPreferenceReady) {
        this.applyStartupAudioPreference();
        this.applyStartupSubtitlePreference();
      }
      this.refreshSubtitleCueStyles();
      this.renderControlButtons();
      if (this.subtitleDialogVisible) {
        this.restoreSubtitleDialogFocus();
        this.renderSubtitleDialog();
      }
      if (this.audioDialogVisible) {
        this.renderAudioDialog();
      }
    },
    invalidateTrackDialogCaches() {
      this.trackDialogCache = createTrackDialogCache();
      this.renderedSubtitleDialogMarkup = "";
      this.resetSubtitleOptionVirtualState();
    },
    resetSubtitleOptionVirtualState() {
      if (this.subtitleOptionVirtualMeasureTimer) {
        clearTimeout(this.subtitleOptionVirtualMeasureTimer);
        this.subtitleOptionVirtualMeasureTimer = null;
      }
      this.subtitleOptionVirtualState = createSubtitleOptionVirtualState();
    },
    getSubtitleDialogSourceSignature(subtitles = this.subtitles) {
      return (Array.isArray(subtitles) ? subtitles : [])
        .map((subtitle, index) => {
          const id = subtitle?.id || subtitle?.url || `subtitle-${index}`;
          return [id, subtitle?.url || "", subtitle?.lang || subtitle?.language || subtitle?.languageCode || "", subtitle?.addonName || ""]
            .map((value) => String(value ?? "").trim())
            .join("\u0001");
        })
        .join("\u0002");
    },
    beginSubtitleDialogSession() {
      const subtitles = Array.isArray(this.subtitles) ? this.subtitles.slice() : [];
      this.subtitleDialogSession = {
        subtitles,
        sourceSignature: this.getSubtitleDialogSourceSignature(subtitles)
      };
      this.subtitleOptionFocusMemory = new Map();
      this.resetSubtitleOptionVirtualState();
      this.renderedSubtitleDialogMarkup = "";
    },
    syncSubtitleDialogSession() {
      if (!this.subtitleDialogVisible || !this.subtitleDialogSession) {
        return false;
      }
      const subtitles = Array.isArray(this.subtitles) ? this.subtitles.slice() : [];
      const sourceSignature = this.getSubtitleDialogSourceSignature(subtitles);
      if (sourceSignature === this.subtitleDialogSession.sourceSignature) {
        return false;
      }
      this.subtitleDialogSession = { subtitles, sourceSignature };
      this.resetSubtitleOptionVirtualState();
      return true;
    },
    restoreSubtitleDialogFocus() {
      if (!this.subtitleDialogVisible) {
        return;
      }
      const languages = this.getSubtitleLanguageRailItems();
      const focusedLanguageIndex = languages.findIndex((item) => item.key === this.subtitleFocusedLanguageKey);
      if (focusedLanguageIndex >= 0) {
        this.subtitleLanguageRailIndex = focusedLanguageIndex;
      } else {
        const selectedLanguageKey = this.getSelectedSubtitleLanguageKey();
        const selectedLanguageIndex = languages.findIndex((item) => item.key === selectedLanguageKey);
        this.subtitleLanguageRailIndex = Math.max(0, selectedLanguageIndex);
        this.subtitleFocusedLanguageKey = languages[this.subtitleLanguageRailIndex]?.key || SUBTITLE_LANGUAGE_OFF_KEY;
      }
      this.syncSubtitleOptionIndexForFocusedLanguage();
    },
    getSubtitleDialogSubtitles() {
      if (this.subtitleDialogVisible && this.subtitleDialogSession) {
        return this.subtitleDialogSession.subtitles;
      }
      return Array.isArray(this.subtitles) ? this.subtitles : [];
    },
    getStartupAudioTrackSetSignature() {
      return this.collectAudioOptionItems()
        .map((option) =>
          [
            option.id,
            option.languageKey,
            option.label,
            option.secondary,
            option.supported ? "supported" : "unsupported",
            option.entry?.implicitAudioTrack ? "implicit" : "explicit"
          ]
            .map((value) => cleanDisplayText(value))
            .join("|")
        )
        .join("||");
    },
    hasAudioTracksAvailable({ includeImplicit = true } = {}) {
      let dashCount = 0;
      try {
        dashCount = typeof PlayerController.getDashAudioTracks === "function" ? PlayerController.getDashAudioTracks().length : 0;
      } catch (_) {
        dashCount = 0;
      }

      let avplayCount = 0;
      try {
        avplayCount = typeof PlayerController.getAvPlayAudioTracks === "function" ? PlayerController.getAvPlayAudioTracks().length : 0;
      } catch (_) {
        avplayCount = 0;
      }

      let hlsCount = 0;
      try {
        hlsCount = typeof PlayerController.getHlsAudioTracks === "function" ? PlayerController.getHlsAudioTracks().length : 0;
      } catch (_) {
        hlsCount = 0;
      }

      let nativeCount = 0;
      try {
        nativeCount = this.getAudioTracks().length;
      } catch (_) {
        nativeCount = 0;
      }
      const hasConcreteAudioTracks =
        dashCount > 0 ||
        avplayCount > 0 ||
        hlsCount > 0 ||
        nativeCount > 0 ||
        (this.canDiscoverEmbeddedAudioTracks() && this.embeddedAudioTracks.length > 0) ||
        this.manifestAudioTracks.length > 0;
      if (hasConcreteAudioTracks) {
        return true;
      }

      // The implicit entry describes the stream candidate, not a track that the
      // native player or the embedded-track probe has exposed. It is useful for
      // the audio UI fallback, but it must not complete startup discovery before
      // WebOS has had a chance to return the embedded streams.
      return includeImplicit && Boolean(this.getImplicitAudioEntry());
    },
    hasSubtitleTracksAvailable() {
      let dashCount = 0;
      try {
        dashCount = typeof PlayerController.getDashTextTracks === "function" ? PlayerController.getDashTextTracks().length : 0;
      } catch (_) {
        dashCount = 0;
      }

      let avplayCount = 0;
      try {
        avplayCount =
          typeof PlayerController.getAvPlaySubtitleTracks === "function" ? PlayerController.getAvPlaySubtitleTracks().length : 0;
      } catch (_) {
        avplayCount = 0;
      }

      let hlsCount = 0;
      try {
        hlsCount = typeof PlayerController.getHlsSubtitleTracks === "function" ? PlayerController.getHlsSubtitleTracks().length : 0;
      } catch (_) {
        hlsCount = 0;
      }
      let nativeCount = 0;
      try {
        nativeCount = this.getTextTracks().length;
      } catch (_) {
        nativeCount = 0;
      }
      return (
        dashCount > 0 ||
        avplayCount > 0 ||
        hlsCount > 0 ||
        nativeCount > 0 ||
        this.shouldUseEmbeddedSubtitleTracks() ||
        this.manifestSubtitleTracks.length > 0 ||
        this.subtitles.length > 0
      );
    },
    clearTrackDiscoveryTimer() {
      if (this.trackDiscoveryTimer) {
        clearTimeout(this.trackDiscoveryTimer);
        this.trackDiscoveryTimer = null;
      }
    },
    startTrackDiscoveryWindow({ durationMs = 7000, intervalMs = 350 } = {}) {
      const now = Date.now();
      const requestedDeadline = now + Math.max(500, Number(durationMs || 0));
      const existingDeadline =
        this.trackDiscoveryInProgress && Number(this.trackDiscoveryDeadline || 0) > now ? Number(this.trackDiscoveryDeadline || 0) : 0;
      const token = (this.trackDiscoveryToken || 0) + 1;
      this.trackDiscoveryToken = token;
      this.trackDiscoveryInProgress = true;
      this.trackDiscoveryStartedAt =
        existingDeadline && Number(this.trackDiscoveryStartedAt || 0) > 0 ? Number(this.trackDiscoveryStartedAt) : now;
      this.trackDiscoveryDeadline = Math.max(requestedDeadline, existingDeadline);
      this.clearTrackDiscoveryTimer();

      const tick = () => {
        if (token !== this.trackDiscoveryToken) {
          return;
        }

        const now = Date.now();
        const canDiscoverEmbeddedTracks = this.canDiscoverEmbeddedSubtitleTracks() || this.canDiscoverEmbeddedAudioTracks();
        const shouldRetryEmbeddedTracks =
          canDiscoverEmbeddedTracks &&
          this.embeddedSubtitleTracks.length <= 0 &&
          this.embeddedAudioTracks.length <= 0 &&
          !this.embeddedSubtitleLoading &&
          !this.embeddedAudioLoading;
        const webOsEngineFsEmbeddedTrackDiscoveryPending = this.isWebOsEngineFsEmbeddedTrackDiscoveryPending();
        if (shouldRetryEmbeddedTracks && now - Number(this.lastEmbeddedTrackRetryAt || 0) >= 1200) {
          this.lastEmbeddedTrackRetryAt = now;
          this.loadEmbeddedSubtitleTracks();
        }

        const doneByData =
          (this.hasSubtitleTracksAvailable() || this.hasAudioTracksAvailable({ includeImplicit: false })) &&
          !shouldRetryEmbeddedTracks &&
          !webOsEngineFsEmbeddedTrackDiscoveryPending;
        const doneByIdle =
          !this.subtitleLoading &&
          !this.embeddedSubtitleLoading &&
          !this.embeddedAudioLoading &&
          !this.manifestLoading &&
          !shouldRetryEmbeddedTracks &&
          !webOsEngineFsEmbeddedTrackDiscoveryPending &&
          now - Number(this.trackDiscoveryStartedAt || 0) >= 1200;
        const trackDiscoveryElapsedMs = now - Number(this.trackDiscoveryStartedAt || 0);
        const webOsStartupPreferenceUnresolved = Boolean(
          Environment.isWebOS() && this.startupAudioGateActive && !this.startupAudioPreferenceApplied
        );
        const webOsStartupPreferencePending =
          webOsStartupPreferenceUnresolved && trackDiscoveryElapsedMs < STARTUP_AUDIO_PREFERENCE_RETRY_WINDOW_MS;
        const webOsStartupPreferenceWaitExpired =
          webOsStartupPreferenceUnresolved && trackDiscoveryElapsedMs >= STARTUP_AUDIO_PREFERENCE_RETRY_WINDOW_MS;
        const doneByTimeout = now >= this.trackDiscoveryDeadline || webOsStartupPreferenceWaitExpired;
        this.refreshTrackDialogs();

        // webOS can expose only its default audio track first. Keep discovery
        // alive for the bounded startup preference window so a later complete
        // multi-audio list can be selected before playback is released. This
        // avoids the unsafe mid-playback selectTrack retry blocked by the gate.
        if ((!webOsStartupPreferencePending && (doneByData || doneByIdle)) || doneByTimeout) {
          this.trackDiscoveryInProgress = false;
          this.clearTrackDiscoveryTimer();
          if (webOsStartupPreferenceWaitExpired) {
            this.clearStartupAudioPreferenceRetry();
          }
          this.refreshTrackDialogs();
          return;
        }

        this.trackDiscoveryTimer = setTimeout(tick, Math.max(120, Number(intervalMs || 0)));
      };

      tick();
    },
    ensureTrackDataWarmup(force = false) {
      const now = Date.now();
      if (!force && now - Number(this.lastTrackWarmupAt || 0) < 1200) {
        return;
      }
      if (!force && (this.subtitleLoading || this.embeddedSubtitleLoading || this.manifestLoading)) {
        this.startTrackDiscoveryWindow();
        return;
      }
      this.lastTrackWarmupAt = now;
      this.loadSubtitles();
      this.loadEmbeddedSubtitleTracks();
      this.loadManifestTrackDataForCurrentStream(this.activePlaybackUrl || this.getCurrentStreamCandidate()?.url || null);
      this.startTrackDiscoveryWindow();
    }
  };
}
