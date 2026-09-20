/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods57() {
  const {
    Environment,
    SUBTITLE_DELAY_MAX_MS,
    SUBTITLE_DELAY_MIN_MS,
    SUBTITLE_DELAY_STEP_MS,
    isSelectKeyCode,
    t,
    clamp,
    escapeHtml,
    formatSubtitleDelay
  } = internals;

  return {
    renderSubtitleDelayOverlay() {
      const overlay = this.uiRefs?.subtitleDelayOverlay;
      if (!overlay) {
        return;
      }
      const visible = Boolean(this.subtitleDelayOverlayVisible);
      overlay.classList.toggle("hidden", !visible);
      overlay.setAttribute("aria-hidden", visible ? "false" : "true");
      if (!visible) {
        overlay.innerHTML = "";
        return;
      }

      const delayMs = clamp(Number(this.subtitleDelayMs || 0), SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS);
      const fraction = (delayMs - SUBTITLE_DELAY_MIN_MS) / (SUBTITLE_DELAY_MAX_MS - SUBTITLE_DELAY_MIN_MS);
      overlay.innerHTML = `
          <div class="player-subtitle-delay-panel">
            <div class="player-subtitle-delay-header">
              <div class="player-subtitle-delay-title">${escapeHtml(t("player_subtitle_delay", {}, "Subtitles Delay"))}</div>
              <div class="player-subtitle-delay-value" dir="ltr">${escapeHtml(formatSubtitleDelay(delayMs))}</div>
            </div>
            <div class="player-subtitle-delay-slider focusable" data-subtitle-delay-focus="slider" tabindex="-1" role="slider" aria-valuemin="${SUBTITLE_DELAY_MIN_MS}" aria-valuemax="${SUBTITLE_DELAY_MAX_MS}" aria-valuenow="${delayMs}">
              <div class="player-subtitle-delay-slider-track"></div>
              <div class="player-subtitle-delay-slider-ticks" aria-hidden="true">
                <span></span><span></span><span class="center"></span><span></span><span></span>
              </div>
              <div class="player-subtitle-delay-slider-thumb" style="left:${(fraction * 100).toFixed(3)}%"></div>
            </div>
            <div class="player-subtitle-delay-actions">
              <button class="player-subtitle-delay-action focusable" type="button" data-subtitle-delay-focus="reset" tabindex="-1">${escapeHtml(t("subtitle_delay_reset", {}, "Reset Delay"))}</button>
              <button class="player-subtitle-delay-action focusable" type="button" data-subtitle-delay-focus="sync" tabindex="-1">${escapeHtml(t("player_sync_line", {}, "Sync Line"))}</button>
            </div>
          </div>
        `;
      this.syncSubtitleDelayOverlayFocusDom({ focus: false });
    },
    syncSubtitleDelayOverlayFocusDom({ focus = false } = {}) {
      const overlay = this.uiRefs?.subtitleDelayOverlay;
      if (!overlay || !this.subtitleDelayOverlayVisible) {
        return false;
      }
      const target = overlay.querySelector(`[data-subtitle-delay-focus="${String(this.subtitleDelayFocusTarget || "slider")}"]`);
      if (!target) {
        return false;
      }
      overlay.querySelectorAll(".focused").forEach((node) => node.classList.remove("focused"));
      target.classList.add("focused");
      if (focus && document.activeElement !== target) {
        target.focus?.();
      }
      return true;
    },
    setSubtitleDelayValue(delayMs, { showOverlay = false } = {}) {
      this.subtitleDelayMs = clamp(Math.trunc(Number(delayMs) || 0), SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS);
      if (this.isAssAddonSubtitleActive()) {
        this.assSubtitleRenderer?.setDelay(this.subtitleDelayMs);
      }
      this.persistSubtitleDelayPreference();
      this.applySubtitlePresentationSettings({ refreshTrackRendering: true });
      if (showOverlay) {
        this.renderSubtitleDelayOverlay();
        this.scheduleHideSubtitleDelayOverlay();
      }
      this.renderSubtitleDialog();
    },
    showSubtitleDelayOverlay() {
      this.flushPersistPlayerPresentationSettings();
      this.clearSubtitleDelayOverlayTimer();
      this.subtitleDelayOverlayVisible = true;
      this.subtitleDelayFocusTarget = "slider";
      this.subtitleDelayOverlayStatus = "";
      this.subtitleTimingDialogVisible = false;
      this.subtitleDialogVisible = false;
      this.audioDialogVisible = false;
      this.speedDialogVisible = false;
      this.sourcesPanelVisible = false;
      this.setControlsVisible(false, { focus: false });
      this.renderSubtitleDialog();
      this.renderSubtitleTimingDialog();
      this.renderSubtitleDelayOverlay();
      this.updateModalBackdrop();
      setTimeout(() => this.syncSubtitleDelayOverlayFocusDom({ focus: true }), 80);
      this.scheduleHideSubtitleDelayOverlay();
    },
    hideSubtitleDelayOverlay({ scheduleControls = true } = {}) {
      this.clearSubtitleDelayOverlayTimer();
      if (!this.subtitleDelayOverlayVisible) {
        return false;
      }
      this.subtitleDelayOverlayVisible = false;
      this.subtitleDelayOverlayStatus = "";
      this.renderSubtitleDelayOverlay();
      this.updateModalBackdrop();
      if (scheduleControls) {
        this.resetControlsAutoHide();
      }
      return true;
    },
    handleSubtitleDelayOverlayKey(event) {
      const keyCode = Number(event?.keyCode || 0);
      const target = String(this.subtitleDelayFocusTarget || "slider");
      const isRtl = String(document?.documentElement?.dir || document?.dir || "").toLowerCase() === "rtl";
      if (target === "slider") {
        if (keyCode === 37 || keyCode === 39) {
          const direction = keyCode === 39 ? 1 : -1;
          this.setSubtitleDelayValue(Number(this.subtitleDelayMs || 0) + direction * SUBTITLE_DELAY_STEP_MS, { showOverlay: true });
          return true;
        }
        if (keyCode === 40) {
          this.subtitleDelayFocusTarget = "sync";
          this.syncSubtitleDelayOverlayFocusDom({ focus: true });
          return true;
        }
        return true;
      }

      if (keyCode === 38) {
        this.subtitleDelayFocusTarget = "slider";
        this.syncSubtitleDelayOverlayFocusDom({ focus: true });
        return true;
      }
      if (target === "reset") {
        if (keyCode === 39 || (isRtl && keyCode === 37)) {
          this.subtitleDelayFocusTarget = "sync";
          this.syncSubtitleDelayOverlayFocusDom({ focus: true });
          return true;
        }
        if (isSelectKeyCode(keyCode)) {
          this.setSubtitleDelayValue(0, { showOverlay: true });
          this.subtitleDelayFocusTarget = "slider";
          this.syncSubtitleDelayOverlayFocusDom({ focus: true });
          return true;
        }
      }
      if (target === "sync") {
        if (keyCode === 37 || (isRtl && keyCode === 39)) {
          this.subtitleDelayFocusTarget = "reset";
          this.syncSubtitleDelayOverlayFocusDom({ focus: true });
          return true;
        }
        if (isSelectKeyCode(keyCode)) {
          this.openSubtitleTimingDialog();
          return true;
        }
      }
      return true;
    },
    handleSubtitleDelayOverlayPointer(target) {
      const action = target?.closest?.("[data-subtitle-delay-focus]");
      if (!action || !this.subtitleDelayOverlayVisible) {
        return false;
      }
      const focusTarget = String(action.dataset.subtitleDelayFocus || "slider");
      this.subtitleDelayFocusTarget = focusTarget;
      this.syncSubtitleDelayOverlayFocusDom({ focus: false });
      if (focusTarget === "reset") {
        this.setSubtitleDelayValue(0, { showOverlay: true });
      } else if (focusTarget === "sync") {
        this.openSubtitleTimingDialog();
      }
      return true;
    },
    resetSubtitleAutoSyncState(clearLoadedTrack = true) {
      this.subtitleAutoSyncLoadToken = Number(this.subtitleAutoSyncLoadToken || 0) + 1;
      this.subtitleAutoSyncCues = [];
      this.subtitleAutoSyncCapturedVideoMs = null;
      this.subtitleAutoSyncStatus = "";
      this.subtitleAutoSyncError = "";
      this.subtitleAutoSyncLoading = false;
      if (clearLoadedTrack) {
        this.subtitleAutoSyncLoadedTrackKey = "";
      }
    },
    async loadSubtitleAutoSyncCues({ force = false } = {}) {
      const selectedSubtitle = this.getSelectedAddonSubtitle();
      if (!selectedSubtitle) {
        this.subtitleAutoSyncCues = [];
        this.subtitleAutoSyncCapturedVideoMs = null;
        this.subtitleAutoSyncLoading = false;
        this.subtitleAutoSyncError = t("subtitle_auto_sync_select_addon_track", {}, "Select an addon subtitle track to use Auto Sync.");
        this.subtitleAutoSyncLoadedTrackKey = "";
        this.renderSubtitleTimingDialog();
        return;
      }

      const selectedTrackKey = this.getSubtitleAutoSyncTrackKey(selectedSubtitle);
      if (!force && this.subtitleAutoSyncLoadedTrackKey === selectedTrackKey && this.subtitleAutoSyncCues.length) {
        return;
      }

      const loadToken = Number(this.subtitleAutoSyncLoadToken || 0) + 1;
      this.subtitleAutoSyncLoadToken = loadToken;
      this.subtitleAutoSyncLoading = true;
      this.subtitleAutoSyncError = "";
      this.subtitleAutoSyncStatus = "";
      if (force) {
        this.subtitleAutoSyncCues = [];
        this.subtitleAutoSyncCapturedVideoMs = null;
      }
      this.subtitleAutoSyncLoadedTrackKey = selectedTrackKey;
      this.renderSubtitleTimingDialog();

      try {
        const subtitleUrl = String(selectedSubtitle.url || "").trim();
        const languageHint = selectedSubtitle.lang || selectedSubtitle.language || selectedSubtitle.languageCode || "";
        let raw = null;
        try {
          raw = await this.fetchSubtitleRawBody(subtitleUrl, {
            timeoutMs: 10000,
            languageHint,
            subtitleHeaders: selectedSubtitle?.headers
          });
        } catch (directError) {
          if (!Environment.isTizen()) {
            throw directError;
          }
          const proxyUrl = await this.resolveTizenAvPlaySubtitleUrl(subtitleUrl);
          if (!proxyUrl || proxyUrl === subtitleUrl) {
            throw directError;
          }
          raw = await this.fetchSubtitleRawBody(proxyUrl, {
            timeoutMs: 10000,
            languageHint
          });
        }
        if (!raw?.body) {
          throw new Error("Subtitle body is empty");
        }

        const parsedCues = this.parseSubtitleCues(raw.body)
          .map((cue) => ({
            startTimeMs: Math.max(0, Math.round(Number(cue.start || 0) * 1000)),
            endTimeMs: Math.max(0, Math.round(Number(cue.end || 0) * 1000)),
            text: String(cue.text || "").trim()
          }))
          .filter((cue) => cue.text && cue.endTimeMs > cue.startTimeMs);

        if (
          loadToken !== this.subtitleAutoSyncLoadToken ||
          selectedTrackKey !== this.getSubtitleAutoSyncTrackKey(this.getSelectedAddonSubtitle())
        ) {
          return;
        }
        this.subtitleAutoSyncLoading = false;
        this.subtitleAutoSyncCues = parsedCues;
        this.subtitleAutoSyncError = parsedCues.length
          ? ""
          : t("subtitle_timing_file_no_lines", {}, "No subtitle lines were found in this file.");
        this.renderSubtitleTimingDialog();
        if (this.subtitleTimingDialogVisible && this.subtitleTimingStage === "pick") {
          setTimeout(() => this.syncSubtitleTimingFocusDom({ focus: true }), 50);
        }
      } catch (error) {
        if (loadToken !== this.subtitleAutoSyncLoadToken) {
          return;
        }
        this.subtitleAutoSyncLoading = false;
        this.subtitleAutoSyncCues = [];
        this.subtitleAutoSyncError = t("subtitle_timing_load_lines_failed", {}, "Failed to load subtitle lines.");
        this.renderSubtitleTimingDialog();
        console.warn("Subtitle auto-sync cue load failed", {
          error: error?.message || String(error || "")
        });
      }
    },
    openSubtitleTimingDialog() {
      this.clearSubtitleDelayOverlayTimer();
      this.subtitleDelayOverlayVisible = false;
      this.subtitleDelayOverlayStatus = "";
      this.subtitleDialogVisible = false;
      this.audioDialogVisible = false;
      this.speedDialogVisible = false;
      this.sourcesPanelVisible = false;
      this.subtitleTimingDialogVisible = true;
      this.subtitleTimingStage = "wait";
      this.subtitleAutoSyncCapturedVideoMs = null;
      this.subtitleAutoSyncStatus = "";
      this.subtitleAutoSyncError = "";
      this.subtitleAutoSyncCueFocusIndex = 0;
      this.setControlsVisible(false, { focus: false });
      this.renderSubtitleDialog();
      this.renderSubtitleDelayOverlay();
      this.renderSubtitleTimingDialog();
      this.updateModalBackdrop();
      void this.loadSubtitleAutoSyncCues({ force: false });
      setTimeout(() => this.syncSubtitleTimingFocusDom({ focus: true }), 120);
    },
    dismissSubtitleTimingDialog() {
      this.subtitleAutoSyncLoadToken = Number(this.subtitleAutoSyncLoadToken || 0) + 1;
      this.subtitleAutoSyncCapturedVideoMs = null;
      this.subtitleAutoSyncStatus = "";
      this.subtitleAutoSyncError = "";
      this.subtitleAutoSyncLoading = false;
      this.subtitleTimingDialogVisible = false;
      this.subtitleTimingStage = "wait";
      this.renderSubtitleTimingDialog();
      this.updateModalBackdrop();
      this.resetControlsAutoHide();
    }
  };
}
