/* eslint-disable no-unused-vars */
import * as internals from "./playerController.js";
import { selectVidaaTextTrack } from "../../platform/vidaa/vidaaVideo.js";
import {
  nativeTrackListToArray,
  nativeAudioTrackSelectionMatches,
  nativeTextTrackSelectionMatches,
  confirmNativeTrackSelection
} from "./playerControllerMethods-02-is-likely-direct-file-url.js";

export function createPlayerControllerMethods15() {
  const { Platform, isValidAvPlayPlaybackSpeedState, resolveWebOsSubtitleFontSizeLevel } = internals;

  return {
    async setPlaybackRate(speed = 1) {
      if (!this.video) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!Number.isFinite(targetSpeed)) {
        return false;
      }

      if (this.isUsingAvPlay()) {
        if (!this.isSupportedAvPlayPlaybackRate(targetSpeed)) {
          return false;
        }
        const state = this.getAvPlayState();
        if (isValidAvPlayPlaybackSpeedState(state) && !this.applyAvPlayPlaybackRate(targetSpeed)) {
          return false;
        }
        this.desiredPlaybackRate = targetSpeed;
        return true;
      }

      if (Platform.isWebOS()) {
        if (!this.isSupportedWebOsPlaybackRate(targetSpeed)) {
          return false;
        }
        if (!this.isUsingNativePlayback()) {
          // A non-native (MSE) pipeline is already at normal speed and has no
          // mediaId that Luna can address.
          if (targetSpeed === 1) {
            this.desiredPlaybackRate = 1;
            this.appliedWebOsPlaybackRate = 1;
            return true;
          }
          return false;
        }

        const requestToken = Number(this.webOsPlaybackRateRequestToken || 0) + 1;
        this.webOsPlaybackRateRequestToken = requestToken;
        const applied = await this.queueWebOsPlaybackRate(targetSpeed);
        if (!applied || requestToken !== this.webOsPlaybackRateRequestToken) {
          return false;
        }
        this.desiredPlaybackRate = targetSpeed;
        return true;
      }

      try {
        this.video.playbackRate = targetSpeed;
      } catch (_) {
        return false;
      }
      this.desiredPlaybackRate = targetSpeed;

      return true;
    },
    setNativeAudioTrack(index) {
      // Native flags confirm immediately or through a bounded promise. The
      // webOS native service retains its request/confirmation event contract.
      const requestToken = Number(this.nativeAudioTrackSelectionToken || 0) + 1;
      this.nativeAudioTrackSelectionToken = requestToken;
      if (!this.video) {
        return false;
      }
      const targetIndex = Number(index);
      const tracks = this.nativeAudioTrackListToArray();
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= tracks.length) {
        return false;
      }

      const applySelection = () => {
        tracks.forEach((track, trackIndex) => {
          const selected = trackIndex === targetIndex;
          try {
            if ("enabled" in track) {
              track.enabled = selected;
            }
          } catch (_) {
            // Best effort.
          }
          try {
            if ("selected" in track) {
              track.selected = selected;
            }
          } catch (_) {
            // Best effort.
          }
        });
      };

      if (Platform.isWebOS() && this.isUsingNativePlayback()) {
        return this.requestConfirmedWebOsAudioTrackSelection({
          targetTrackIndex: targetIndex,
          selectedTrackIndex: targetIndex,
          selectionKind: "native",
          applySelection
        });
      }

      this.selectedWebOsAudioTrackIndex = -1;
      this.webOsAudioSelectionExplicit = false;
      this.selectedWebOsEmbeddedAudioTrackIndex = -1;
      applySelection();
      const video = this.video;
      const playRequestToken = this.playRequestToken;
      return confirmNativeTrackSelection(
        () => nativeAudioTrackSelectionMatches(this.nativeAudioTrackListToArray(), targetIndex),
        () => this.video === video && this.playRequestToken === playRequestToken && this.nativeAudioTrackSelectionToken === requestToken
      );
    },
    setWebOsEmbeddedAudioTrack(trackIndex, selectedTrackIndex = trackIndex) {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback()) {
        return false;
      }

      const targetIndex = Number(trackIndex);
      const selectedIndex = Number(selectedTrackIndex);
      const storedSelectedIndex = Number.isFinite(selectedIndex) && selectedIndex >= 0 ? selectedIndex : targetIndex;
      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        this.selectedWebOsAudioTrackIndex = -1;
        this.webOsAudioSelectionExplicit = false;
        this.selectedWebOsEmbeddedAudioTrackIndex = -1;
        return false;
      }

      const applySelection = () => {
        const tracks = this.nativeAudioTrackListToArray();
        if (!tracks.length) {
          return;
        }

        tracks.forEach((track, trackListIndex) => {
          const selected = trackListIndex === targetIndex;
          try {
            if ("enabled" in track) {
              track.enabled = selected;
            }
          } catch (_) {
            // Best effort.
          }
          try {
            if ("selected" in track) {
              track.selected = selected;
            }
          } catch (_) {
            // Best effort.
          }
        });
      };

      return this.requestConfirmedWebOsAudioTrackSelection({
        targetTrackIndex: targetIndex,
        selectedTrackIndex: storedSelectedIndex,
        selectionKind: "embedded",
        applySelection
      });
    },
    setNativeTextTrack(index) {
      // A fulfilled result confirms DOM modes or the native service command;
      // stored webOS indices remain desired selections while a command is pending.
      const requestToken = Number(this.nativeTextTrackSelectionToken || 0) + 1;
      this.nativeTextTrackSelectionToken = requestToken;
      if (!this.video) {
        return false;
      }
      const targetIndex = Number(index);
      const textTrackList = this.video.textTracks || this.video.webkitTextTracks || this.video.mozTextTracks || null;
      const tracks = nativeTrackListToArray(textTrackList);
      if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= tracks.length) {
        return false;
      }

      const video = this.video;
      const playRequestToken = this.playRequestToken;
      const isCurrent = () =>
        this.video === video &&
        this.playRequestToken === playRequestToken &&
        this.nativeTextTrackSelectionToken === requestToken &&
        (!Platform.isWebOS() ||
          !this.isUsingNativePlayback() ||
          (this.selectedWebOsSubtitleTrackIndex === targetIndex && this.selectedWebOsEmbeddedSubtitleTrackIndex === -1));
      if (Platform.isVidaa()) {
        selectVidaaTextTrack(tracks, targetIndex);
        return confirmNativeTrackSelection(
          () =>
            nativeTextTrackSelectionMatches(
              nativeTrackListToArray(video.textTracks || video.webkitTextTracks || video.mozTextTracks),
              targetIndex
            ),
          isCurrent
        );
      }

      if (Platform.isWebOS() && this.isUsingNativePlayback()) {
        this.selectedWebOsSubtitleTrackIndex = targetIndex;
        this.webOsSubtitleSelectionExplicit = true;
      }
      this.selectedWebOsEmbeddedSubtitleTrackIndex = -1;

      const mediaId = this.syncNativeMediaId();
      let nativeCommand = null;
      if (mediaId && Platform.isWebOS()) {
        const succeeded = (result) => result?.returnValue !== false && !result?.errorCode;
        nativeCommand = this.requestWebOsMediaCommand("setSubtitleEnable", {
          mediaId,
          enable: targetIndex >= 0
        })
          .then(async (result) => {
            if (!succeeded(result) || !isCurrent() || mediaId !== this.nativeMediaId) return false;
            if (targetIndex < 0) return true;
            this.applyWebOsSubtitleFontSize(mediaId, { force: true });
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (!isCurrent() || mediaId !== this.nativeMediaId) return false;
            const selection = await this.requestWebOsMediaCommand("selectTrack", { type: "text", mediaId, index: targetIndex });
            return isCurrent() && mediaId === this.nativeMediaId && succeeded(selection);
          })
          .catch(() => false);
      }

      tracks.forEach((track, trackIndex) => {
        try {
          track.mode = targetIndex >= 0 && trackIndex === targetIndex ? "showing" : "disabled";
        } catch (_) {
          // Best effort.
        }
      });

      const confirmation = () =>
        confirmNativeTrackSelection(
          () =>
            nativeTextTrackSelectionMatches(
              nativeTrackListToArray(video.textTracks || video.webkitTextTracks || video.mozTextTracks),
              targetIndex
            ),
          isCurrent
        );
      return nativeCommand ? nativeCommand.then((applied) => applied || confirmation()) : confirmation();
    },
    applyWebOsSubtitleFontSize(mediaId, { force = false } = {}) {
      const normalizedMediaId = String(mediaId || "").trim();
      if (!Platform.isWebOS() || !normalizedMediaId) {
        return false;
      }

      const fontSize = Math.min(4, Math.max(0, Math.trunc(Number(this.webOsSubtitleFontSizeLevel) || 0)));
      const applyKey = `${normalizedMediaId}:${fontSize}`;
      if (!force && this.appliedWebOsSubtitleFontSizeKey === applyKey) {
        return true;
      }

      this.appliedWebOsSubtitleFontSizeKey = applyKey;
      this.requestWebOsMediaCommand("setSubtitleFontSize", {
        mediaId: normalizedMediaId,
        fontSize
      }).catch(() => {
        if (this.appliedWebOsSubtitleFontSizeKey === applyKey) {
          this.appliedWebOsSubtitleFontSizeKey = "";
        }
      });
      return true;
    },
    setWebOsSubtitleFontSize(value) {
      if (!Platform.isWebOS()) {
        return false;
      }

      this.webOsSubtitleFontSizeLevel = resolveWebOsSubtitleFontSizeLevel(value);
      const mediaId = this.syncNativeMediaId();
      if (mediaId) {
        return this.applyWebOsSubtitleFontSize(mediaId);
      }
      return true;
    },
    setWebOsEmbeddedSubtitleNativeVisibility(enabled, selectedTrackIndex = this.selectedWebOsEmbeddedSubtitleTrackIndex) {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback()) {
        return Promise.resolve(false);
      }
      const expectedSelectedIndex = Number(selectedTrackIndex);
      if (
        !Number.isFinite(expectedSelectedIndex) ||
        expectedSelectedIndex < 0 ||
        Number(this.selectedWebOsEmbeddedSubtitleTrackIndex) !== expectedSelectedIndex
      ) {
        return Promise.resolve(false);
      }

      const applyVisibility = (mediaId) => {
        if (!mediaId || Number(this.selectedWebOsEmbeddedSubtitleTrackIndex) !== expectedSelectedIndex) {
          return false;
        }
        return this.requestWebOsMediaCommand("setSubtitleEnable", {
          mediaId,
          enable: Boolean(enabled)
        })
          .then(() => {
            if (
              Boolean(enabled) &&
              mediaId === this.nativeMediaId &&
              Number(this.selectedWebOsEmbeddedSubtitleTrackIndex) === expectedSelectedIndex
            ) {
              this.applyWebOsSubtitleFontSize(mediaId, { force: true });
            }
            return true;
          })
          .catch(() => false);
      };

      const mediaId = this.syncNativeMediaId();
      if (mediaId) {
        return Promise.resolve(applyVisibility(mediaId));
      }

      return this.waitForNativeMediaId()
        .then(applyVisibility)
        .catch(() => false);
    }
  };
}
