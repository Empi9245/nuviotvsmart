// Dual-element audio delay engine — applies the stream source's audio delay
// (the `streamAudioDelay.js` contract) to real playback. The video element
// keeps the video; a second `<audio>` element plays the scoped audio track in
// lockstep with a deferred timeline. Positive delay → scoped audio plays LATER
// (mpv/ExoPlayer convention, same as the contract's keys).
//
// The engine is pure element orchestration: no hls.js, no networking. The
// wiring layer (playerScreenMethods-75) resolves the scoped audio source and
// feeds it to the detached `<audio>` element; this module only keeps the two
// clocks in sync:
//
//   target = video.currentTime - delayMs/1000
//
//   - target < 0        → pre-roll: audio stays paused at 0 (the scoped
//                         content has not started yet).
//   - |drift| > hard    → hard resync: seek the audio element to target.
//   - soft < |drift| ≤ hard → rate-nudge the audio element toward target
//                         (±RATE_NUDGE, clamped to a sane range).
//   - else              → playbackRate 1, plain playback.
//
// Media events (`play`, `pause`, `seeking`, `seeked` on the video) force an
// immediate resync, so the loop interval only absorbs clock drift, never a
// user seek. `setDelayMs` re-resolves at runtime (track switch) without
// restarting playback.

import { clampStreamAudioDelayMs } from "./streamAudioDelay.js";

export const STREAM_AUDIO_DELAY_SYNC_INTERVAL_MS = 500;
export const STREAM_AUDIO_DELAY_SOFT_DRIFT_SEC = 0.075;
export const STREAM_AUDIO_DELAY_HARD_DRIFT_SEC = 0.5;
export const STREAM_AUDIO_DELAY_RATE_NUDGE = 0.02;

// Content time of the scoped audio for a video time at the given delay.
// Positive delay → earlier in the content (audio plays later).
export function computeDelayedAudioTimeSec(videoTimeSec, delayMs) {
  const videoTime = Number(videoTimeSec);
  const safeVideoTime = Number.isFinite(videoTime) && videoTime >= 0 ? videoTime : 0;
  return safeVideoTime - clampStreamAudioDelayMs(delayMs) / 1000;
}

export function createStreamAudioDelayEngine({
  video,
  audio,
  delayMs = 0,
  syncIntervalMs = STREAM_AUDIO_DELAY_SYNC_INTERVAL_MS,
  softDriftSec = STREAM_AUDIO_DELAY_SOFT_DRIFT_SEC,
  hardDriftSec = STREAM_AUDIO_DELAY_HARD_DRIFT_SEC,
  rateNudge = STREAM_AUDIO_DELAY_RATE_NUDGE,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  if (!video || typeof video.addEventListener !== "function") {
    throw new Error("streamAudioDelayEngine: video element required");
  }
  if (!audio || typeof audio.addEventListener !== "function") {
    throw new Error("streamAudioDelayEngine: audio element required");
  }

  let currentDelayMs = clampStreamAudioDelayMs(delayMs);
  let running = false;
  let destroyed = false;
  let intervalId = null;

  const clampRate = (rate) => Math.min(1.2, Math.max(0.8, rate));

  const stopAudio = () => {
    try {
      audio.pause?.();
    } catch (_) {}
    try {
      audio.currentTime = 0;
    } catch (_) {}
    try {
      audio.playbackRate = 1;
    } catch (_) {}
  };

  const syncAudioClock = () => {
    if (destroyed || !running) {
      return;
    }
    if (video.paused || video.ended) {
      try {
        audio.pause?.();
      } catch (_) {}
      try {
        audio.playbackRate = 1;
      } catch (_) {}
      return;
    }
    const target = computeDelayedAudioTimeSec(video.currentTime, currentDelayMs);
    if (target <= 0) {
      // Pre-roll: the scoped content has not started yet.
      try {
        audio.pause?.();
      } catch (_) {}
      try {
        audio.currentTime = 0;
      } catch (_) {}
      try {
        audio.playbackRate = 1;
      } catch (_) {}
      return;
    }
    let driftSec = target - Number(audio.currentTime || 0);
    if (!Number.isFinite(driftSec)) {
      driftSec = target;
    }
    if (Math.abs(driftSec) > hardDriftSec) {
      try {
        audio.currentTime = target;
      } catch (_) {}
      try {
        audio.playbackRate = 1;
      } catch (_) {}
    } else if (driftSec > softDriftSec) {
      // Audio is behind the target: speed it up until it catches up.
      try {
        audio.playbackRate = clampRate(1 + rateNudge);
      } catch (_) {}
    } else if (driftSec < -softDriftSec) {
      // Audio is ahead of the target: slow it down.
      try {
        audio.playbackRate = clampRate(1 - rateNudge);
      } catch (_) {}
    } else {
      try {
        audio.playbackRate = 1;
      } catch (_) {}
    }
    if (audio.paused) {
      try {
        const playPromise = audio.play?.();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      } catch (_) {}
    }
  };

  const onVideoSeeking = () => {
    // Follow the video instantly: silence the audio while the video seek
    // settles, then hard resync.
    try {
      audio.pause?.();
    } catch (_) {}
    syncAudioClock();
  };
  const onVideoPlay = () => syncAudioClock();
  const onVideoPause = () => {
    try {
      audio.pause?.();
    } catch (_) {}
    try {
      audio.playbackRate = 1;
    } catch (_) {}
  };

  const attach = () => {
    video.addEventListener("playing", onVideoPlay);
    video.addEventListener("play", onVideoPlay);
    video.addEventListener("pause", onVideoPause);
    video.addEventListener("seeking", onVideoSeeking);
    video.addEventListener("seeked", onVideoSeeking);
  };
  const detach = () => {
    video.removeEventListener("playing", onVideoPlay);
    video.removeEventListener("play", onVideoPlay);
    video.removeEventListener("pause", onVideoPause);
    video.removeEventListener("seeking", onVideoSeeking);
    video.removeEventListener("seeked", onVideoSeeking);
  };

  return {
    start() {
      if (destroyed || running) {
        return;
      }
      running = true;
      attach();
      syncAudioClock();
      intervalId = setIntervalFn(() => syncAudioClock(), syncIntervalMs);
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      detach();
      if (intervalId !== null) {
        clearIntervalFn(intervalId);
        intervalId = null;
      }
      stopAudio();
    },
    destroy() {
      if (destroyed) {
        return;
      }
      this.stop();
      destroyed = true;
    },
    setDelayMs(value) {
      currentDelayMs = clampStreamAudioDelayMs(value);
      syncAudioClock();
      return currentDelayMs;
    },
    getDelayMs() {
      return currentDelayMs;
    },
    isRunning() {
      return running;
    },
    // Exposed for deterministic tests and diagnostics: one sync step.
    tick() {
      syncAudioClock();
    }
  };
}
