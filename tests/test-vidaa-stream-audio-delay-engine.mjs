// Unit tests for the dual-element audio delay engine (streamAudioDelayEngine).
// Fake media elements keep the run deterministic: both delay signs, pre-roll,
// hard resync, soft rate-nudge, pause/seek following, clamping and teardown.
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeDelayedAudioTimeSec,
  createStreamAudioDelayEngine
} from "../js/core/player/streamAudioDelayEngine.js";

function createFakeMedia({ currentTime = 0, paused = true } = {}) {
  const listeners = new Map();
  const calls = { play: 0, pause: 0, seeks: [] };
  let time = currentTime;
  return {
    get currentTime() {
      return time;
    },
    set currentTime(value) {
      time = value;
      calls.seeks.push(value);
    },
    paused,
    ended: false,
    playbackRate: 1,
    muted: false,
    calls,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type) {
      for (const fn of [...(listeners.get(type) || [])]) fn();
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    play() {
      this.paused = false;
      calls.play += 1;
      return { catch() {} };
    },
    pause() {
      this.paused = true;
      calls.pause += 1;
    }
  };
}

const noTimers = { setIntervalFn: () => 1, clearIntervalFn: () => {} };

test("computeDelayedAudioTimeSec handles both delay signs", () => {
  // Positive delay → scoped audio plays LATER: earlier in the content.
  assert.equal(computeDelayedAudioTimeSec(10, 2500), 7.5);
  // Negative delay → scoped audio plays EARLIER: later in the content.
  assert.equal(computeDelayedAudioTimeSec(10, -2500), 12.5);
  assert.equal(computeDelayedAudioTimeSec(10, 0), 10);
  // Invalid video times degrade to 0 instead of NaN.
  assert.equal(computeDelayedAudioTimeSec(Number.NaN, 1000), -1);
});

test("positive delay plays the audio later (target = video - delay)", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 0 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 2500, ...noTimers });
  engine.start();
  // Far-from-sync start: hard resync seeks the audio to 7.5.
  assert.deepEqual(audio.calls.seeks, [7.5]);
  assert.equal(audio.playbackRate, 1);
  assert.equal(audio.paused, false);
  engine.destroy();
});

test("negative delay plays the audio earlier (target = video + |delay|)", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 0 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: -2500, ...noTimers });
  engine.start();
  assert.deepEqual(audio.calls.seeks, [12.5]);
  assert.equal(audio.paused, false);
  engine.destroy();
});

test("pre-roll keeps the audio paused at 0 until the scoped content starts", () => {
  const video = createFakeMedia({ currentTime: 2, paused: false });
  const audio = createFakeMedia({ currentTime: 1.2 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 3000, ...noTimers });
  engine.start();
  // target = 2 - 3 = -1 → nothing to play yet.
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
  // Once the video passes the delay, playback engages.
  video.currentTime = 4;
  engine.tick();
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 1);
  engine.destroy();
});

test("soft drift nudges the playback rate toward the target, in both directions", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 7.4 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 2500, ...noTimers });
  engine.start();
  // target 7.5, drift 0.1 s (soft zone) → catch up at 1 + nudge.
  assert.equal(audio.playbackRate, 1.02);
  assert.deepEqual(audio.calls.seeks, []);

  audio.currentTime = 7.6;
  engine.tick();
  // drift -0.1 s → slow down.
  assert.equal(audio.playbackRate, 0.98);

  audio.currentTime = 7.5;
  engine.tick();
  // In sync → plain rate.
  assert.equal(audio.playbackRate, 1);
  engine.destroy();
});

test("video pause/seek events resync the audio element immediately", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 7.5 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 2500, ...noTimers });
  engine.start();

  video.dispatch("pause");
  assert.equal(audio.paused, true);
  assert.equal(audio.playbackRate, 1);

  video.paused = false;
  video.currentTime = 30;
  video.dispatch("seeking");
  // The seek forces a hard resync to the new timeline position.
  assert.equal(audio.currentTime, 27.5);
  assert.equal(audio.paused, false);

  engine.destroy();
});

test("setDelayMs clamps to the contract range and re-resolves at runtime", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 7.5 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 2500, ...noTimers });
  engine.start();

  // Clamping: the contract range is ±60 s.
  assert.equal(engine.setDelayMs(120000), 60000);
  assert.equal(engine.getDelayMs(), 60000);
  // 60 s of delay at video 10 s means pre-roll: nothing to play yet.
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);

  // Re-resolution: a new delay seeks the audio to the new target.
  engine.setDelayMs(3500);
  assert.equal(audio.currentTime, 6.5);
  assert.equal(audio.paused, false);

  assert.equal(engine.setDelayMs(-120000), -60000);
  assert.equal(audio.currentTime, 70);

  assert.equal(engine.setDelayMs(Number.NaN), 0);
  assert.equal(audio.currentTime, 10);
  engine.destroy();
});

test("destroy detaches every listener and freezes the audio element", () => {
  const video = createFakeMedia({ currentTime: 10, paused: false });
  const audio = createFakeMedia({ currentTime: 7.5 });
  const engine = createStreamAudioDelayEngine({ video, audio, delayMs: 2500, ...noTimers });
  engine.start();
  assert.equal(video.listenerCount("playing"), 1);

  engine.destroy();
  assert.equal(engine.isRunning(), false);
  assert.equal(video.listenerCount("playing"), 0);
  assert.equal(audio.paused, true);
  assert.equal(audio.playbackRate, 1);

  // Post-destroy events must not move anything.
  video.currentTime = 50;
  video.dispatch("playing");
  video.dispatch("seeking");
  assert.equal(audio.currentTime, 0);
});
