/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import {
  nativeTextTrackSelectionMatches,
  confirmNativeTrackSelection
} from "../../../core/player/playerControllerMethods-02-is-likely-direct-file-url.js";
import { selectVidaaTextTrack } from "../../../platform/vidaa/vidaaVideo.js";

export function createPlayerScreenMethods54() {
  const { PlayerController, Environment, isTizenEmbeddedTextSubtitleFallbackTrack } = internals;

  return {
    reapplyPendingWebOsAddonSubtitle(nativeMetadataReady = false) {
      const pendingRestore = this.pendingWebOsAddonSubtitleRestore;
      if (!pendingRestore) {
        return false;
      }
      if (nativeMetadataReady) {
        pendingRestore.nativeMetadataReady = true;
      }

      const clearPendingRestore = () => {
        if (this.pendingWebOsAddonSubtitleRestore === pendingRestore) {
          this.pendingWebOsAddonSubtitleRestore = null;
        }
      };
      const playbackRequestIsCurrent = () =>
        pendingRestore.requestId === Number(this.webOsAddonSubtitleRestoreRequestId || 0) &&
        String(this.activePlaybackUrl || "").trim() === pendingRestore.playbackUrl &&
        String(this.selectedAddonSubtitleId || "").trim() === pendingRestore.subtitleId &&
        Number(this.subtitleSelectionToken || 0) === pendingRestore.subtitleSelectionToken &&
        this.isActiveMountToken(pendingRestore.mountToken);

      if (!Environment.isWebOS() || !playbackRequestIsCurrent()) {
        clearPendingRestore();
        return false;
      }

      if (!pendingRestore.nativeMetadataReady) {
        return false;
      }

      const expectedPlayRequestToken = Number(pendingRestore.expectedControllerPlayRequestToken || 0);
      if (
        !expectedPlayRequestToken ||
        Number(PlayerController.playRequestToken || 0) !== expectedPlayRequestToken ||
        Number(PlayerController.nativeMediaIdLookupToken || 0) <= pendingRestore.previousNativeMediaIdLookupToken ||
        this.subtitleLoading ||
        Number(this.subtitleLoadToken || 0) <= pendingRestore.previousSubtitleLoadToken
      ) {
        return false;
      }

      const subtitleIndex = this.subtitles.findIndex((subtitle, index) => {
        const subtitleId = String(subtitle?.id || subtitle?.url || `subtitle-${index}`).trim();
        return subtitleId === pendingRestore.subtitleId;
      });
      const subtitle = subtitleIndex >= 0 ? this.subtitles[subtitleIndex] : null;
      if (!subtitle?.url) {
        clearPendingRestore();
        this.selectedAddonSubtitleId = null;
        this.invalidateTrackDialogCaches();
        this.refreshTrackDialogs();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return false;
      }

      clearPendingRestore();
      this.applySubtitleEntry({
        fallbackAddonSubtitle: true,
        subtitleId: pendingRestore.subtitleId,
        subtitleIndex,
        track: subtitle
      });
      return true;
    },
    async applySubtitleEntry(entry) {
      if (!entry || entry.disabled) {
        return;
      }
      if (!this.startupSubtitlePreferenceApplying) {
        this.startupSubtitlePreferenceApplied = true;
      }
      const selectionToken = Number(this.subtitleSelectionToken || 0) + 1;
      this.subtitleSelectionToken = selectionToken;
      this.cancelExternalSubtitleActivation?.();
      this.requestedSubtitleEntry = entry;
      const video = PlayerController.video;
      const playRequestToken = PlayerController.playRequestToken;
      const mountToken = this.playerMountToken;
      const playbackUrl = this.activePlaybackUrl;
      const isCurrentSelection = () =>
        this.subtitleSelectionToken === selectionToken &&
        this.playerMountToken === mountToken &&
        this.activePlaybackUrl === playbackUrl &&
        PlayerController.video === video &&
        PlayerController.playRequestToken === playRequestToken;
      const previousSubtitleSelectionKey = this.getActiveSubtitleSelectionKey();
      if (this.subtitleSelectionTimer) {
        clearTimeout(this.subtitleSelectionTimer);
        this.subtitleSelectionTimer = null;
      }

      const isEmbeddedEntry = Object.prototype.hasOwnProperty.call(entry, "embeddedSubtitleTrackIndex");
      if (!isEmbeddedEntry) {
        this.disableEmbeddedSubtitleSelection();
      }

      if (isEmbeddedEntry) {
        const targetTrackIndex = Number(entry.embeddedSubtitleTrackIndex);
        const embeddedTrack = this.getEmbeddedSubtitleTrackByEmbeddedIndex(targetTrackIndex);
        if (Environment.isVidaa() && embeddedTrack?.embeddedTextProvider === "vidaa-range") {
          return this.applyVidaaEmbeddedTextSubtitleTrack(embeddedTrack, targetTrackIndex);
        }
        this.destroyAssSubtitleRenderer();
        if (embeddedTrack?.bitmapSubtitle) {
          this.applyBitmapEmbeddedSubtitleTrack(embeddedTrack, targetTrackIndex);
        } else {
          this.applyNativeEmbeddedSubtitleTrack(embeddedTrack, targetTrackIndex);
        }
        return;
      }

      if (!entry.fallbackAddonSubtitle && this.externalTrackNodes.length) {
        this.clearMountedExternalSubtitleTracks();
      }
      if (!entry.fallbackAddonSubtitle) {
        this.clearHtmlSubtitleOverlay();
        // A different subtitle kind was selected: retire any active ASS
        // renderer. The fallbackAddonSubtitle branch re-activates ASS when
        // the new selection is itself an ASS body.
        this.destroyAssSubtitleRenderer();
        this.selectedAddonSubtitleId = null;
      }

      if (Object.prototype.hasOwnProperty.call(entry, "avplaySubtitleTrackIndex")) {
        const targetTrackIndex = Number(entry.avplaySubtitleTrackIndex);
        // Tizen exposes embedded text tracks through the AVPlay list above, so
        // the UI entry does not carry embeddedSubtitleTrackIndex. Recover the
        // local metadata here before selecting AVPlay; otherwise the Tizen
        // extractor fallback is never activated for the normal UI path.
        const tizenEmbeddedTrack = Environment.isTizen() ? this.getEmbeddedSubtitleTrackByNativeIndex(targetTrackIndex) : null;
        const useTizenEmbeddedTextHtmlFallback = isTizenEmbeddedTextSubtitleFallbackTrack(tizenEmbeddedTrack);
        const applied =
          typeof PlayerController.setAvPlaySubtitleTrack === "function"
            ? PlayerController.setAvPlaySubtitleTrack(targetTrackIndex, {
                renderMode: useTizenEmbeddedTextHtmlFallback ? "html" : this.subtitleRenderMode
              })
            : false;
        if (!applied) {
          return;
        }
        this.selectedSubtitleTrackIndex = Number.isFinite(targetTrackIndex) ? targetTrackIndex : -1;
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.selectedAddonSubtitleId = null;
        this.selectedManifestSubtitleTrackId = null;
        this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        if (useTizenEmbeddedTextHtmlFallback) {
          this.webOsEmbeddedTextSubtitleTrack = tizenEmbeddedTrack;
          this.webOsEmbeddedTextSubtitleUsingHtml = false;
          void this.loadWebOsEmbeddedTextSubtitleWindow(this.getPlaybackCurrentSeconds());
        }
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return;
      }

      if (Object.prototype.hasOwnProperty.call(entry, "dashSubtitleTrackIndex")) {
        const targetTrackIndex = Number(entry.dashSubtitleTrackIndex);
        const applied =
          typeof PlayerController.setDashTextTrack === "function" ? PlayerController.setDashTextTrack(targetTrackIndex) : false;
        if (!applied) {
          return;
        }
        this.selectedSubtitleTrackIndex = Number.isFinite(targetTrackIndex) ? targetTrackIndex : -1;
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.selectedAddonSubtitleId = null;
        this.selectedManifestSubtitleTrackId = null;
        this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return;
      }

      if (Object.prototype.hasOwnProperty.call(entry, "hlsSubtitleTrackIndex")) {
        const targetTrackIndex = Number(entry.hlsSubtitleTrackIndex);
        const applied =
          typeof PlayerController.setHlsSubtitleTrack === "function" ? PlayerController.setHlsSubtitleTrack(targetTrackIndex) : false;
        if (!applied) {
          return;
        }
        this.selectedSubtitleTrackIndex = Number.isFinite(targetTrackIndex) ? targetTrackIndex : -1;
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.selectedAddonSubtitleId = null;
        this.selectedManifestSubtitleTrackId = null;
        this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return;
      }

      if (Object.prototype.hasOwnProperty.call(entry, "manifestSubtitleTrackId")) {
        this.applyManifestTrackSelection({ subtitleTrackId: entry.manifestSubtitleTrackId });
        this.selectedSubtitleTrackIndex = -1;
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.selectedAddonSubtitleId = null;
        this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return;
      }

      if (entry.fallbackAddonSubtitle) {
        this.clearMountedExternalSubtitleTracks();
        this.clearHtmlSubtitleOverlay();
        if (this.subtitleSelectionTimer) {
          clearTimeout(this.subtitleSelectionTimer);
          this.subtitleSelectionTimer = null;
        }
        const subtitle = entry.track || this.subtitles[entry.subtitleIndex];
        const subtitleId = entry.subtitleId || subtitle?.id || subtitle?.url || `subtitle-${entry.subtitleIndex}`;
        this.selectedAddonSubtitleId = null;
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        const liveSubtitleIndex = this.subtitles.findIndex((candidate) => {
          const candidateId = candidate?.id || candidate?.url || "";
          return candidateId && candidateId === subtitleId;
        });
        const applied = await this.applyFallbackAddonSubtitle(
          liveSubtitleIndex >= 0 ? liveSubtitleIndex : entry.subtitleIndex,
          selectionToken,
          subtitle
        );
        if (applied && isCurrentSelection()) {
          this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
          return true;
        }
        if (isCurrentSelection()) {
          this.syncTrackState();
          this.renderControlButtons();
          this.renderSubtitleDialog();
        }
        return false;
      }

      if (this.externalTrackNodes.length) {
        this.clearMountedExternalSubtitleTracks();
      }

      const textTracks = this.getTextTracks();
      const targetIndex = Number(entry.trackIndex);
      if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= textTracks.length) return false;

      if (targetIndex < 0 && this.selectedManifestSubtitleTrackId) {
        this.applyManifestTrackSelection({ subtitleTrackId: null });
        this.selectedManifestSubtitleTrackId = null;
      } else if (this.selectedManifestSubtitleTrackId) {
        this.selectedManifestSubtitleTrackId = null;
      }

      const controllerResult =
        typeof PlayerController.setNativeTextTrack === "function" ? PlayerController.setNativeTextTrack(targetIndex) : false;
      const appliedByController = await Promise.resolve(controllerResult).catch(() => false);
      if (!isCurrentSelection()) return false;
      const matchesSelection = () => nativeTextTrackSelectionMatches(this.getTextTracks(), targetIndex);
      // Luna resolves asynchronously and may own outputs whose DOM flags are
      // readonly. Other native backends must expose the applied modes.
      if (appliedByController && (Environment.isWebOS() || (await confirmNativeTrackSelection(matchesSelection, isCurrentSelection)))) {
        this.selectedAddonSubtitleId = null;
        this.selectedSubtitleTrackIndex = targetIndex;
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
        this.invalidateTrackDialogCaches();
        this.refreshSubtitleCueStyles();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return true;
      }
      if (!isCurrentSelection()) return false;

      if (Environment.isVidaa()) {
        selectVidaaTextTrack(textTracks, targetIndex);
      } else {
        textTracks.forEach((track, index) => {
          try {
            track.mode = index === targetIndex ? "showing" : "disabled";
          } catch (_) {
            // Best effort: some WebOS builds expose readonly mode.
          }
        });
      }

      const applied = await confirmNativeTrackSelection(matchesSelection, isCurrentSelection);
      if (!isCurrentSelection()) return false;
      if (!applied) {
        this.syncTrackState();
        this.renderControlButtons();
        this.renderSubtitleDialog();
        return false;
      }

      this.selectedAddonSubtitleId = null;
      this.selectedSubtitleTrackIndex = targetIndex;
      this.selectedEmbeddedSubtitleTrackIndex = -1;
      this.resetSubtitleDelayAfterSelectionChange(previousSubtitleSelectionKey);
      this.invalidateTrackDialogCaches();
      this.refreshSubtitleCueStyles();
      this.renderControlButtons();
      this.renderSubtitleDialog();
      return true;
    }
  };
}
