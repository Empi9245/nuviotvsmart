/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods55() {
  const {
    PlayerController,
    Environment,
    isAssSubtitle,
    SUBTITLE_LANGUAGE_OFF_KEY,
    SUBTITLE_VIRTUAL_ROW_GAP,
    subtitleLabel,
    normalizeTrackLanguageCode,
    escapeHtml,
    escapeAttribute,
    createSubtitleOptionVirtualState
  } = internals;

  return {
    async applyFallbackAddonSubtitle(subtitleIndex, selectionToken = this.subtitleSelectionToken, subtitleOverride = null) {
      const subtitle = subtitleOverride || this.subtitles[subtitleIndex];
      if (!subtitle?.url) {
        return;
      }
      const subtitleId = subtitle.id || subtitle.url || `subtitle-${subtitleIndex}`;
      const videoAtSelection = PlayerController.video;
      const playRequestToken = PlayerController.playRequestToken;
      const mountToken = this.playerMountToken;
      const isCurrentSelection = () =>
        Number(selectionToken) === Number(this.subtitleSelectionToken) &&
        this.playerMountToken === mountToken &&
        PlayerController.video === videoAtSelection &&
        PlayerController.playRequestToken === playRequestToken;
      if (!isCurrentSelection()) {
        return;
      }

      const usingAvPlay = typeof PlayerController.isUsingAvPlay === "function" ? PlayerController.isUsingAvPlay() : false;
      if (
        (usingAvPlay && Environment.isTizen()) ||
        Environment.isWebOS() ||
        (Environment.isVidaa() && this.subtitleRenderMode === "html")
      ) {
        try {
          if (await this.applyTvHtmlAddonSubtitle(subtitle, subtitleIndex, selectionToken)) {
            return true;
          }
        } catch (error) {
          if (!isCurrentSelection()) {
            return;
          }
          console.warn("HTML subtitle overlay failed", {
            subtitleUrl: subtitle.url,
            error: error?.message || String(error || "")
          });
        }
      }
      if (!isCurrentSelection()) {
        return;
      }
      if (usingAvPlay) {
        let avPlaySubtitleUrl = subtitle.url;
        try {
          avPlaySubtitleUrl = Environment.isTizen()
            ? (await this.resolveTizenAvPlaySubtitleUrl(subtitle.url)) || subtitle.url
            : (await this.resolveSubtitlePlaybackUrl(subtitle.url, {
                languageHint: subtitle?.lang || subtitle?.language || subtitle?.languageCode,
                subtitleHeaders: subtitle?.headers
              })) || subtitle.url;
        } catch (_) {
          avPlaySubtitleUrl = subtitle.url;
        }
        if (!isCurrentSelection()) {
          return;
        }
        const applied =
          typeof PlayerController.setAvPlayExternalSubtitle === "function"
            ? PlayerController.setAvPlayExternalSubtitle(avPlaySubtitleUrl)
            : false;
        const fallbackApplied =
          !applied && avPlaySubtitleUrl !== subtitle.url && typeof PlayerController.setAvPlayExternalSubtitle === "function"
            ? PlayerController.setAvPlayExternalSubtitle(subtitle.url)
            : false;
        if (applied || fallbackApplied) {
          this.clearHtmlSubtitleOverlay();
          this.selectedAddonSubtitleId = subtitleId;
          this.selectedSubtitleTrackIndex = -1;
          this.selectedEmbeddedSubtitleTrackIndex = -1;
          this.selectedManifestSubtitleTrackId = null;
          this.refreshSubtitleCueStyles();
          this.renderControlButtons();
          this.renderSubtitleDialog();
          return true;
        }
      }

      const video = PlayerController.video;
      if (!video) {
        return;
      }

      const currentTracks = this.getTextTracks();
      this.builtInSubtitleCount = this.externalTrackNodes.length
        ? Math.max(0, currentTracks.length - this.externalTrackNodes.length)
        : currentTracks.length;

      this.disableEmbeddedSubtitleSelection();
      this.cancelExternalSubtitleActivation?.();
      this.clearMountedExternalSubtitleTracks();
      this.selectedAddonSubtitleId = null;

      // ASS branch: detect from the raw body and render through ass.js.
      let assFallbackVtt = "";
      let rawBody = null;
      let detectedAss = false;
      try {
        const raw = await this.fetchSubtitleRawBody(subtitle.url, {
          languageHint: subtitle?.lang || subtitle?.language || subtitle?.languageCode,
          subtitleHeaders: subtitle?.headers
        });
        rawBody = raw;
        if (!isCurrentSelection()) return false;
        detectedAss = Boolean(raw?.body != null && isAssSubtitle(raw.body, { sourceUrl: subtitle.url, contentType: raw.contentType }));
        if (detectedAss) {
          if (!isCurrentSelection()) {
            return;
          }
          if (!(await this.disableNativeSubtitleOutputs(selectionToken)) || !isCurrentSelection()) return false;
          this.clearHtmlSubtitleOverlay();
          const assResult = await this.applyAssSubtitleBody({
            body: raw.body,
            selectionToken,
            isCurrent: isCurrentSelection
          });
          if (assResult.applied && isCurrentSelection()) {
            this.selectedAddonSubtitleId = subtitleId;
            this.selectedSubtitleTrackIndex = -1;
            this.selectedEmbeddedSubtitleTrackIndex = -1;
            this.selectedManifestSubtitleTrackId = null;
            this.invalidateTrackDialogCaches();
            this.renderControlButtons();
            this.renderSubtitleDialog();
            return true;
          }
          assFallbackVtt = assResult.fallbackVtt || "";
        }
      } catch (assError) {
        if (!isCurrentSelection()) {
          return;
        }
        console.warn("ASS subtitle handling failed", {
          subtitleUrl: subtitle.url,
          error: assError?.message || String(assError || "")
        });
      }

      if (!isCurrentSelection()) return false;
      let resolvedSubtitleUrl = "";
      if (detectedAss) {
        if (!assFallbackVtt) {
          console.warn("ASS subtitle fallback produced no cues", { subtitleUrl: subtitle.url });
          return;
        }
        resolvedSubtitleUrl = URL.createObjectURL(new Blob([assFallbackVtt], { type: "text/vtt" }));
        this.externalSubtitleObjectUrls.push(resolvedSubtitleUrl);
      } else if (rawBody?.body == null && rawBody?.sourceUrl) {
        // blob:/data: URLs were not fetched; preserve the old direct URL path.
        resolvedSubtitleUrl = rawBody.sourceUrl;
      } else if (rawBody) {
        resolvedSubtitleUrl = this.createSubtitleObjectUrl(rawBody.body, rawBody.resolvedUrl || rawBody.sourceUrl, rawBody.contentType);
      } else {
        resolvedSubtitleUrl = subtitle.url;
      }
      if (!isCurrentSelection() || !resolvedSubtitleUrl) {
        return;
      }

      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = subtitle.lang || subtitleLabel(subtitleIndex);
      track.srclang = normalizeTrackLanguageCode(subtitle.lang) || "und";
      track.src = resolvedSubtitleUrl;
      track.default = false;
      track.setAttribute("data-addon-subtitle-id", subtitleId);
      video.appendChild(track);
      this.externalTrackNodes.push(track);

      try {
        if (track.track) {
          track.track.mode = "hidden";
        }
      } catch (_) {
        // Best effort.
      }

      if (this.subtitleSelectionTimer) {
        clearTimeout(this.subtitleSelectionTimer);
        this.subtitleSelectionTimer = null;
      }

      return new Promise((resolve) => {
        let activationAttempts = 0;
        let timer = null;
        let completionTimer = null;
        let finished = false;
        const finish = (applied) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          clearTimeout(completionTimer);
          if (this.cancelExternalSubtitleActivation === cancelActivation) this.cancelExternalSubtitleActivation = null;
          if (this.subtitleSelectionTimer === timer) this.subtitleSelectionTimer = null;
          track.removeEventListener("load", activateTrack);
          if (!applied) track.removeEventListener("error", onError);
          if (isCurrentSelection()) {
            if (applied) {
              this.selectedAddonSubtitleId = subtitleId;
              this.selectedEmbeddedSubtitleTrackIndex = -1;
              this.selectedManifestSubtitleTrackId = null;
              this.invalidateTrackDialogCaches();
              this.refreshSubtitleCueStyles();
            } else {
              this.clearMountedExternalSubtitleTracks();
              this.selectedAddonSubtitleId = null;
              this.syncTrackState();
            }
            this.renderControlButtons();
            this.renderSubtitleDialog();
          }
          resolve(applied);
        };
        const cancelActivation = () => finish(false);
        this.cancelExternalSubtitleActivation = cancelActivation;
        const activateTrack = () => {
          if (!isCurrentSelection()) {
            finish(false);
            return false;
          }
          if (!this.activateMountedExternalSubtitleTrack(track)) return false;
          finish(true);
          return true;
        };
        const onError = () => {
          if (isCurrentSelection()) console.warn("Subtitle track failed to load", { subtitleUrl: subtitle.url });
          if (finished) {
            if (isCurrentSelection()) {
              this.clearMountedExternalSubtitleTracks();
              this.selectedAddonSubtitleId = null;
              this.syncTrackState();
              this.renderControlButtons();
              this.renderSubtitleDialog();
            }
            return;
          }
          finish(false);
        };
        const scheduleActivation = () => {
          timer = setTimeout(
            () => {
              activationAttempts += 1;
              if (activateTrack() || finished) return;
              if (activationAttempts < 6) scheduleActivation();
              else finish(false);
            },
            activationAttempts === 0 ? 80 : 140
          );
          this.subtitleSelectionTimer = timer;
        };
        track.addEventListener("load", activateTrack);
        track.addEventListener("error", onError, { once: true });
        // Source/route cleanup may clear the activation timer itself. Keep the
        // returned promise bounded even if that cleanup wins without a load event.
        completionTimer = setTimeout(() => finish(false), 850);
        scheduleActivation();
      });
    },
    getSubtitleOptionKeys(options = []) {
      const occurrences = new Map();
      return options.map((item, index) => {
        const baseKey = String(item?.id || `subtitle-option-${index}`);
        const occurrence = Number(occurrences.get(baseKey) || 0);
        occurrences.set(baseKey, occurrence + 1);
        return occurrence ? `${baseKey}#${occurrence}` : baseKey;
      });
    },
    renderSubtitleOptionItemMarkup(item, index, optionKey) {
      return `
                <div class="player-dialog-item focusable${item.selected ? " selected" : ""}${item.disabled ? " disabled" : ""}" data-subtitle-rail="options" data-subtitle-index="${index}" data-subtitle-key="${escapeAttribute(optionKey)}" aria-disabled="${item.disabled ? "true" : "false"}">
                  <div class="player-subtitle-option-copy">
                    <span class="player-subtitle-source-chip">${escapeHtml(item.sourceLabel || "")}</span>
                    <div class="player-dialog-item-main">${escapeHtml(item.title || "")}</div>
                    ${item.meta ? `<div class="player-dialog-item-sub">${escapeHtml(item.meta)}</div>` : ""}
                  </div>
                  <div class="player-dialog-item-check">${item.selected ? "&#10003;" : ""}</div>
                </div>
              `;
    },
    prepareSubtitleOptionVirtualState(languageKey, keys) {
      const state = this.subtitleOptionVirtualState || createSubtitleOptionVirtualState();
      const normalizedLanguageKey = String(languageKey || SUBTITLE_LANGUAGE_OFF_KEY);
      const sameKeys =
        state.languageKey === normalizedLanguageKey &&
        state.keys.length === keys.length &&
        state.keys.every((key, index) => key === keys[index]);
      if (!sameKeys) {
        state.languageKey = normalizedLanguageKey;
        state.keys = keys.slice();
        state.measuredExtents = new Map();
        state.model = null;
        state.window = null;
        state.scrollTop = 0;
        state.initialized = false;
      }
      this.subtitleOptionVirtualState = state;
      return { state, languageChanged: !sameKeys };
    },
    getSubtitleVirtualRowGap() {
      // components.css supplies the same 8px spacing through margin when the
      // legacy runtime lacks flex-gap, so the logical model remains identical.
      return SUBTITLE_VIRTUAL_ROW_GAP;
    }
  };
}
