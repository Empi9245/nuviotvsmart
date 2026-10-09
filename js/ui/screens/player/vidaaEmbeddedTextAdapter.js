import { localMediaEmbeddedSubtitleRepository } from "../../../data/repository/localMediaEmbeddedSubtitleRepository.js";
import { PlayerController } from "../../../core/player/playerController.js";

export function getVidaaEmbeddedTextNotice(code) {
  if (
    code === "SUBTITLE_INDEX_UNAVAILABLE" ||
    code === "TRACKS_NOT_FOUND" ||
    code === "CUES_NOT_FOUND"
  ) {
    return "No readable embedded text subtitles were found in this stream.";
  }
  if (/BUDGET|LIMIT|TOO_LARGE/.test(code))
    return "Embedded subtitle loading reached its safety limit. Try another stream.";
  if (code === "RANGE_TIMEOUT") return "Embedded subtitles could not be loaded. Try again.";
  return "This stream does not allow access to its embedded subtitles.";
}

// Extraction identities never reach a native selector. Rendering is shared.
export async function applyVidaaEmbeddedTextSubtitleTrack(track, index) {
  const token = this.subtitleSelectionToken;
  const mount = this.playerMountToken;
  const playbackUrl = this.activePlaybackUrl;
  const video = PlayerController.video;
  const playbackToken = PlayerController.playRequestToken;
  const isCurrent = () =>
    this.subtitleSelectionToken === token &&
    this.playerMountToken === mount &&
    this.activePlaybackUrl === playbackUrl &&
    PlayerController.video === video &&
    PlayerController.playRequestToken === playbackToken;
  const previousSelectionKey = this.getActiveSubtitleSelectionKey();
  const previous = {
    track: this.webOsEmbeddedTextSubtitleTrack,
    start: this.webOsEmbeddedTextSubtitleWindowStart,
    end: this.webOsEmbeddedTextSubtitleWindowEnd,
    unavailable: this.webOsEmbeddedTextSubtitleFallbackUnavailable
  };
  localMediaEmbeddedSubtitleRepository.cancelVidaaWindow();
  this.webOsEmbeddedTextSubtitleLoadToken =
    Number(this.webOsEmbeddedTextSubtitleLoadToken || 0) + 1;
  this.webOsEmbeddedTextSubtitleLoading = false;
  this.webOsEmbeddedTextSubtitleFallbackUnavailable = false;
  this.webOsEmbeddedTextSubtitleTrack = track;
  this.vidaaEmbeddedTextPendingIndex = index;
  const applied = await this.loadWebOsEmbeddedTextSubtitleWindow(
    Math.max(0, this.getPlaybackCurrentSeconds() - Number(this.subtitleDelayMs || 0) / 1000)
  );
  if (!isCurrent()) {
    if (
      this.subtitleSelectionToken === token &&
      this.playerMountToken === mount &&
      this.activePlaybackUrl === playbackUrl &&
      this.webOsEmbeddedTextSubtitleTrack === track
    ) {
      this.webOsEmbeddedTextSubtitleTrack = previous.track;
      this.webOsEmbeddedTextSubtitleWindowStart = previous.start;
      this.webOsEmbeddedTextSubtitleWindowEnd = previous.end;
      this.webOsEmbeddedTextSubtitleFallbackUnavailable = previous.unavailable;
      this.vidaaEmbeddedTextPendingIndex = null;
    }
    return false;
  }
  this.vidaaEmbeddedTextPendingIndex = null;
  if (!applied) {
    this.webOsEmbeddedTextSubtitleTrack = previous.track;
    this.webOsEmbeddedTextSubtitleWindowStart = previous.start;
    this.webOsEmbeddedTextSubtitleWindowEnd = previous.end;
    this.webOsEmbeddedTextSubtitleFallbackUnavailable = previous.unavailable;
    this.invalidateTrackDialogCaches();
    this.renderSubtitleDialog();
    return false;
  }
  this.selectedEmbeddedSubtitleTrackIndex = index;
  this.selectedSubtitleTrackIndex = -1;
  this.selectedAddonSubtitleId = null;
  this.selectedManifestSubtitleTrackId = null;
  this.resetSubtitleDelayAfterSelectionChange(previousSelectionKey);
  this.invalidateTrackDialogCaches();
  this.applySubtitlePresentationSettings();
  this.renderControlButtons();
  this.renderSubtitleDialog();
  return true;
}
