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
      this.lastPlaybackErrorAt = 0;
      if (!automaticSourceFallback && !sourceRecovery) {
        this.failedPlaybackUrls?.clear();
        this.failedPlaybackStreamIds?.clear();
        this.sourceFallbackStatus = "";
        this.sourceFallbackExhausted = false;
        this.syncLoadingOverlayStatus();
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
        candidate?.raw?.clientResolve?.infoHash ||
        candidate?.engineFs ||
        candidate?.raw?.engineFs;
      this.sourceFallbackProgressSeconds = Number(this.getPlaybackCurrentSeconds());
      this.sourceFallbackDeadlineTimer = setTimeout(
        () => {
          if (
            !this.isActiveMountToken(mountToken) ||
            !this.isCurrentSourcePlaybackAttempt(token) ||
            this.isStartupErrorVisible()
          )
            return;
          this.sourceFallbackDeadlineTimer = null;
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
      const currentSeconds = Number(this.getPlaybackCurrentSeconds());
      const recordedSeconds =
        Number(PlayerController.getRecordedProgressSnapshot?.()?.positionMs || 0) / 1000;
      const seconds = currentSeconds > 1 ? currentSeconds : recordedSeconds;
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
    noteSourcePlaybackProgress(currentSeconds) {
      const previous = this.sourceFallbackProgressSeconds;
      this.sourceFallbackProgressSeconds = Number(currentSeconds);
      if (
        this.sourcePlaybackStarting ||
        this.sourceFallbackPending ||
        !this.hasPresentedPlaybackFrame ||
        this.pendingPlaybackRestore
      )
        return;
      if (Number.isFinite(previous) && currentSeconds > previous + 0.25) {
        this.clearSourceFallbackDeadline();
        this.sourceFallbackStatus = "";
        this.syncLoadingOverlayStatus();
      }
    },
    tryNextStreamCandidate({
      streamCandidate = null,
      playbackUrl = "",
      sourceAttemptToken = null
    } = {}) {
      if (this.isExternalFrameMode()) return false;
      if (!this.isCurrentSourcePlaybackAttempt(sourceAttemptToken)) return true;
      if (this.sourceFallbackPending) return true;
      const candidate = streamCandidate || this.getCurrentStreamCandidate();
      const current = this.getCurrentStreamCandidate();
      if (candidate?.id && current?.id && candidate.id !== current.id) return true;
      const failedUrl = playbackUrl || candidate?.url || "";
      this.markPlaybackSourceFailed(failedUrl, candidate);
      if (candidate?.url && candidate.url !== failedUrl)
        this.failedPlaybackUrls.add(String(candidate.url).trim());
      const candidates = this.streamCandidates;
      let nextIndex = -1;
      for (let offset = 1; offset < candidates.length; offset++) {
        const index = (this.currentStreamIndex + offset) % candidates.length;
        const entry = candidates[index];
        if (!entry || (entry.id && this.failedPlaybackStreamIds?.has(String(entry.id).trim())))
          continue;
        const url = String(entry.url || entry.externalUrl || "").trim();
        if (url && this.failedPlaybackUrls?.has(url)) continue;
        nextIndex = index;
        break;
      }
      const searchMissingCandidates =
        nextIndex < 0 &&
        candidates.length <= 1 &&
        !this.sourceFallbackLoadAttempted &&
        Boolean(this.params?.videoId || this.params?.itemId) &&
        !candidate?.ytId;
      this.clearSourceFallbackDeadline();
      if (nextIndex < 0 && !searchMissingCandidates) {
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
      if (searchMissingCandidates) this.sourceFallbackLoadAttempted = true;
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
        if (searchMissingCandidates) {
          let timer;
          let timedOut = false;
          try {
            await Promise.race([
              this.reloadSources(),
              new Promise((_, reject) => {
                timer = setTimeout(() => {
                  timedOut = true;
                  reject(new Error("Source search timed out"));
                }, 20000);
              })
            ]);
          } catch (_) {
            // The final error below covers an unavailable addon as well.
          } finally {
            clearTimeout(timer);
            if (timedOut) this.cancelSourceLoad();
          }
          if (!this.isActiveMountToken(mountToken) || !this.isCurrentSourcePlaybackAttempt(token))
            return;
          this.sourceFallbackPending = false;
          if (
            !this.tryNextStreamCandidate({
              streamCandidate: candidate,
              playbackUrl: failedUrl,
              sourceAttemptToken: token
            })
          ) {
            this.showStartupError(
              t("player_error_no_working_sources", {}, "None of the sources could be played."),
              {
                streamCandidate: candidate,
                sourceAttemptToken: token,
                details: [],
                reason: "source-search-exhausted"
              }
            );
          }
          return;
        }
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
