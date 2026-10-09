/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods47() {
  const { PlayerController, Environment } = internals;

  return {
    syncTrackState() {
      const textTracks = this.getTextTracks();
      const audioTracks = this.getAudioTracks();
      const dashAudioTracks = typeof PlayerController.getDashAudioTracks === "function" ? PlayerController.getDashAudioTracks() : [];
      const dashSubtitleTracks = typeof PlayerController.getDashTextTracks === "function" ? PlayerController.getDashTextTracks() : [];
      const avplayAudioTracks = typeof PlayerController.getAvPlayAudioTracks === "function" ? PlayerController.getAvPlayAudioTracks() : [];
      const avplaySubtitleTracks =
        typeof PlayerController.getAvPlaySubtitleTracks === "function" ? PlayerController.getAvPlaySubtitleTracks() : [];
      const selectedEmbeddedSubtitleTrack =
        typeof PlayerController.getSelectedWebOsEmbeddedSubtitleTrackIndex === "function"
          ? PlayerController.getSelectedWebOsEmbeddedSubtitleTrackIndex()
          : -1;
      const hlsAudioTracks = typeof PlayerController.getHlsAudioTracks === "function" ? PlayerController.getHlsAudioTracks() : [];
      const hlsSubtitleTracks = typeof PlayerController.getHlsSubtitleTracks === "function" ? PlayerController.getHlsSubtitleTracks() : [];

      if (!this.externalTrackNodes.length) {
        this.builtInSubtitleCount = textTracks.length;
      } else if (
        (!Number.isFinite(this.builtInSubtitleCount) || this.builtInSubtitleCount <= 0) &&
        textTracks.length > this.externalTrackNodes.length
      ) {
        this.builtInSubtitleCount = textTracks.length - this.externalTrackNodes.length;
      }

      if (avplaySubtitleTracks.length) {
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        const selectedAvPlaySubtitleTrack =
          typeof PlayerController.getSelectedAvPlaySubtitleTrackIndex === "function"
            ? PlayerController.getSelectedAvPlaySubtitleTrackIndex()
            : -1;
        this.selectedSubtitleTrackIndex = Number.isFinite(selectedAvPlaySubtitleTrack) ? selectedAvPlaySubtitleTrack : -1;
      } else if (dashSubtitleTracks.length) {
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        const selectedDashSubtitleTrack =
          typeof PlayerController.getSelectedDashTextTrackIndex === "function" ? PlayerController.getSelectedDashTextTrackIndex() : -1;
        this.selectedSubtitleTrackIndex = Number.isFinite(selectedDashSubtitleTrack) ? selectedDashSubtitleTrack : -1;
      } else if (hlsSubtitleTracks.length) {
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        const selectedHlsSubtitleTrack =
          typeof PlayerController.getSelectedHlsSubtitleTrackIndex === "function"
            ? PlayerController.getSelectedHlsSubtitleTrackIndex()
            : -1;
        this.selectedSubtitleTrackIndex = Number.isFinite(selectedHlsSubtitleTrack) ? selectedHlsSubtitleTrack : -1;
        this.selectedManifestSubtitleTrackId = null;
      } else if (this.shouldUseEmbeddedSubtitleTracks()) {
        if (!this.bitmapSubtitleTrack && this.webOsEmbeddedTextSubtitleTrack?.embeddedTextProvider !== "vidaa-range") {
          this.selectedEmbeddedSubtitleTrackIndex = Number.isFinite(selectedEmbeddedSubtitleTrack) ? selectedEmbeddedSubtitleTrack : -1;
        }
        this.selectedSubtitleTrackIndex = -1;
      } else if (Environment.isVidaa()) {
        // VIDAA firmware misreports track.mode readbacks while a switch is
        // settling and can leave several tracks reporting "showing". Adopt the
        // native readback only when exactly one track is showing; otherwise
        // keep the app-tracked selection so the dialog does not snap back to
        // the first selection on every refresh.
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        const showingIndexes = [];
        textTracks.forEach((track, index) => {
          if (track?.mode === "showing") {
            showingIndexes.push(index);
          }
        });
        if (showingIndexes.length === 1) {
          this.selectedSubtitleTrackIndex = showingIndexes[0];
        } else if (
          showingIndexes.length === 0 &&
          !(Number(this.selectedSubtitleTrackIndex) >= 0 && Number(this.selectedSubtitleTrackIndex) < textTracks.length)
        ) {
          this.selectedSubtitleTrackIndex = -1;
        }
      } else {
        this.selectedEmbeddedSubtitleTrackIndex = -1;
        this.selectedSubtitleTrackIndex = textTracks.findIndex((track) => track?.mode === "showing");
      }

      if (avplayAudioTracks.length) {
        const selectedAvPlayAudioTrack =
          typeof PlayerController.getSelectedAvPlayAudioTrackIndex === "function"
            ? PlayerController.getSelectedAvPlayAudioTrackIndex()
            : -1;
        const fallbackTrackIndex = Number(avplayAudioTracks[0]?.avplayTrackIndex);
        this.selectedAudioTrackIndex =
          selectedAvPlayAudioTrack >= 0 ? selectedAvPlayAudioTrack : Number.isFinite(fallbackTrackIndex) ? fallbackTrackIndex : 0;
        this.invalidateTrackDialogCaches();
        return;
      }

      if (dashAudioTracks.length) {
        const selectedDashAudioTrack =
          typeof PlayerController.getSelectedDashAudioTrackIndex === "function" ? PlayerController.getSelectedDashAudioTrackIndex() : -1;
        this.selectedAudioTrackIndex = selectedDashAudioTrack >= 0 ? selectedDashAudioTrack : 0;
        this.invalidateTrackDialogCaches();
        return;
      }

      if (hlsAudioTracks.length) {
        const selectedHlsAudioTrack =
          typeof PlayerController.getSelectedHlsAudioTrackIndex === "function" ? PlayerController.getSelectedHlsAudioTrackIndex() : -1;
        const defaultHlsAudioTrack = hlsAudioTracks.findIndex((track) => Boolean(track?.default));
        this.selectedAudioTrackIndex =
          selectedHlsAudioTrack >= 0 ? selectedHlsAudioTrack : defaultHlsAudioTrack >= 0 ? defaultHlsAudioTrack : 0;
        this.invalidateTrackDialogCaches();
        return;
      }

      this.selectedAudioTrackIndex = audioTracks.findIndex((track) => Boolean(track?.enabled || track?.selected));
      this.invalidateTrackDialogCaches();
    },
    isSubtitleOffEntrySelected(nativeTrackIndex = this.selectedSubtitleTrackIndex) {
      return (
        Number(nativeTrackIndex) < 0 &&
        Number(this.selectedEmbeddedSubtitleTrackIndex) < 0 &&
        !this.selectedAddonSubtitleId &&
        !this.selectedManifestSubtitleTrackId
      );
    }
  };
}
