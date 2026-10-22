/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import { resolveStreamSubtitleOffsetMs, resolveEffectiveSubtitleDelayMs } from "../../../core/player/streamAudioDelay.js";

// Per-output subtitle delay (PR #4027 port): the user's own subtitle delay plus
// the stream source offset (behaviorHints.audioDelayMs, scoped by
// behaviorHints.audioDelayLanguage) for the embedded subtitles that come from
// the addon's audio source. Addon/external subtitles are never shifted, and the
// stream offset is never persisted: SubtitleDelayPreferencesStore keeps saving
// only this.subtitleDelayMs.

export function createPlayerScreenMethods74() {
  return {
    // behaviorHints of the stream candidate currently playing.
    getStreamAudioDelayHints() {
      const candidate = this.getCurrentStreamCandidate?.() || null;
      return candidate?.behaviorHints || candidate?.raw?.behaviorHints || null;
    },
    getSubtitleDelayTrackLanguage(track) {
      return String(track?.language || track?.lang || "").trim();
    },
    // A track that belongs to the stream itself (embedded/extracted text,
    // bitmap, native or manifest track).
    getEmbeddedSubtitleDelayContext(track) {
      return { embedded: true, language: this.getSubtitleDelayTrackLanguage(track) };
    },
    // The subtitle output being rendered right now. Addon/external subtitles
    // follow the video timeline and are never shifted.
    getActiveSubtitleDelayContext() {
      if (this.selectedAddonSubtitleId) {
        return { embedded: false, language: "" };
      }
      if (Number(this.selectedEmbeddedSubtitleTrackIndex) >= 0) {
        return this.getEmbeddedSubtitleDelayContext(
          this.getEmbeddedSubtitleTrackByEmbeddedIndex?.(this.selectedEmbeddedSubtitleTrackIndex) || null
        );
      }
      if (this.selectedManifestSubtitleTrackId) {
        const track =
          (this.manifestSubtitleTracks || []).find((entry) => String(entry?.id || "") === String(this.selectedManifestSubtitleTrackId)) ||
          null;
        return this.getEmbeddedSubtitleDelayContext(track);
      }
      if (Number(this.selectedSubtitleTrackIndex) >= 0) {
        const tracks = this.getSubtitleCueTrackList();
        const index = Number(this.selectedSubtitleTrackIndex);
        const track = tracks[index] || null;
        // Text tracks past the built-in boundary belong to mounted addon
        // subtitle nodes.
        const embedded = index < this.resolveBuiltInSubtitleBoundary(tracks);
        return { embedded, language: this.getSubtitleDelayTrackLanguage(track) };
      }
      return { embedded: false, language: "" };
    },
    getSubtitleDelayMsForContext(context = null) {
      const scope = context || { embedded: false, language: "" };
      return resolveEffectiveSubtitleDelayMs(this.subtitleDelayMs, this.getStreamAudioDelayHints(), scope.language, {
        embedded: Boolean(scope.embedded)
      });
    },
    getActiveSubtitleDelayMs() {
      return this.getSubtitleDelayMsForContext(this.getActiveSubtitleDelayContext());
    },
    getEmbeddedSubtitleDelayMs(track) {
      return this.getSubtitleDelayMsForContext(this.getEmbeddedSubtitleDelayContext(track));
    },
    // The ASS renderer is created before the selection state settles, so its
    // source context is captured at creation (applyAssSubtitleBody).
    getAssSubtitleDelayMs() {
      return this.getSubtitleDelayMsForContext(this.assSubtitleDelayContext || this.getActiveSubtitleDelayContext());
    },
    // Per-track delay for native cue timing: every track keeps the user delay,
    // only built-in tracks in the scoped language pick up the stream offset.
    getSubtitleCueDelayMsForTrack(track) {
      const tracks = this.getSubtitleCueTrackList();
      const index = tracks.indexOf(track);
      const embedded = index >= 0 && index < this.resolveBuiltInSubtitleBoundary(tracks);
      return this.getSubtitleDelayMsForContext({ embedded, language: this.getSubtitleDelayTrackLanguage(track) });
    }
  };
}
