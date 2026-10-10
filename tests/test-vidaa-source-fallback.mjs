import assert from "node:assert/strict";

// These fixtures call the production source orchestration and lifecycle methods.
// Media decoding, addon responses and UI rendering are replaced by local doubles.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.document = {
  getElementById: () => null,
  documentElement: {},
  visibilityState: "visible"
};
globalThis.window = new EventTarget();
globalThis.fetch = async () => {
  throw new Error("Unexpected network request");
};

const { PlayerController } = await import("../js/core/player/playerController.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { createPlayerVideoLifecycleHandlers } =
  await import("../js/ui/screens/player/playerVideoLifecycleHandlers.js");
const { createPlayerVideoEventHandlers } =
  await import("../js/ui/screens/player/playerVideoEventHandlers.js");
const { streamRepository } = await import("../js/data/repository/streamRepository.js");
const { TrackingScrobbleService } =
  await import("../js/data/repository/trackingScrobbleService.js");
const { DirectDebridResolver } = await import("../js/core/debrid/directDebridResolver.js");
const { Platform } = await import("../js/platform/index.js");

const originalController = { ...PlayerController };
const originalGetStreams = streamRepository.getStreamsFromAllAddons;
const originalPauseSearch = streamRepository.setLocalPluginSearchPaused;
const originalTrackingEnabled = TrackingScrobbleService.isEnabled;
const originalCanResolveDebrid = DirectDebridResolver.canResolveStream;
const originalResolveDebrid = DirectDebridResolver.resolve;
const originalDateNow = Date.now;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let now = 100000;
let timerId = 0;
const timers = new Map();
Date.now = () => now;
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++timerId;
  timers.set(id, { callback, time: now + Number(delay), delay: Number(delay) });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);

async function drain() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}
async function advance(ms) {
  const until = now + ms;
  await drain();
  let count = 0;
  while (true) {
    const due = [...timers]
      .filter(([, value]) => value.time <= until)
      .sort((a, b) => a[1].time - b[1].time)[0];
    if (!due) break;
    assert.ok(++count < 100, "Source retries must be bounded");
    const [id, value] = due;
    timers.delete(id);
    now = value.time;
    value.callback();
    await drain();
  }
  now = until;
  await drain();
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function candidate(id, url = `https://fixture.invalid/${id}.mp4`) {
  return { id, url, addonName: "fixture", label: id };
}
const tests = [];
const test = (name, run) => tests.push({ name, run });

function screen({
  sources = [candidate("a"), candidate("b"), candidate("c")],
  index = 0,
  seconds = 0,
  healthy = false,
  failIds = []
} = {}) {
  const video = new EventTarget();
  Object.assign(video, { currentTime: seconds, paused: false, ended: false, readyState: 4 });
  const calls = [];
  const stops = [];
  const terminals = [];
  const ui = {
    ...PlayerScreen,
    videoListeners: [],
    uiRefs: {},
    params: {},
    streamCandidates: sources,
    currentStreamIndex: index,
    activePlaybackUrl: sources[index]?.url || "",
    playerRouteActive: true,
    playerMountToken: 1,
    sourcePlaybackAttemptToken: 0,
    playbackStartToken: 0,
    sourceFallbackPending: false,
    sourcePlaybackStarting: false,
    sourceFallbackLoadAttempted: false,
    sourceFallbackStatus: "",
    sourceFallbackExhausted: false,
    sourceFallbackDeadlineTimer: null,
    sourceFallbackProgressSeconds: null,
    failedPlaybackUrls: new Set(),
    failedPlaybackStreamIds: new Set(),
    hasPresentedPlaybackFrame: healthy,
    startupPlaybackBaselineSeconds: 0,
    startupPlaybackHasAdvanced: healthy,
    startupTrackPreferenceReady: true,
    pendingPlaybackRestore: null,
    paused: false,
    sourceLoadToken: 0,
    sourcesLoading: false,
    startupErrorMessage: "",
    sourcesError: "",
    lastPlaybackErrorAt: 0,
    recordedSnapshot: null,
    isActiveMountToken(token = null) {
      return this.playerRouteActive && (token == null || token === this.playerMountToken);
    },
    isExternalFrameMode: () => false,
    getCurrentStreamCandidate() {
      return this.streamCandidates[this.currentStreamIndex] || null;
    },
    getPlaybackCurrentSeconds: () => Number(video.currentTime),
    getPlaybackDurationSeconds: () => 3600,
    getVideoTextTrackList: () => null,
    getVideoAudioTrackList: () => null,
    isStartupGateReleaseReady: () => false,
    clearStartupError() {
      this.startupErrorMessage = "";
    },
    clearPlaybackStallGuard() {
      this.playbackStallTimer = null;
    },
    schedulePlaybackStallGuard() {},
    getPlaybackErrorDetailLines: () => [],
    renderStartupErrorOverlay() {
      if (this.startupErrorMessage) terminals.push(this.startupErrorMessage);
    },
    async playStreamByUrl(url, options = {}) {
      calls.push({
        id: options.sourceCandidate?.id,
        url,
        options,
        restore: this.pendingPlaybackRestore && { ...this.pendingPlaybackRestore }
      });
      if (failIds.includes(options.sourceCandidate?.id))
        throw new Error("Fixture unplayable source");
      this.activePlaybackUrl = url;
      this.sourcePlaybackStarting = false;
      this.hasPresentedPlaybackFrame = false;
      this.startupPlaybackHasAdvanced = false;
      video.currentTime = 0;
      // Production playStreamByUrl closes Sources and cancels any source search.
      this.cancelSourceLoad();
    }
  };
  const noops = [
    "updateLoadingVisibility",
    "syncLoadingOverlayStatus",
    "dismissPauseOverlay",
    "releaseStartupAudioGate",
    "stopLoadingLogoFillAnimation",
    "clearBufferingSpinnerTimer",
    "clearSubtitleDelayOverlayTimer",
    "resetSubtitleAutoSyncState",
    "renderControlButtons",
    "renderSourcesPanel",
    "renderSubtitleDialog",
    "renderSubtitleDelayOverlay",
    "renderSubtitleTimingDialog",
    "renderAudioDialog",
    "renderSpeedDialog",
    "renderEpisodePanel",
    "renderPauseOverlay",
    "focusStartupErrorButton",
    "beginPlaybackEngineValidation",
    "warmBitmapSubtitleSharedResources",
    "setLoadingLogoFillTarget",
    "refreshTrackDialogs",
    "scheduleBufferingSpinnerRefresh",
    "setControlsVisible",
    "updateMediaSessionPlaybackState",
    "updateUiTick",
    "schedulePauseOverlay",
    "rememberSelectedStreamPreference",
    "scheduleSourcesPanelRender",
    "installVidaaTrackExperiment"
  ];
  for (const name of noops) ui[name] = () => {};
  Object.assign(PlayerController, {
    video,
    playbackEngine: "native",
    playRequestToken: 1,
    isPlaying: healthy,
    isPlaybackEnded: () => false,
    isLivePlaybackItemType: () => false,
    getRecordedProgressSnapshot: () => ui.recordedSnapshot,
    stop(options) {
      stops.push({
        options,
        seconds: video.currentTime,
        restore: ui.pendingPlaybackRestore && { ...ui.pendingPlaybackRestore }
      });
      this.playRequestToken++;
      video.currentTime = 0;
      return Promise.resolve();
    }
  });
  ui.beginSourcePlaybackAttempt(sources[index]);
  ui.sourcePlaybackStarting = false;
  return { ui, video, calls, stops, terminals };
}

test("next-source status appears only after failure and clears immediately on a fresh choice", async () => {
  const { ui, video, calls } = screen();
  const statusNode = () => {
    const classes = new Set();
    return {
      textContent: "",
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
        contains: (name) => classes.has(name)
      }
    };
  };
  const loadingStatus = statusNode();
  const bufferingStatus = statusNode();
  ui.uiRefs = { loadingStatus, bufferingStatus };
  ui.syncLoadingOverlayStatus = PlayerScreen.syncLoadingOverlayStatus;
  ui.updateLoadingVisibility = () => ui.syncLoadingOverlayStatus();
  ui.beginSourcePlaybackAttempt(ui.getCurrentStreamCandidate());
  ui.syncLoadingOverlayStatus();
  assert.equal(loadingStatus.textContent, "", "First open is ordinary loading");
  assert.equal(loadingStatus.classList.contains("hidden"), true);
  ui.sourcePlaybackStarting = false;
  const { onWaiting } = createPlayerVideoLifecycleHandlers.call(ui, video, () => false);
  onWaiting();
  assert.equal(bufferingStatus.textContent, "", "Buffering alone is not a source failure");
  assert.equal(ui.failedPlaybackStreamIds.size, 0);
  assert.deepEqual(calls, []);

  ui.showStartupError("Fixture source failure", {
    streamCandidate: ui.getCurrentStreamCandidate()
  });
  assert.ok(ui.failedPlaybackStreamIds.has("a"));
  assert.ok(loadingStatus.textContent.includes("next source"));
  assert.equal(loadingStatus.classList.contains("hidden"), false);
  ui.beginSourcePlaybackAttempt(ui.streamCandidates[2]);
  assert.equal(
    loadingStatus.textContent,
    "",
    "A manual/new stream clears the previous fallback message immediately"
  );
  assert.equal(bufferingStatus.textContent, "");
  assert.equal(loadingStatus.classList.contains("hidden"), true);
  await drain();
  assert.deepEqual(calls, [], "The obsolete automatic fallback cannot reopen its message");
});

test("a real first frame cancels the deadline beyond both startup limits", async () => {
  const { ui, video, calls, terminals } = screen();
  ui.sourceFallbackStatus = "Trying the next source";
  video.currentTime = 10;
  assert.equal(ui.markPlaybackPresentedAfterAdvance(), true);
  assert.equal(ui.sourceFallbackDeadlineTimer, null);
  assert.equal(ui.sourceFallbackStatus, "");
  await advance(200000);
  assert.deepEqual(calls, []);
  assert.deepEqual(terminals, []);
});

test("waiting rearms a bounded deadline and actual progress clears success status", async () => {
  const { ui, video } = screen({ healthy: true, seconds: 25 });
  ui.clearSourceFallbackDeadline();
  const { onWaiting } = createPlayerVideoLifecycleHandlers.call(ui, video, () => false);
  onWaiting();
  const timer = ui.sourceFallbackDeadlineTimer;
  assert.ok(timer);
  ui.sourceFallbackStatus = "Trying the next source";
  ui.noteSourcePlaybackProgress(25.2);
  assert.equal(ui.sourceFallbackDeadlineTimer, timer, "Ready/unchanged time is not recovery");
  ui.noteSourcePlaybackProgress(26);
  assert.equal(ui.sourceFallbackDeadlineTimer, null);
  assert.equal(ui.sourceFallbackStatus, "");
  await advance(100000);
  assert.equal(ui.startupErrorMessage, "");
});

test("AVPlay waiting arms a deadline despite keeping the startup overlay hidden", async () => {
  const { ui, video, calls } = screen({ healthy: true, seconds: 25 });
  ui.clearSourceFallbackDeadline();
  const { onWaiting } = createPlayerVideoLifecycleHandlers.call(ui, video, () => true);
  onWaiting();
  assert.equal(ui.loadingVisible, false);
  assert.equal(ui.bufferingActive, true);
  assert.ok(ui.sourceFallbackDeadlineTimer);
  await advance(90000);
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
});

test("a user pause after waiting cannot switch sources on the old deadline", async () => {
  const { ui, video, calls, terminals } = screen({ healthy: true, seconds: 25 });
  ui.clearSourceFallbackDeadline();
  const { onWaiting, onPause } = createPlayerVideoLifecycleHandlers.call(ui, video, () => false);
  onWaiting();
  onPause();
  assert.equal(ui.paused, true);
  assert.equal(ui.sourceFallbackDeadlineTimer, null);
  await advance(100000);
  assert.deepEqual(calls, []);
  assert.deepEqual(terminals, []);
});

test("a same-source recovery keeps its original hard ceiling and attempt", async () => {
  const { ui } = screen();
  const token = ui.sourcePlaybackAttemptToken;
  const timer = ui.sourceFallbackDeadlineTimer;
  const deadline = timers.get(timer).time;
  await advance(30000);
  ui.beginSourcePlaybackAttempt(ui.getCurrentStreamCandidate(), { sourceRecovery: true });
  assert.equal(ui.sourcePlaybackAttemptToken, token);
  assert.equal(ui.sourceFallbackDeadlineTimer, timer);
  assert.equal(timers.get(timer).time, deadline);
});

test("a stuck source moves to the next candidate without an intermediate overlay", async () => {
  const { ui, calls, terminals } = screen();
  await advance(90000);
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
  assert.equal(ui.currentStreamIndex, 1);
  assert.deepEqual(terminals, []);
  assert.equal(ui.startupErrorMessage, "");
});

test("fatal candidates wrap from the selected source and exhaust once without loops", async () => {
  const { ui, calls, terminals } = screen({ index: 1, failIds: ["a", "c"] });
  ui.showStartupError("Fixture first failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["c", "a"]
  );
  assert.deepEqual([...ui.failedPlaybackStreamIds].sort(), ["a", "b", "c"]);
  assert.equal(ui.sourceFallbackExhausted, true);
  assert.equal(terminals.length, 1);
  assert.ok(ui.startupErrorMessage.includes("None of"));
  assert.equal(timers.size, 0);
  await advance(400000);
  assert.equal(terminals.length, 1);
});

test("simultaneous errors schedule only one switch and obsolete candidate errors are ignored", async () => {
  const { ui, calls, stops, terminals } = screen();
  const failed = ui.getCurrentStreamCandidate();
  const token = ui.sourcePlaybackAttemptToken;
  ui.showStartupError("First error", { streamCandidate: failed, sourceAttemptToken: token });
  ui.showStartupError("Duplicate error", { streamCandidate: failed, sourceAttemptToken: token });
  assert.equal(stops.length, 1);
  await drain();
  ui.showStartupError("Late old error", { streamCandidate: failed, sourceAttemptToken: token });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
  assert.deepEqual(terminals, []);
});

test("a duplicate URL is skipped even when it has a different candidate id", async () => {
  const a = candidate("a");
  const { ui, calls } = screen({ sources: [a, candidate("duplicate", a.url), candidate("good")] });
  ui.showStartupError("Fixture failure", { streamCandidate: a });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["good"]
  );
});

test("an external playback frame is outside automatic source fallback", async () => {
  const { ui, calls } = screen();
  ui.isExternalFrameMode = () => true;
  assert.equal(ui.tryNextStreamCandidate(), false);
  assert.equal(ui.failedPlaybackStreamIds.size, 0);
  await drain();
  assert.deepEqual(calls, []);
});

test("fallback captures a real position before stop and keeps the user pause state", async () => {
  const { ui, calls, stops } = screen({ healthy: true, seconds: 123 });
  ui.paused = true;
  ui.showStartupError("Fixture failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  assert.equal(stops[0].seconds, 123);
  assert.equal(stops[0].restore.timeSeconds, 123);
  assert.equal(stops[0].restore.paused, true);
  await drain();
  assert.equal(calls[0].restore.timeSeconds, 123);
  assert.equal(calls[0].options.preservePendingRestore, true);
});

test("zero-time decoder failure restores from the recorded progress snapshot", async () => {
  const { ui, calls } = screen({ healthy: true, seconds: 0 });
  ui.recordedSnapshot = { positionMs: 120000 };
  ui.showStartupError("Decoder failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  assert.equal(calls[0].restore.timeSeconds, 120);
});

test("a fatal event after the first frame switches sources and preserves position", async () => {
  const { ui, video, calls, terminals } = screen({ healthy: true, seconds: 125 });
  const { onError } = createPlayerVideoEventHandlers.call(ui, video, () => false);
  await onError({ detail: { mediaErrorCode: 2 } });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
  assert.equal(calls[0].restore.timeSeconds, 125);
  assert.equal(calls[0].restore.paused, false);
  assert.equal(ui.sourcesError, "");
  assert.deepEqual(terminals, []);
});

test("an unfinished original resume is preserved through successive startup failures", async () => {
  const { ui, video, calls } = screen({ failIds: ["b"] });
  ui.pendingPlaybackRestore = {
    timeSeconds: 120,
    progressPercent: 10,
    paused: false,
    attempts: 7,
    lastAttemptAt: 111
  };
  video.currentTime = 2;
  ui.showStartupError("Startup failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b", "c"]
  );
  for (const call of calls) {
    assert.equal(call.restore.timeSeconds, 120);
    assert.equal(call.restore.progressPercent, 10);
    assert.equal(call.restore.attempts, 0);
    assert.equal(call.restore.lastAttemptAt, 0);
  }
});

test("pending resume progress cannot prematurely cancel the deadline", () => {
  const { ui } = screen({ healthy: true, seconds: 10 });
  ui.pendingPlaybackRestore = { timeSeconds: 120 };
  const timer = ui.sourceFallbackDeadlineTimer;
  ui.noteSourcePlaybackProgress(12);
  assert.equal(ui.sourceFallbackDeadlineTimer, timer);
});

test("a manual choice supersedes a queued automatic switch", async () => {
  const { ui, calls } = screen();
  ui.showStartupError("Fixture failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  await ui.playStreamCandidate(ui.streamCandidates[2], { preservePlaybackState: true });
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["c"]
  );
  assert.equal(ui.currentStreamIndex, 2);
  assert.equal(ui.failedPlaybackStreamIds.size, 0);
});

test("route cleanup cancels a queued switch and its source deadline", async () => {
  const { ui, calls } = screen();
  ui.showStartupError("Fixture failure", { streamCandidate: ui.getCurrentStreamCandidate() });
  ui.playerRouteActive = false;
  ui.playerMountToken++;
  ui.clearSourceFallbackDeadline();
  await drain();
  assert.deepEqual(calls, []);
  assert.equal(timers.size, 0);
});

test("a stale deadline callback cannot terminate a manually selected source", async () => {
  const { ui, calls, terminals } = screen();
  const stale = timers.get(ui.sourceFallbackDeadlineTimer).callback;
  await ui.playStreamCandidate(ui.streamCandidates[1]);
  stale();
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
  assert.deepEqual(terminals, []);
});

test("guarded native events cannot alter a source while resolving or after unmount", () => {
  const { ui, video } = screen({ healthy: true, seconds: 25 });
  ui.clearSourceFallbackDeadline();
  ui.bindVideoEvents();
  ui.sourcePlaybackStarting = true;
  video.dispatchEvent(new Event("waiting"));
  video.dispatchEvent(new Event("pause"));
  assert.equal(ui.paused, false);
  assert.equal(ui.sourceFallbackDeadlineTimer, null);
  ui.sourcePlaybackStarting = false;
  ui.playerRouteActive = false;
  video.dispatchEvent(new Event("waiting"));
  video.dispatchEvent(new Event("pause"));
  assert.equal(ui.paused, false);
  assert.equal(ui.sourceFallbackDeadlineTimer, null);
  ui.unbindVideoEvents();
});

test("an unavailable resolver continues to a playable candidate without intermediate errors", async () => {
  const unresolved = { ...candidate("unresolved", ""), clientResolve: { type: "debrid" } };
  const { ui, calls, terminals } = screen({ sources: [unresolved, candidate("good")] });
  DirectDebridResolver.canResolveStream = (entry) => entry.id === "unresolved";
  DirectDebridResolver.resolve = async () => ({
    status: "service_degraded",
    detail: "Fixture unavailable"
  });
  await ui.playStreamCandidate(unresolved);
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["good"]
  );
  assert.deepEqual(terminals, []);
  assert.ok(ui.failedPlaybackStreamIds.has("unresolved"));
});

test("a late resolver cannot replace a newer manual source or mutate its old candidate", async () => {
  const pending = deferred();
  const unresolved = { ...candidate("unresolved", ""), clientResolve: { type: "debrid" } };
  const { ui, calls, terminals } = screen({ sources: [unresolved, candidate("manual")] });
  DirectDebridResolver.canResolveStream = (entry) => entry.id === "unresolved";
  DirectDebridResolver.resolve = () => pending.promise;
  const oldRequest = ui.playStreamCandidate(unresolved);
  await drain();
  await ui.playStreamCandidate(ui.streamCandidates[1]);
  pending.resolve({ status: "success", stream: { url: "https://fixture.invalid/obsolete.mp4" } });
  await oldRequest;
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["manual"]
  );
  assert.equal(unresolved.url, "");
  assert.equal(ui.currentStreamIndex, 1);
  assert.deepEqual(terminals, []);
});

test("an obsolete EngineFS error response cannot terminate a newer source", async () => {
  const pending = deferred();
  const { ui, video, calls, terminals } = screen();
  ui.currentEngineFsStream = { kind: "webos-enginefs", infoHash: "fixture" };
  ui.fetchCurrentEngineFsStats = () => pending.promise;
  const { onError } = createPlayerVideoEventHandlers.call(ui, video, () => false);
  const oldError = onError({ detail: { mediaErrorCode: 2 } });
  await drain();
  await ui.playStreamCandidate(ui.streamCandidates[2]);
  pending.resolve(null);
  await oldError;
  await drain();
  assert.deepEqual(
    calls.map((call) => call.id),
    ["c"]
  );
  assert.equal(ui.failedPlaybackStreamIds.size, 0);
  assert.deepEqual(terminals, []);
});

test("a lone saved source reloads real addon candidates and switches silently", async () => {
  const saved = candidate("saved");
  const { ui, calls, terminals } = screen({ sources: [saved], healthy: true, seconds: 240 });
  ui.params = { itemId: "fixture-film", videoId: "fixture-film", itemType: "movie" };
  let reloads = 0;
  streamRepository.getStreamsFromAllAddons = async (type, id) => {
    reloads++;
    assert.equal(type, "movie");
    assert.equal(id, "fixture-film");
    return { status: "success", data: [{ addonName: "fixture", streams: [candidate("fresh")] }] };
  };
  ui.showStartupError("Saved source expired", { streamCandidate: saved });
  await drain();
  assert.equal(reloads, 1);
  assert.deepEqual(
    calls.map((call) => call.id),
    ["fresh"]
  );
  assert.equal(calls[0].restore.timeSeconds, 240);
  assert.deepEqual(terminals, []);
});

test("an empty source reload produces one final error and is never repeated", async () => {
  const { ui, terminals } = screen({ sources: [candidate("saved")] });
  ui.params = { itemId: "fixture-film" };
  let reloads = 0;
  streamRepository.getStreamsFromAllAddons = async () => {
    reloads++;
    return { status: "success", data: [] };
  };
  ui.showStartupError("Saved source failed", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  assert.equal(reloads, 1);
  assert.equal(terminals.length, 1);
  assert.equal(ui.sourceFallbackPending, false);
  assert.equal(timers.size, 0);
  await advance(300000);
  assert.equal(reloads, 1);
  assert.equal(terminals.length, 1);
});

test("a hung source reload is bounded and late addon results cannot revive it", async () => {
  const pending = deferred();
  const { ui, calls, terminals } = screen({ sources: [candidate("saved")] });
  ui.params = { itemId: "fixture-film" };
  let requestSignal;
  streamRepository.getStreamsFromAllAddons = (_type, _id, options) => {
    requestSignal = options.signal;
    return pending.promise;
  };
  ui.showStartupError("Saved source failed", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  await advance(20000);
  assert.equal(requestSignal.aborted, true);
  assert.equal(terminals.length, 1);
  pending.resolve({
    status: "success",
    data: [{ addonName: "fixture", streams: [candidate("late")] }]
  });
  await drain();
  assert.deepEqual(calls, []);
  assert.deepEqual(
    ui.streamCandidates.map((entry) => entry.id),
    ["saved"]
  );
  assert.equal(timers.size, 0);
});

test("unmount during source reload cannot launch a late result", async () => {
  const pending = deferred();
  const { ui, calls, terminals } = screen({ sources: [candidate("saved")] });
  ui.params = { itemId: "fixture-film" };
  streamRepository.getStreamsFromAllAddons = () => pending.promise;
  ui.showStartupError("Saved source failed", { streamCandidate: ui.getCurrentStreamCandidate() });
  await drain();
  ui.playerRouteActive = false;
  ui.playerMountToken++;
  ui.cancelSourceLoad();
  pending.resolve({
    status: "success",
    data: [{ addonName: "fixture", streams: [candidate("late")] }]
  });
  await drain();
  assert.deepEqual(calls, []);
  assert.deepEqual(terminals, []);
  assert.equal(timers.size, 0);
});

let failures = 0;
try {
  for (const { name, run } of tests) {
    timers.clear();
    now = 100000;
    Object.assign(PlayerController, originalController);
    Platform.current = null;
    globalThis.__NUVIO_PLATFORM__ = "vidaa";
    streamRepository.setLocalPluginSearchPaused = () => {};
    streamRepository.getStreamsFromAllAddons = async () => {
      throw new Error("Unexpected addon request");
    };
    TrackingScrobbleService.isEnabled = () => false;
    DirectDebridResolver.canResolveStream = originalCanResolveDebrid;
    DirectDebridResolver.resolve = originalResolveDebrid;
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
} finally {
  Object.assign(PlayerController, originalController);
  streamRepository.getStreamsFromAllAddons = originalGetStreams;
  streamRepository.setLocalPluginSearchPaused = originalPauseSearch;
  TrackingScrobbleService.isEnabled = originalTrackingEnabled;
  DirectDebridResolver.canResolveStream = originalCanResolveDebrid;
  DirectDebridResolver.resolve = originalResolveDebrid;
  Date.now = originalDateNow;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log(
  `${tests.length - failures}/${tests.length} source fallback fixtures passed. Real TV decoding remains unverified.`
);
if (failures) process.exitCode = 1;
