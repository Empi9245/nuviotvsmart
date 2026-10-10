import assert from "node:assert/strict";

// Exercise the real player methods. No media, decoder, network or TV claims.
const storage = new Map();
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key),
  removeItem: (key) => storage.delete(key)
};
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: "visible",
  getElementById: () => null
});
globalThis.window = new EventTarget();
globalThis.fetch = async () => {
  throw new Error("Unexpected network request");
};

const { PlayerController } = await import("../js/core/player/playerController.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { Platform } = await import("../js/platform/index.js");
const { PlayerSettingsStore } = await import("../js/data/local/playerSettingsStore.js");
const originalController = { ...PlayerController };
PlayerSettingsStore.get = () => ({
  preferredAudioLanguage: "it",
  secondaryPreferredAudioLanguage: "none",
  subtitlesEnabled: false
});
let now = 100000;
let timerId = 0;
const timers = new Map();
Date.now = () => now;
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++timerId;
  timers.set(id, { callback, time: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
async function drain() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function advance(ms) {
  const until = now + ms;
  let iterations = 0;
  await drain();
  while (true) {
    const due = [...timers]
      .filter(([, timer]) => timer.time <= until)
      .sort((a, b) => a[1].time - b[1].time)[0];
    if (!due) break;
    assert.ok(++iterations < 1000, "No permanent polling");
    const [id, timer] = due;
    timers.delete(id);
    now = timer.time;
    timer.callback();
    await drain();
  }
  now = until;
  await drain();
}
const emit = (target, name) => target.dispatchEvent(new Event(name));
function list(initial = [], itemOnly = false) {
  let items = initial;
  return Object.assign(
    new EventTarget(),
    {
      get length() {
        return items.length;
      },
      item: (index) => items[index],
      replace(next) {
        items = next;
      }
    },
    itemOnly
      ? {}
      : {
          [Symbol.iterator]: function* () {
            yield* items;
          }
        }
  );
}
function fixture(
  audio = [
    { id: "en", language: "en", enabled: true },
    { id: "it", language: "it", enabled: false }
  ],
  text = []
) {
  const video = Object.assign(new EventTarget(), {
    audioTracks: list(audio, true),
    textTracks: list(text, true),
    currentTime: 2,
    readyState: 3,
    paused: false,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    }
  });
  Object.assign(PlayerController, originalController, {
    video,
    playbackEngine: "native-file",
    playRequestToken: 1,
    avplayActive: false,
    hlsInstance: null,
    dashInstance: null,
    avplayTrackInfo: [],
    nativeMediaId: ""
  });
  globalThis.__NUVIO_PLATFORM__ = "vidaa";
  Platform.current = null;
  const ui = {
    ...PlayerScreen,
    playerMountToken: 1,
    playerRouteActive: true,
    container: { style: {}, querySelector: () => null },
    videoListeners: [],
    uiRefs: {},
    activePlaybackUrl: "https://secret.invalid/video?token=private",
    subtitles: [],
    externalTrackNodes: [],
    subtitleCueStyleBindings: new Map(),
    embeddedSubtitleTracks: [],
    embeddedAudioTracks: [],
    manifestAudioTracks: [],
    manifestSubtitleTracks: [],
    htmlSubtitleCues: [],
    subtitleStyleSettings: {},
    subtitleDelayMs: 0,
    subtitleSelectionToken: 0,
    audioSelectionToken: 0,
    selectedEmbeddedSubtitleTrackIndex: -1,
    selectedEmbeddedAudioTrackIndex: -1,
    selectedAudioTrackIndex: 0,
    selectedSubtitleTrackIndex: -1,
    startupTrackPreferenceReady: false,
    startupAudioPreferenceApplied: false,
    startupAudioGateActive: false,
    trackDiscoveryInProgress: false,
    hasPresentedPlaybackFrame: false,
    shouldUseEmbeddedSubtitleTracks: () => false,
    canDiscoverEmbeddedAudioTracks: () => false,
    canDiscoverEmbeddedSubtitleTracks: () => false,
    ensureSupportedAudioTrackSelected() {},
    isStartupErrorVisible: () => false,
    isExternalFrameMode: () => false,
    getAudioEntries() {
      return this.getAudioTracks().map((track, audioTrackIndex) => ({
        id: track.id,
        label: track.label || track.language,
        track,
        audioTrackIndex,
        selected: Boolean(track.enabled),
        supported: true
      }));
    },
    rememberAudioTrackSelection(preference) {
      this.rememberedAudioTrackPreference = preference;
    },
    applyStartupSubtitlePreference() {},
    refreshSubtitleCueStyles() {},
    renderControlButtons() {},
    renderSubtitleDialog() {},
    renderAudioDialog() {},
    applyAspectMode() {},
    updateUiTick() {},
    markPlaybackProgress() {},
    applyAudioAmplification() {},
    applySubtitlePresentationSettings() {},
    attemptPendingPlaybackRestore() {},
    ensureTrackDataWarmup() {},
    updateMediaSessionPositionState() {},
    startTrackDiscoveryWindow() {},
    scheduleLoadingCompletionCheck() {},
    schedulePauseOverlay() {},
    beginPlaybackEngineValidation() {},
    clearBufferingSpinnerTimer() {},
    dismissPauseOverlay() {},
    updateMediaSessionPlaybackState() {},
    setLoadingLogoFillTarget() {},
    markPlaybackPresentedAfterAdvance() {},
    updateLoadingVisibility() {},
    resetControlsAutoHide() {},
    maybeShowParentalGuideOverlay() {},
    attemptSilentAudioRecovery() {},
    completeSeekLoadingIfReady() {},
    renderWebOsEmbeddedTextSubtitleAtCurrentTime() {},
    renderBitmapSubtitleAtCurrentTime() {},
    clearPlaybackStallGuard() {},
    armSourceFallbackDeadline() {},
    setControlsVisible() {},
    resetPlaybackEngineValidation() {},
    startPlayerControllerPlayback() {
      PlayerController.playRequestToken++;
      return Promise.resolve();
    }
  };
  return { ui, video, audio, text };
}
function arm(ui, video, sample = "multi-audio") {
  storage.set("nuvio.vidaaTrackExperiment", sample);
  ui.installVidaaTrackExperiment(video);
  return globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__;
}
const data = () => JSON.parse(globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__.export());
const tests = [];
const test = (name, run) => tests.push({ name, run });

test("disabled and non-VIDAA paths add no timers or wrappers", () => {
  const { ui, video } = fixture();
  const original = ui.applyAudioTrack;
  ui.installVidaaTrackExperiment(video);
  assert.equal(ui.applyAudioTrack, original);
  assert.equal(timers.size, 0);
  storage.set("nuvio.vidaaTrackExperiment", "multi-audio");
  globalThis.__NUVIO_PLATFORM__ = "tizen";
  Platform.current = null;
  ui.installVidaaTrackExperiment(video);
  assert.equal(ui.applyAudioTrack, original);
  assert.equal(timers.size, 0);
});
test("one shot, six scheduled snapshots, finite deadline and transparent promise", async () => {
  const { ui, video } = fixture();
  const original = ui.applyAudioTrack;
  const promise = Promise.resolve("https://secret.invalid/result");
  ui.startPlayerControllerPlayback = () => promise;
  const api = arm(ui, video);
  assert.equal(storage.size, 0);
  assert.equal(
    ui.startPlayerControllerPlayback("https://secret.invalid", {
      headers: { Authorization: "secret" }
    }),
    promise
  );
  await advance(12000);
  assert.deepEqual(
    data()
      .records.filter((r) => r.reason === "snapshot")
      .map((r) => [r.scheduledMs, r.elapsedMs]),
    [0, 250, 1000, 3000, 6000, 12000].map((ms) => [ms, ms])
  );
  await advance(168000);
  assert.equal(data().stopReason, "deadline");
  assert.equal(ui.applyAudioTrack, original);
  assert.equal(timers.size, 0);
  assert.equal(api.snapshot(), false);
});
test("no playback request expires, invalid arming is consumed", async () => {
  const { ui, video } = fixture();
  arm(ui, video, "https://secret.invalid");
  assert.equal(timers.size, 0);
  const api = arm(ui, video);
  await advance(30000);
  assert.equal(data().stopReason, "no-playback-request");
  assert.equal(api.snapshot(), false);
});
test("late and reordered item-only lists retain identity; replacement list events are observed", async () => {
  const { ui, video, audio } = fixture();
  video.audioTracks.replace([audio[0]]);
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  video.audioTracks.replace(audio);
  emit(video.audioTracks, "addtrack");
  const before = data().records.at(-1);
  video.audioTracks.replace([audio[1], audio[0]]);
  emit(video.audioTracks, "change");
  const after = data().records.at(-1);
  assert.equal(before.audio[1].object, after.audio[0].object);
  assert.equal(before.audio[1].sourceId, after.audio[0].sourceId);
  assert.equal(after.audio[0].enabled, false, "Collector must not select a reordered track");
  video.audioTracks = list(audio, true);
  emit(video, "loadedmetadata");
  emit(video.audioTracks, "change");
  assert.equal(data().records.at(-1).reason, "audio-list:change");
  assert.notEqual(data().records.at(-1).audioList, after.audioList);
  api.stop();
  await drain();
});
test("real binding/lifecycle records metadata, canplay, playing, seeked, pause and suspension", async () => {
  const { ui, video } = fixture();
  storage.set("nuvio.vidaaTrackExperiment", "multi-audio");
  ui.bindVideoEvents();
  ui.startPlayerControllerPlayback();
  for (const name of ["loadedmetadata", "canplay", "playing", "seeked", "pause"]) emit(video, name);
  document.visibilityState = "hidden";
  emit(document, "visibilitychange");
  document.visibilityState = "visible";
  emit(window, "pageshow");
  const reasons = data().records.map((r) => r.reason);
  for (const name of [
    "loadedmetadata",
    "canplay",
    "playing",
    "seeked",
    "pause",
    "visibilitychange",
    "pageshow"
  ])
    assert.ok(reasons.includes(`event:${name}`));
  assert.ok(
    reasons.includes("call:refreshTrackDialogs"),
    "Use the real lifecycle and refresh methods"
  );
  ui.unbindVideoEvents();
  const count = data().records.length;
  emit(video, "seeked");
  assert.equal(data().records.length, count);
  assert.equal(data().stopReason, "unbind");
  await advance(1000);
});
test("repeated bind retires the previous capture without duplicate listeners", () => {
  const { ui, video } = fixture();
  storage.set("nuvio.vidaaTrackExperiment", "multi-audio");
  ui.bindVideoEvents();
  const previous = globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__;
  storage.set("nuvio.vidaaTrackExperiment", "multi-audio");
  ui.bindVideoEvents();
  const current = globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__;
  assert.equal(JSON.parse(previous.export()).stopReason, "unbind");
  ui.startPlayerControllerPlayback();
  emit(video.audioTracks, "change");
  assert.equal(data().records.filter((r) => r.reason === "audio-list:change").length, 1);
  current.stop();
  ui.unbindVideoEvents();
});
test("hls.js lists and selected indices use the existing engine getters", () => {
  const { ui, video } = fixture();
  PlayerController.playbackEngine = "hls.js";
  PlayerController.hlsInstance = {
    audioTrack: 1,
    subtitleTrack: 0,
    audioTracks: [
      { id: "en", lang: "en", default: true },
      { id: "it", lang: "it" }
    ],
    subtitleTracks: [{ id: "s", lang: "it" }]
  };
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  emit(video, "hlstrackschanged");
  const last = data().records.at(-1);
  assert.equal(last.backend, "hls.js");
  assert.equal(last.engineAudio.length, 2);
  assert.equal(last.engineText.length, 1);
  assert.equal(last.engineAudioIndex, 1);
  assert.equal(last.engineTextIndex, 0);
  api.stop();
});
test("real preference selects Italian; selection-generated change is correlated; correct state avoids writes", async () => {
  const { ui, video, audio } = fixture();
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  let writes = 0;
  PlayerController.setNativeAudioTrack = function (index) {
    writes++;
    audio.forEach((track, i) => {
      track.enabled = i === index;
    });
    emit(video.audioTracks, "change");
    return true;
  };
  // Re-arm to wrap the controlled backend adapter; preference/refresh stay real.
  api.stop();
  arm(ui, video);
  ui.startPlayerControllerPlayback();
  ui.startupTrackPreferenceReady = true;
  ui.refreshTrackDialogs();
  await drain();
  ui.refreshTrackDialogs();
  assert.equal(audio[1].enabled, true);
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(writes, 1);
  const change = data().records.find((r) => r.reason === "audio-list:change");
  assert.ok(change.activeRequest);
  assert.ok(
    data().records.some(
      (r) => r.reason === "call:setNativeAudioTrack" && r.request === change.activeRequest
    )
  );
  globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__.stop();
});
test("real remembered manual choice prevails on refresh and reordered lists", async () => {
  const { ui, video, audio } = fixture();
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  assert.equal(await ui.applyAudioTrack(0, { rememberSelection: true }), true);
  video.audioTracks.replace([audio[1], audio[0]]);
  ui.startupTrackPreferenceReady = true;
  ui.refreshTrackDialogs();
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(audio[0].enabled, true);
  assert.equal(data().records.filter((r) => r.reason === "call:setNativeAudioTrack").length, 1);
  assert.equal(data().records.at(-1).rememberedAudio.language, "en");
  api.stop();
});
test("VIDAA gate waits for late preferred audio within the existing six-second budget", async () => {
  const { ui, video, audio } = fixture();
  video.audioTracks.replace([audio[0]]);
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  ui.enableStartupAudioGate({ allowNativePlayback: true, maxWaitMs: 6000 });
  ui.hasPresentedPlaybackFrame = true;
  ui.trackDiscoveryInProgress = true;
  assert.equal(
    ui.isStartupGateReleaseReady(),
    false,
    "The default track must not settle discovery before the preferred language arrives"
  );
  ui.startupTrackPreferenceReady = true;
  ui.startTrackDiscoveryWindow = PlayerScreen.startTrackDiscoveryWindow;
  ui.startTrackDiscoveryWindow({ durationMs: 7000, intervalMs: 250 });
  await advance(1000);
  assert.equal(ui.trackDiscoveryInProgress, true, "One default track must not finish discovery");
  video.audioTracks.replace(audio);
  emit(video.audioTracks, "addtrack");
  await advance(250);
  assert.equal(audio[1].enabled, true);
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(ui.isStartupGateReleaseReady(), true);
  ui.releaseStartupAudioGate();
  assert.equal(ui.startupAudioPreferenceRetryTimer, null);
  assert.equal(data().records.at(-1).gate.active, false);
  api.stop();
});
test("missing language keeps the real bounded fallback and startup without tracks", () => {
  const { ui, video } = fixture([{ id: "en", language: "en", enabled: true }]);
  const api = arm(ui, video, "missing-language");
  ui.startPlayerControllerPlayback();
  ui.enableStartupAudioGate({ maxWaitMs: 6000 });
  now += 6000;
  assert.equal(ui.isStartupGateReleaseReady(), true);
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(ui.startupAudioFallbackApplied, true);
  video.audioTracks.replace([]);
  ui.startupAudioPreferenceApplied = false;
  assert.equal(ui.applyStartupAudioFallback(), true);
  assert.equal(ui.isStartupGateReleaseReady(), true);
  api.stop();
});
test("async startup and its change event issue one request and resolve reordered identity", async () => {
  const delayedFlag = (initial) => {
    let enabled = initial;
    return {
      get enabled() {
        return enabled;
      },
      set enabled(value) {
        setTimeout(() => {
          enabled = value;
          emit(video.audioTracks, "change");
        }, 180);
      }
    };
  };
  const en = Object.assign(delayedFlag(true), { id: "en", language: "en" });
  const it = Object.assign(delayedFlag(false), { id: "it", language: "it" });
  const { ui, video } = fixture([en, it]);
  let requests = 0;
  const select = PlayerController.setNativeAudioTrack;
  PlayerController.setNativeAudioTrack = function (index) {
    requests++;
    return select.call(this, index);
  };
  ui.getAudioEntries = PlayerScreen.getAudioEntries;
  ui.invalidateTrackDialogCaches();
  ui.bindVideoEvents();
  ui.enableStartupAudioGate();
  ui.startupTrackPreferenceReady = true;
  ui.refreshTrackDialogs();
  assert.equal(ui.startupAudioPreferenceApplying, true);
  video.audioTracks.replace([it, en]);
  emit(video.audioTracks, "change");
  assert.equal(requests, 1);
  await advance(1400);
  assert.equal(requests, 1, "Selection-generated change must not duplicate the async request");
  assert.equal(ui.startupAudioPreferenceApplying, false);
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(it.enabled, true);
  assert.equal(
    ui.selectedAudioTrackIndex,
    0,
    "Resolve Italian after list reorder, not its former index"
  );
  ui.releaseStartupAudioGate();
  ui.unbindVideoEvents();
});
test("correct preferred audio across lifecycle events does not write again", async () => {
  const { ui, video } = fixture([{ id: "it", language: "it", enabled: true }]);
  let requests = 0;
  PlayerController.setNativeAudioTrack = () => {
    requests++;
    return true;
  };
  ui.bindVideoEvents();
  ui.enableStartupAudioGate();
  emit(video, "loadedmetadata");
  emit(video, "canplay");
  emit(video, "playing");
  await drain();
  assert.equal(ui.startupAudioPreferenceApplied, true);
  assert.equal(requests, 0);
  ui.releaseStartupAudioGate();
  ui.unbindVideoEvents();
});
test("reordered native audio confirms its identity without writing correct flags again", async () => {
  let writes = 0;
  const delayedTrack = (id, enabled) => ({
    id,
    language: id,
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      writes++;
      setTimeout(() => {
        enabled = value;
        emit(video.audioTracks, "change");
      }, 180);
    }
  });
  const en = delayedTrack("en", true);
  const it = delayedTrack("it", false);
  const { ui, video } = fixture([en, it]);
  ui.getAudioEntries = PlayerScreen.getAudioEntries;
  ui.invalidateTrackDialogCaches();
  const result = ui.applyAudioTrack(1, { rememberSelection: true });
  video.audioTracks.replace([it, en]);
  await advance(1400);
  assert.equal(await result, true);
  assert.equal(writes, 2, "Confirmed flags must not be written a second time after reorder");
  assert.equal(it.enabled, true);
  assert.equal(en.enabled, false);
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.equal(ui.rememberedAudioTrackPreference.language, "it");
});
test("replacement native list resolves the selected identity before fallback writes", async () => {
  const { ui, video } = fixture();
  ui.getAudioEntries = PlayerScreen.getAudioEntries;
  ui.invalidateTrackDialogCaches();
  let resolve;
  PlayerController.setNativeAudioTrack = () =>
    new Promise((r) => {
      resolve = r;
    });
  let writes = 0;
  const replacement = (id, enabled) => ({
    id,
    language: id,
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      writes++;
      enabled = value;
    }
  });
  const result = ui.applyAudioTrack(1);
  video.audioTracks.replace([replacement("it", true), replacement("en", false)]);
  resolve(false); // The original index no longer describes the Italian track.
  await advance(1400);
  assert.equal(await result, true);
  assert.equal(writes, 0);
  assert.equal(ui.selectedAudioTrackIndex, 0);
});
test("native fallback uses the replacement identity and leaves an absent identity untouched", async () => {
  for (const targetPresent of [true, false]) {
    const { ui, video, audio } = fixture();
    ui.getAudioEntries = PlayerScreen.getAudioEntries;
    ui.invalidateTrackDialogCaches();
    let resolve;
    PlayerController.setNativeAudioTrack = () =>
      new Promise((r) => {
        resolve = r;
      });
    const it = { id: "it", language: "it", enabled: false };
    const en = { id: "en", language: "en", enabled: true };
    const result = ui.applyAudioTrack(1);
    video.audioTracks.replace(targetPresent ? [it, en] : [en]);
    resolve(false);
    await advance(1400);
    assert.equal(await result, targetPresent);
    assert.equal(it.enabled, targetPresent);
    assert.equal(en.enabled, !targetPresent);
    assert.equal(audio[1].enabled, false, "A detached track must not receive fallback writes");
    assert.equal(ui.selectedAudioTrackIndex, 0);
  }
});
test("a list retired between confirmation and completion cannot commit a stale selection", async () => {
  const { ui, video } = fixture();
  ui.getAudioEntries = PlayerScreen.getAudioEntries;
  ui.invalidateTrackDialogCaches();
  const result = ui.applyAudioTrack(1);
  queueMicrotask(() => video.audioTracks.replace([{ id: "en", language: "en", enabled: true }]));
  await advance(1400);
  assert.equal(await result, false);
  assert.equal(ui.selectedAudioTrackIndex, 0);
});
test("manual selection supersedes a pending startup completion", async () => {
  const { ui, video, audio } = fixture();
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  ui.applyAudioTrack = () => {
    ui.audioSelectionToken++;
    return pending;
  };
  ui.enableStartupAudioGate();
  ui.startupTrackPreferenceReady = true;
  ui.refreshTrackDialogs();
  ui.applyAudioTrack = PlayerScreen.applyAudioTrack;
  await ui.applyAudioTrack(0, { rememberSelection: true });
  resolve(true);
  await drain();
  ui.refreshTrackDialogs();
  assert.equal(audio[0].enabled, true);
  assert.equal(audio[1].enabled, false);
  assert.equal(ui.rememberedAudioTrackPreference.language, "en");
  assert.equal(ui.startupAudioPreferenceApplied, true);
  ui.releaseStartupAudioGate();
  assert.equal(video.audioTracks.item(0).enabled, true);
});
test("startup retry and completion ignore a superseded playback token", async () => {
  const { ui } = fixture([{ id: "en", language: "en", enabled: true }]);
  ui.enableStartupAudioGate();
  ui.applyStartupAudioPreference();
  assert.ok(ui.startupAudioPreferenceRetryTimer);
  PlayerController.playRequestToken++;
  await advance(250);
  assert.equal(ui.startupAudioPreferenceRetryTimer, null);
  assert.equal(ui.startupAudioPreferenceApplied, false);
  let resolve;
  ui.applyAudioTrack = () => {
    ui.audioSelectionToken++;
    return new Promise((r) => {
      resolve = r;
    });
  };
  ui.requestVidaaStartupAudioOption(ui.collectAudioOptionItems()[0]);
  PlayerController.playRequestToken++;
  ui.startupAudioPreferenceApplying = false; // New source initialization.
  resolve(true);
  await drain();
  assert.equal(ui.startupAudioPreferenceApplied, false);
  assert.equal(ui.startupAudioPreferenceApplying, false);
  ui.releaseStartupAudioGate();
});
test("secondary audio does not latch before a late primary language", async () => {
  const getSettings = PlayerSettingsStore.get;
  PlayerSettingsStore.get = () => ({ ...getSettings(), secondaryPreferredAudioLanguage: "en" });
  try {
    const { ui, video, audio } = fixture();
    video.audioTracks.replace([audio[0]]);
    ui.enableStartupAudioGate();
    ui.startupTrackPreferenceReady = true;
    ui.refreshTrackDialogs();
    assert.equal(ui.startupAudioPreferenceApplied, false);
    assert.equal(ui.isStartupGateReleaseReady(), false);
    video.audioTracks.replace(audio);
    await advance(250);
    assert.equal(audio[1].enabled, true);
    assert.equal(ui.startupAudioPreferenceApplied, true);
    ui.releaseStartupAudioGate();
  } finally {
    PlayerSettingsStore.get = getSettings;
  }
});
test("renderer signals and visual observations stay separate from CSS intent; private fields omitted", () => {
  const secret = "https://secret.invalid/subs?token=PRIVATE";
  const { ui, video } = fixture(
    [{ id: secret, label: secret, language: "en", enabled: true }],
    [
      {
        id: secret,
        mode: "showing",
        cues: { length: 1 },
        activeCues: [{ startTime: 1, endTime: 3, text: secret }]
      }
    ]
  );
  ui.requestedSubtitleEntry = {
    id: secret,
    url: secret,
    headers: { Authorization: secret },
    textTrackIndex: 0
  };
  ui.subtitleRenderMode = "html";
  ui.subtitleStyleSettings = {
    fontSize: 140,
    textColor: "#FFFFFF",
    outlineEnabled: true,
    outlineColor: "#000000",
    verticalOffset: 10
  };
  const api = arm(ui, video, "external-vtt");
  ui.startPlayerControllerPlayback();
  api.snapshot();
  let last = data().records.at(-1);
  assert.equal(last.renderer.requested, "html");
  assert.equal(last.renderer.htmlOwned, false);
  assert.equal(last.renderer.nativeShowing.length, 1);
  assert.equal(last.presentation.visualEffect, "requires-observer");
  assert.equal(api.observe("fontSize", "no-visible-change"), true);
  assert.equal(api.observe(secret, secret), false);
  assert.equal(api.mark(secret), false);
  ui.htmlSubtitleSelectedId = secret;
  ui.htmlSubtitleCues = [{ text: secret }];
  api.snapshot();
  last = data().records.at(-1);
  assert.equal(last.renderer.concurrentOutputSignals, true);
  assert.ok(
    data().records.some((r) => r.reason === "observation" && r.effect === "no-visible-change")
  );
  assert.ok(!api.export().includes("secret"));
  assert.ok(!api.export().includes("PRIVATE"));
  assert.ok(!api.export().includes("Authorization"));
  api.stop();
});
test("stale selection completions are marked, obsolete mount callbacks stop recording", async () => {
  const { ui, video } = fixture();
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  ui.applyAudioTrack = () => pending;
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  assert.equal(ui.applyAudioTrack(0), pending);
  ui.audioSelectionToken++;
  resolve(true);
  await drain();
  assert.equal(data().records.find((r) => r.reason === "return:applyAudioTrack").current, false);
  ui.playerMountToken++;
  await advance(250);
  assert.equal(data().stopReason, "obsolete-mount");
  const count = data().records.length;
  emit(video.audioTracks, "change");
  assert.equal(data().records.length, count);
  assert.equal(api.snapshot(), false);
});
test("throwing getters and original errors do not turn diagnostics into playback errors", () => {
  const { ui, video } = fixture();
  const error = new Error("https://secret.invalid/error");
  ui.adjustSubtitleStyleControl = () => {
    throw error;
  };
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  ui.getAudioEntries = () => {
    throw error;
  };
  assert.doesNotThrow(() => emit(video.audioTracks, "change"));
  assert.throws(
    () => ui.adjustSubtitleStyleControl("fontSize", 1),
    (caught) => caught === error
  );
  assert.ok(!api.export().includes(error.message));
  api.stop();
});
test("bounded record memory and disable restore the existing handlers", () => {
  const { ui, video } = fixture();
  const original = ui.refreshTrackDialogs;
  const api = arm(ui, video);
  ui.startPlayerControllerPlayback();
  for (let i = 0; i < 500; i++) api.snapshot();
  assert.equal(data().records.length, 400);
  assert.equal(data().stopReason, "record-limit");
  assert.equal(ui.refreshTrackDialogs, original);
  assert.equal(timers.size, 0);
});

for (const { name, run } of tests) {
  globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__?.stop();
  timers.clear();
  storage.clear();
  await run();
  console.log(`PASS ${name}`);
}
console.log(
  `${tests.length}/${tests.length} VIDAA diagnostic experiments passed (fixtures, no TV).`
);
