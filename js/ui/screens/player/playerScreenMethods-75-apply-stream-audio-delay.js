/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import { resolveStreamAudioDelayMs } from "../../../core/player/streamAudioDelay.js";
import { createStreamAudioDelayEngine } from "../../../core/player/streamAudioDelayEngine.js";

// Applies the stream source's audio delay to real playback (the counterpart of
// playerScreenMethods-74, which shifts subtitles). PriSynx-style addons build
// an HLS master that combines a video source with a separate dubbed audio
// source; the measured offset ships as behaviorHints.audioDelayMs scoped by
// behaviorHints.audioDelayLanguage. The engine cannot move the muxed audio
// inside the video element, so the scoped audio is played by a second, detached
// `<audio>` element on a deferred timeline while the video element keeps the
// picture (its audio is muted while the engine runs — otherwise the two
// timelines would overlap).
//
// Engagement is opportunistic: the dual element only runs when the effective
// delay for the selected track is non-zero AND a standalone audio URL is
// resolvable (hls.js audio rendition or a direct audio track URL). AVPlay
// playback and unresolvable sources fall through to plain playback — the
// delay degrades to nothing rather than breaking.

export function createPlayerScreenMethods75() {
  const { PlayerController, getUsableAudioTrackLanguageValue } = internals;

  return {
    // The audio track object currently selected, across the selection styles
    // the player uses (manifest id, embedded index, native index).
    getSelectedAudioDelayTrack() {
      if (this.selectedManifestAudioTrackId) {
        const track =
          (this.manifestAudioTracks || []).find((entry) => String(entry?.id || "") === String(this.selectedManifestAudioTrackId)) || null;
        if (track) return track;
      }
      if (Number(this.selectedEmbeddedAudioTrackIndex) >= 0) {
        const track = (this.embeddedAudioTracks || [])[Number(this.selectedEmbeddedAudioTrackIndex)] || null;
        if (track) return track;
      }
      if (Number(this.selectedAudioTrackIndex) >= 0) {
        const tracks = this.getAudioTracks?.() || [];
        return tracks[Number(this.selectedAudioTrackIndex)] || null;
      }
      return null;
    },
    getSelectedAudioDelayLanguage() {
      const track = this.getSelectedAudioDelayTrack();
      const usable = String(getUsableAudioTrackLanguageValue?.(track) || "").trim();
      return usable || String(track?.language || track?.lang || "").trim();
    },
    // Delay to apply to the dual-element audio for the selected track
    // (0 when the track is out of the hint's scope, e.g. the original audio).
    getEffectiveStreamAudioDelayMs() {
      const track = this.getSelectedAudioDelayTrack();
      return resolveStreamAudioDelayMs(this.getStreamAudioDelayHints(), this.getSelectedAudioDelayLanguage(), {
        hasSelectedAudio: Boolean(track)
      });
    },
    // A standalone URL for the scoped audio: the hls.js audio rendition behind
    // the selection (its media playlist) or any selected track carrying a URL.
    resolveStreamAudioDelayAudioSource() {
      const hls = this.hlsInstance || null;
      const hlsTracks = hls?.audioTracks ? Array.from(hls.audioTracks).filter(Boolean) : [];
      if (hlsTracks.length) {
        const selectedId = this.selectedManifestAudioTrackId;
        let track =
          (selectedId != null && hlsTracks.find((entry) => String(entry?.id ?? "") === String(selectedId))) ||
          hlsTracks[Number(hls?.audioTrack)] ||
          null;
        const url = String(track?.url || "").trim();
        if (url) {
          return { kind: "hls", url, track };
        }
      }
      const selected = this.getSelectedAudioDelayTrack();
      const url = String(selected?.url || "").trim();
      return url ? { kind: "file", url, track: selected } : null;
    },
    // Feeds the audio source into the detached element. Returns a dispose
    // callback, or null when the source cannot be loaded (the caller aborts).
    attachStreamAudioDelayAudioSource(audio, source) {
      if (!audio || !source?.url) {
        return null;
      }
      if (source.kind === "hls") {
        const HlsCtor = globalThis.Hls || null;
        if (typeof HlsCtor !== "function") {
          return null;
        }
        const instance = new HlsCtor();
        instance.loadSource(source.url);
        instance.attachMedia(audio);
        return () => {
          try {
            instance.destroy();
          } catch (_) {}
        };
      }
      audio.src = source.url;
      return () => {
        try {
          audio.removeAttribute("src");
          audio.load?.();
        } catch (_) {}
      };
    },
    // Engage/update/teardown the engine around the current selection and
    // stream hints. Called on track changes and when playback starts.
    syncStreamAudioDelayEngine() {
      const delayMs = this.getEffectiveStreamAudioDelayMs();
      const video = PlayerController?.video || null;
      const source = delayMs !== 0 ? this.resolveStreamAudioDelayAudioSource() : null;
      const state = this.streamAudioDelayEngineState || null;
      if (!delayMs || !source || !video) {
        if (state) this.teardownStreamAudioDelayEngine();
        return false;
      }
      if (state && state.sourceUrl === source.url && state.video === video) {
        state.engine.setDelayMs(delayMs);
        return true;
      }
      this.teardownStreamAudioDelayEngine();
      const audio = document.createElement("audio");
      audio.preload = "auto";
      const disposeSource = this.attachStreamAudioDelayAudioSource(audio, source);
      if (!disposeSource) {
        try {
          audio.removeAttribute("src");
        } catch (_) {}
        return false;
      }
      const engine = createStreamAudioDelayEngine({ video, audio, delayMs });
      engine.start();
      this.streamAudioDelayEngineState = {
        engine,
        audio,
        disposeSource,
        sourceUrl: source.url,
        video,
        previousVideoMuted: Boolean(video.muted)
      };
      // The video element must stay silent while the dual element plays the
      // scoped audio: its own audio track is the un-delayed one.
      video.muted = true;
      return true;
    },
    teardownStreamAudioDelayEngine() {
      const state = this.streamAudioDelayEngineState || null;
      if (!state) return false;
      this.streamAudioDelayEngineState = null;
      try {
        state.engine.destroy();
      } catch (_) {}
      try {
        state.disposeSource?.();
      } catch (_) {}
      try {
        state.audio.pause?.();
        state.audio.removeAttribute("src");
        state.audio.load?.();
      } catch (_) {}
      try {
        if (state.video) state.video.muted = state.previousVideoMuted;
      } catch (_) {}
      return true;
    },
    // Track changes re-resolve the scope; playback start engages the engine
    // once the video element has a timeline to follow.
    bindStreamAudioDelayEngineLifecycle() {
      const video = PlayerController?.video || null;
      if (!video || typeof video.addEventListener !== "function") return false;
      if (this.streamAudioDelayEngineLifecycleBound) return true;
      this.streamAudioDelayEngineLifecycleBound = true;
      const onPlaying = () => {
        this.syncStreamAudioDelayEngine();
      };
      video.addEventListener("playing", onPlaying);
      this.streamAudioDelayEngineLifecycleHandler = onPlaying;
      return true;
    }
  };
}
