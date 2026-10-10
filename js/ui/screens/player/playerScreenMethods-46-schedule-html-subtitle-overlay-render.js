/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import {
  nativeTextTrackSelectionMatches,
  confirmNativeTrackSelection
} from "../../../core/player/playerControllerMethods-02-is-likely-direct-file-url.js";

const vidaaMountedSubtitleActivations = new WeakMap();

export function createPlayerScreenMethods46() {
  const {
    PlayerController,
    Environment,
    isAssSubtitle,
    decodeSubtitleResponseBody,
    sanitizeSubtitleMojibake,
    isTizenSubRipEmbeddedSubtitleTrack,
    clamp
  } = internals;

  return {
    async disableNativeSubtitleOutputs(selectionToken = this.subtitleSelectionToken) {
      const video = PlayerController.video;
      const playRequestToken = PlayerController.playRequestToken;
      const mountToken = this.playerMountToken;
      const isCurrent = () =>
        Number(selectionToken) === Number(this.subtitleSelectionToken) &&
        this.playerMountToken === mountToken &&
        PlayerController.video === video &&
        PlayerController.playRequestToken === playRequestToken;
      if (!isCurrent()) return false;
      if (PlayerController.isUsingAvPlay?.()) {
        const applied = await PlayerController.setAvPlaySubtitleTrack?.(-1);
        return Boolean(applied) && isCurrent();
      }
      if (PlayerController.getDashTextTracks?.().length) {
        if (!(await PlayerController.setDashTextTrack?.(-1)) || !isCurrent()) return false;
      } else if (PlayerController.getHlsSubtitleTracks?.().length) {
        if (!(await PlayerController.setHlsSubtitleTrack?.(-1)) || !isCurrent()) return false;
      }
      const applied = await Promise.resolve(PlayerController.setNativeTextTrack?.(-1)).catch(() => false);
      if (!isCurrent()) return false;
      if (applied && Environment.isWebOS()) return true;
      if (!applied) {
        this.getTextTracks().forEach((track) => {
          try {
            track.mode = "disabled";
          } catch (_) {
            /* Check all outputs below. */
          }
        });
      }
      return confirmNativeTrackSelection(() => nativeTextTrackSelectionMatches(this.getTextTracks(), -1), isCurrent);
    },
    scheduleHtmlSubtitleOverlayRender() {
      if (!Array.isArray(this.htmlSubtitleCues) || !this.htmlSubtitleCues.length) {
        return;
      }
      if (this.htmlSubtitleRenderTimer != null) {
        clearTimeout(this.htmlSubtitleRenderTimer);
        this.htmlSubtitleRenderTimer = null;
      }
      const render = () => {
        if (!this.renderHtmlSubtitleOverlayAtCurrentTime()) {
          this.htmlSubtitleRenderTimer = null;
          return;
        }
        this.htmlSubtitleRenderTimer = setTimeout(render, 120);
      };
      render();
    },
    isAvPlaySubtitleControlPayload(value = "") {
      const text = String(value || "").trim();
      if (!text) {
        return false;
      }
      // AVPlay may expose the complete SSA event or its positional CSV fields.
      // Strip only the control prefix for structural validation; plain cue text
      // such as "Dialogue: hello" must remain renderable.
      const payload = text.replace(/^\s*(?:Dialogue|Comment)\s*:\s*/i, "");
      const hasAssTiming =
        /^(?:(?:\d+|Marked\s*=\s*\d+)\s*,\s*)?\d+:\d{1,2}:\d{1,2}[.,]\d{1,3}\s*,\s*\d+:\d{1,2}:\d{1,2}[.,]\d{1,3}\s*,/i.test(payload);
      if (hasAssTiming) {
        return true;
      }
      if (/[.!?\u00C0-\u024F]/.test(text)) {
        return false;
      }
      // Require the numeric prefix and a known AVPlay style token so ordinary
      // comma-containing dialogue remains valid.
      return /^\s*\d+\s*,\s*\d+\s*,\s*(?:Onscreen\d*|Screen)\s*,/i.test(payload) && payload.split(",").length >= 6;
    },
    renderAvPlaySubtitleChange(detail = {}) {
      if (!Environment.isTizen() || typeof PlayerController.isUsingAvPlay !== "function" || !PlayerController.isUsingAvPlay()) {
        return;
      }
      const diagnosticSelectionAt = Number(detail?.diagnosticSelectionAt || 0);
      const logTizenSubtitleRendererDiagnostic = (stage, values = {}) => {
        const captureStartedAt = Number(globalThis.__NUVIO_DEBUG_TIZEN_AVPLAY_STARTED_AT__ || 0);
        if (diagnosticSelectionAt <= 0 || diagnosticSelectionAt < captureStartedAt || globalThis.__NUVIO_DEBUG_TIZEN_AVPLAY__ !== true) {
          return;
        }
        console.info("Tizen AVPlay subtitle renderer", {
          stage,
          elapsedSinceSelectionMs: Math.max(0, Date.now() - diagnosticSelectionAt),
          selectedTrackIndex: Number(PlayerController.selectedAvPlaySubtitleTrackIndex),
          renderMode: String(PlayerController.avplaySubtitleRenderMode || ""),
          nativeRendering: Boolean(PlayerController.avplayNativeSubtitleRendering),
          ...values
        });
      };
      // SubRip is rendered from the bounded Matroska extractor below. Ignore a
      // late AVPlay callback only while that HTML overlay is active, so a failed
      // extractor can still fall back to native AVPlay rendering.
      if (
        isTizenSubRipEmbeddedSubtitleTrack(this.webOsEmbeddedTextSubtitleTrack) &&
        this.webOsEmbeddedTextSubtitleUsingHtml &&
        (typeof PlayerController.shouldRenderAvPlaySubtitleCallbacksInHtml !== "function" ||
          PlayerController.shouldRenderAvPlaySubtitleCallbacksInHtml())
      ) {
        logTizenSubtitleRendererDiagnostic("delegated-to-embedded-extractor");
        return;
      }
      const subtitleOutputActive =
        typeof PlayerController.shouldRenderAvPlaySubtitleCallbacksInHtml === "function"
          ? PlayerController.shouldRenderAvPlaySubtitleCallbacksInHtml()
          : Number(this.selectedSubtitleTrackIndex) >= 0;
      if (!subtitleOutputActive) {
        logTizenSubtitleRendererDiagnostic("html-overlay-inactive");
        return;
      }
      if (this.avPlaySubtitleOverlayTimer) {
        clearTimeout(this.avPlaySubtitleOverlayTimer);
        this.avPlaySubtitleOverlayTimer = null;
      }
      const rawText = String(detail?.subtitles || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      // Samsung AVPlay can expose SSA/ASS fields instead of dialogue text.
      // Never project that control payload into the video overlay.
      const text = this.parseSubtitleCueText(rawText);
      const isControlPayload = this.isAvPlaySubtitleControlPayload(rawText);
      if (!text || isControlPayload) {
        logTizenSubtitleRendererDiagnostic("cue-filtered", {
          rawPayloadLength: rawText.length,
          parsedTextLength: text.length,
          isControlPayload
        });
        this.renderHtmlSubtitleOverlayCue([]);
        return;
      }

      this.htmlSubtitleCues = [];
      this.htmlSubtitleSelectedId = "avplay-native";
      const alignment = this.getSubtitleAssAlignment(rawText);
      const layout = this.getSubtitleAssAlignmentSettings(alignment) || {
        line: null,
        align: "center"
      };
      logTizenSubtitleRendererDiagnostic("cue-sent-to-html-overlay", {
        rawPayloadLength: rawText.length,
        parsedTextLength: text.length,
        alignment
      });
      this.renderHtmlSubtitleOverlayCue([{ start: 0, end: 0, text, ...layout }]);
      const durationMs = Number(detail?.duration || 0);
      const hideDelayMs = Number.isFinite(durationMs) && durationMs > 0 ? clamp(durationMs, 250, 12000) : 2500;
      this.avPlaySubtitleOverlayTimer = setTimeout(() => {
        this.avPlaySubtitleOverlayTimer = null;
        this.renderHtmlSubtitleOverlayCue([]);
      }, hideDelayMs);
    },
    async applyTvHtmlAddonSubtitle(subtitle, subtitleIndex, selectionToken = this.subtitleSelectionToken) {
      const video = PlayerController.video;
      const playRequestToken = PlayerController.playRequestToken;
      const mountToken = this.playerMountToken;
      const isCurrentSelection = () =>
        Number(selectionToken) === Number(this.subtitleSelectionToken) &&
        this.playerMountToken === mountToken &&
        PlayerController.video === video &&
        PlayerController.playRequestToken === playRequestToken;
      if (!isCurrentSelection()) {
        return false;
      }
      const subtitleId = subtitle?.id || subtitle?.url || `subtitle-${subtitleIndex}`;
      const sourceUrl = String(subtitle?.url || "");

      // ASS branch: fetch the raw body and render through ass.js when
      // detected. Native AVPlay subtitle handling cannot consume ASS text,
      // so the HTML overlay (or ass.js overlay) is the only presentation.
      if (Environment.isWebOS() || Environment.isVidaa() || (Environment.isTizen() && PlayerController.isUsingAvPlay?.())) {
        let raw = null;
        try {
          raw = await this.fetchSubtitleRawBody(sourceUrl, {
            languageHint: subtitle?.lang || subtitle?.language || subtitle?.languageCode,
            subtitleHeaders: subtitle?.headers
          });
        } catch (assFetchError) {
          if (!isCurrentSelection()) {
            return false;
          }
          console.warn("ASS subtitle fetch failed", {
            subtitleUrl: sourceUrl,
            error: assFetchError?.message || String(assFetchError || "")
          });
          // Fall through to the existing HTML subtitle path.
        }
        if (raw?.body != null && isAssSubtitle(raw.body, { sourceUrl, contentType: raw.contentType })) {
          if (!isCurrentSelection()) {
            return false;
          }
          if (!(await this.disableNativeSubtitleOutputs(selectionToken)) || !isCurrentSelection()) return false;
          this.clearMountedExternalSubtitleTracks();
          this.clearHtmlSubtitleOverlay();
          const assResult = await this.applyAssSubtitleBody({
            body: raw.body,
            selectionToken,
            isCurrent: isCurrentSelection
          });
          if (assResult.applied && isCurrentSelection()) {
            this.setSelectedAddonSubtitle(subtitle, subtitleIndex);
            this.selectedSubtitleTrackIndex = -1;
            this.selectedEmbeddedSubtitleTrackIndex = -1;
            this.selectedManifestSubtitleTrackId = null;
            this.invalidateTrackDialogCaches();
            this.renderControlButtons();
            this.renderSubtitleDialog();
            return true;
          }
          // ass.js unavailable or stale: plain-text VTT fallback below.
          const fallbackCues = this.parseSubtitleCues(assResult.fallbackVtt || "");
          if (fallbackCues.length && isCurrentSelection()) {
            this.clearMountedExternalSubtitleTracks();
            this.clearHtmlSubtitleOverlay();
            this.destroyAssSubtitleRenderer();
            this.htmlSubtitleCues = fallbackCues;
            this.htmlSubtitleSelectedId = subtitleId;
            this.setSelectedAddonSubtitle(subtitle, subtitleIndex);
            this.selectedSubtitleTrackIndex = -1;
            this.selectedEmbeddedSubtitleTrackIndex = -1;
            this.selectedManifestSubtitleTrackId = null;
            this.renderHtmlSubtitleOverlayCue([]);
            this.scheduleHtmlSubtitleOverlayRender();
            this.invalidateTrackDialogCaches();
            this.refreshSubtitleCueStyles();
            this.renderControlButtons();
            this.renderSubtitleDialog();
            return true;
          }
          console.warn("ASS subtitle fallback produced no cues", { subtitleUrl: sourceUrl });
          return false;
        }
        if (raw?.body != null) {
          // Non-ASS body already fetched: parse cues directly, no second
          // network round trip.
          if (!isCurrentSelection()) {
            return false;
          }
          const cues = this.parseSubtitleCues(raw.body);
          if (!cues.length) {
            throw new Error("HTML subtitle fetch returned no cues");
          }
          if (!(await this.disableNativeSubtitleOutputs(selectionToken)) || !isCurrentSelection()) return false;
          this.clearMountedExternalSubtitleTracks();
          this.clearHtmlSubtitleOverlay();
          this.destroyAssSubtitleRenderer();
          this.htmlSubtitleCues = cues;
          this.htmlSubtitleSelectedId = subtitleId;
          this.setSelectedAddonSubtitle(subtitle, subtitleIndex);
          this.selectedSubtitleTrackIndex = -1;
          this.selectedEmbeddedSubtitleTrackIndex = -1;
          this.selectedManifestSubtitleTrackId = null;
          this.renderHtmlSubtitleOverlayCue([]);
          this.scheduleHtmlSubtitleOverlayRender();
          this.invalidateTrackDialogCaches();
          this.refreshSubtitleCueStyles();
          this.renderControlButtons();
          this.renderSubtitleDialog();
          return true;
        }
      }

      const subtitleUrl = Environment.isTizen()
        ? await this.resolveTizenAvPlaySubtitleUrl(subtitle?.url)
        : await this.resolveSubtitlePlaybackUrl(subtitle?.url, {
            languageHint: subtitle?.lang || subtitle?.language || subtitle?.languageCode,
            subtitleHeaders: subtitle?.headers
          });
      if (!subtitleUrl) {
        return false;
      }
      const response = await fetch(subtitleUrl, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HTML subtitle fetch failed with HTTP ${response.status}`);
      }
      const decodedText =
        typeof TextDecoder === "function"
          ? await decodeSubtitleResponseBody(response, {
              languageHint: subtitle?.lang || subtitle?.language || subtitle?.languageCode
            })
          : null;
      const text = sanitizeSubtitleMojibake(decodedText ?? (await response.text()));
      if (!isCurrentSelection()) {
        return false;
      }
      const cues = this.parseSubtitleCues(text);
      if (!cues.length) {
        throw new Error("HTML subtitle fetch returned no cues");
      }
      if (!(await this.disableNativeSubtitleOutputs(selectionToken)) || !isCurrentSelection()) return false;
      this.clearMountedExternalSubtitleTracks();
      this.clearHtmlSubtitleOverlay();
      this.destroyAssSubtitleRenderer();
      this.htmlSubtitleCues = cues;
      this.htmlSubtitleSelectedId = subtitleId;
      this.setSelectedAddonSubtitle(subtitle, subtitleIndex);
      this.selectedSubtitleTrackIndex = -1;
      this.selectedEmbeddedSubtitleTrackIndex = -1;
      this.selectedManifestSubtitleTrackId = null;
      this.renderHtmlSubtitleOverlayCue([]);
      this.scheduleHtmlSubtitleOverlayRender();
      this.invalidateTrackDialogCaches();
      this.refreshSubtitleCueStyles();
      this.renderControlButtons();
      this.renderSubtitleDialog();
      return true;
    },
    activateMountedExternalSubtitleTrack(trackNode) {
      const textTracks = this.getTextTracks();
      const targetTrack = trackNode?.track || null;
      const targetIndex = targetTrack
        ? textTracks.indexOf(targetTrack)
        : trackNode && textTracks.length > Number(this.builtInSubtitleCount || 0)
          ? textTracks.length - 1
          : -1;
      if (targetIndex < 0) {
        return false;
      }

      if (Environment.isVidaa()) {
        const target = textTracks[targetIndex];
        const video = PlayerController.video;
        let activation = vidaaMountedSubtitleActivations.get(trackNode);
        if (!activation) {
          activation = {
            screen: this,
            target,
            video,
            videoSource: video?.src,
            playRequestToken: PlayerController.playRequestToken,
            mountToken: this.playerMountToken,
            selectionToken: this.subtitleSelectionToken,
            mounted: this.externalTrackNodes?.includes(trackNode),
            startedAt: Date.now(),
            writes: new WeakMap()
          };
          vidaaMountedSubtitleActivations.set(trackNode, activation);
        }
        const isCurrent = () =>
          activation.screen === this &&
          activation.target === target &&
          activation.video === PlayerController.video &&
          activation.videoSource === PlayerController.video?.src &&
          activation.playRequestToken === PlayerController.playRequestToken &&
          activation.mountToken === this.playerMountToken &&
          activation.selectionToken === this.subtitleSelectionToken &&
          (!activation.mounted || this.externalTrackNodes?.includes(trackNode));
        if (!isCurrent()) return false;
        if (!nativeTextTrackSelectionMatches(textTracks, targetIndex) && Date.now() - activation.startedAt > 850) return false;
        const writePendingMode = (track, mode) => {
          if (!isCurrent()) return;
          try {
            if (track.mode === mode) return;
            const previous = activation.writes.get(track);
            // A delayed readback must not cause a fresh renderer restart on
            // every 80/140 ms activation check. Retry only pending mode writes.
            if (previous?.mode === mode && Date.now() - previous.at < 250) return;
            activation.writes.set(track, { mode, at: Date.now() });
            track.mode = mode;
          } catch (_) {
            /* Verify the exclusive output below, including readonly modes. */
          }
        };
        // A mounted track is already hidden/loading. Keep its output intact
        // after requesting enable, and disable only competing native tracks.
        textTracks.forEach((track) => {
          if (track !== target) writePendingMode(track, "disabled");
        });
        try {
          if (isCurrent() && textTracks.every((track) => track === target || track.mode === "disabled")) {
            writePendingMode(target, "showing");
          }
        } catch (_) {
          /* Readonly track modes cannot confirm an exclusive selection. */
        }
        if (!isCurrent()) return false;
      } else {
        textTracks.forEach((textTrack) => {
          try {
            textTrack.mode = "disabled";
          } catch (_) {
            // Best effort.
          }
        });
        try {
          textTracks[targetIndex].mode = "showing";
        } catch (_) {
          /* Verify below. */
        }
      }

      const currentTracks = this.getTextTracks();
      const confirmedIndex = currentTracks.indexOf(textTracks[targetIndex]);
      if (confirmedIndex >= 0 && nativeTextTrackSelectionMatches(currentTracks, confirmedIndex)) {
        this.selectedSubtitleTrackIndex = confirmedIndex;
        this.refreshTrackDialogs();
        return true;
      }

      return false;
    },
    resolveBuiltInSubtitleBoundary(textTracks = this.getTextTracks()) {
      const trackCount = textTracks.length;
      if (!trackCount) {
        return 0;
      }

      if (Number.isFinite(this.builtInSubtitleCount) && this.builtInSubtitleCount > 0) {
        return clamp(this.builtInSubtitleCount, 0, trackCount);
      }

      if (this.externalTrackNodes.length > 0) {
        const inferred = trackCount - this.externalTrackNodes.length;
        if (inferred >= 0) {
          return clamp(inferred, 0, trackCount);
        }
        return trackCount;
      }

      return trackCount;
    }
  };
}
