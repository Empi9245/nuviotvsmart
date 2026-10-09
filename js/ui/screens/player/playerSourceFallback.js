import { PlayerController, t } from "./playerScreenContext.js";

export function createPlayerSourceFallbackMethods() {
  return {
    clearSourceFallbackDeadline() {
      if (this.sourceFallbackDeadlineTimer) clearTimeout(this.sourceFallbackDeadlineTimer);
      this.sourceFallbackDeadlineTimer = null;
    },
    isCurrentSourcePlaybackAttempt(token) {
      return (
        this.isActiveMountToken() && (token == null || token === this.sourcePlaybackAttemptToken)
      );
    },
    beginSourcePlaybackAttempt(
      candidate,
      { automaticSourceFallback = false, sourceRecovery = false } = {}
    ) {
      if (!sourceRecovery) {
        this.sourcePlaybackAttemptToken = Number(this.sourcePlaybackAttemptToken || 0) + 1;
        this.clearSourceFallbackDeadline();
      }
      this.sourceFallbackPending = false;
      this.sourcePlaybackStarting = true;
      if (!automaticSourceFallback && !sourceRecovery) {
        this.failedPlaybackUrls?.clear();
        this.failedPlaybackStreamIds?.clear();
        this.sourceFallbackStatus = "";
        this.sourceFallbackExhausted = false;
      }
      const index = this.streamCandidates.findIndex(
        (entry) => entry === candidate || (candidate?.id && entry.id === candidate.id)
      );
      if (index >= 0) this.currentStreamIndex = index;
      this.armSourceFallbackDeadline(candidate);
      return this.sourcePlaybackAttemptToken;
    },
    armSourceFallbackDeadline(candidate = this.getCurrentStreamCandidate()) {
      if (this.sourceFallbackDeadlineTimer || this.isExternalFrameMode()) return;
      const token = this.sourcePlaybackAttemptToken;
      const mountToken = this.playerMountToken;
      // A hard ceiling survives retries on the same source, including a native
      // player that reports ready without ever advancing and stalled resolvers.
      const torrent =
        candidate?.infoHash ||
        candidate?.raw?.infoHash ||
        candidate?.engineFs ||
        candidate?.raw?.engineFs;
      this.sourceFallbackDeadlineTimer = setTimeout(
        () => {
          this.sourceFallbackDeadlineTimer = null;
          if (
            !this.isActiveMountToken(mountToken) ||
            !this.isCurrentSourcePlaybackAttempt(token) ||
            this.isStartupErrorVisible()
          )
            return;
          this.showStartupError(
            t("player_error_stream_timeout", {}, "This source did not start or resume playback."),
            {
              streamCandidate: candidate,
              sourceAttemptToken: token,
              reason: "source-timeout"
            }
          );
        },
        torrent ? 180000 : 90000
      );
    },
    captureSourcePlaybackRestore() {
      const seconds = Number(this.getPlaybackCurrentSeconds());
      // An errored media element often reports paused=true. Preserve the user's
      // pause state, rather than turning an automatic recovery into a pause.
      if (this.hasPresentedPlaybackFrame && Number.isFinite(seconds) && seconds > 1) {
        this.pendingPlaybackRestore = {
          timeSeconds: seconds,
          paused: Boolean(this.paused),
          attempts: 0,
          lastAttemptAt: 0
        };
      } else if (this.pendingPlaybackRestore) {
        this.pendingPlaybackRestore = {
          ...this.pendingPlaybackRestore,
          attempts: 0,
          lastAttemptAt: 0
        };
      }
    },
    tryNextStreamCandidate({
      streamCandidate = null,
      playbackUrl = "",
      sourceAttemptToken = null
    } = {}) {
      if (!this.isCurrentSourcePlaybackAttempt(sourceAttemptToken) || this.isExternalFrameMode())
        return true;
      if (this.sourceFallbackPending) return true;
      const candidate = streamCandidate || this.getCurrentStreamCandidate();
      const current = this.getCurrentStreamCandidate();
      if (candidate?.id && current?.id && candidate.id !== current.id) return true;
      const failedUrl = playbackUrl || candidate?.url || this.activePlaybackUrl;
      this.markPlaybackSourceFailed(failedUrl, candidate);
      const nextIndex = this.streamCandidates.findIndex((entry, index) => {
        if (index <= this.currentStreamIndex || !entry) return false;
        if (entry.id && this.failedPlaybackStreamIds?.has(String(entry.id).trim())) return false;
        const url = String(entry.url || entry.externalUrl || "").trim();
        return !url || !this.failedPlaybackUrls?.has(url);
      });
      this.clearSourceFallbackDeadline();
      if (nextIndex < 0) {
        this.sourcePlaybackStarting = false;
        this.sourceFallbackStatus = "";
        this.sourceFallbackExhausted = this.streamCandidates.length > 1;
        return false;
      }
      this.captureSourcePlaybackRestore();
      this.sourceFallbackPending = true;
      this.sourcePlaybackStarting = true;
      const token = this.sourcePlaybackAttemptToken;
      const mountToken = this.playerMountToken;
      const next = this.streamCandidates[nextIndex];
      this.clearPlaybackStallGuard();
      if (this.engineFsStartupRetryTimer) clearTimeout(this.engineFsStartupRetryTimer);
      this.engineFsStartupRetryTimer = null;
      if (this.tizenAvPlayConnectionRetryTimer) clearTimeout(this.tizenAvPlayConnectionRetryTimer);
      this.tizenAvPlayConnectionRetryTimer = null;
      this.releaseStartupAudioGate({ resume: false });
      this.clearStartupError();
      this.sourcesError = "";
      this.dismissPauseOverlay();
      this.bufferingActive = false;
      this.seekLoading = false;
      this.loadingVisible = true;
      this.sourceFallbackStatus = t("player_switching_source", {}, "Trying the next source…");
      this.updateLoadingVisibility();
      this.syncLoadingOverlayStatus();
      // Stop synchronously after saving the position, so errors from the old
      // session cannot race the resolver for the next source.
      void PlayerController.stop({ forceCloudSync: false });
      void Promise.resolve().then(async () => {
        if (
          !this.isActiveMountToken(mountToken) ||
          !this.isCurrentSourcePlaybackAttempt(token) ||
          !this.sourceFallbackPending
        )
          return;
        this.currentStreamIndex = nextIndex;
        try {
          await this.playStreamCandidate(next, {
            automaticSourceFallback: true,
            preservePendingRestore: true,
            mountToken
          });
        } catch (error) {
          if (
            !this.isActiveMountToken(mountToken) ||
            this.getCurrentStreamCandidate()?.id !== next.id
          )
            return;
          this.showStartupError(t("player_error_playback_fallback", {}, "Playback error"), {
            streamCandidate: next,
            detail: String(error?.message || error || ""),
            reason: "source-fallback-start"
          });
        }
      });
      return true;
    }
  };
}
