import assert from "node:assert/strict";
import { installVidaaKeyboardFix } from "../js/platform/vidaa/vidaaKeyboard.js";
import { createTextInputHarness } from "./helpers/vidaaTextInputHarness.mjs";

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      const list = listeners.get(name) || [];
      list.push(handler);
      listeners.set(name, list);
    },
    emit(name, target = this) {
      for (const handler of listeners.get(name) || []) handler({ type: name, target });
    }
  };
}

// Keyboard fallback: silent commits, existing events, focus and lifecycle.
{
  const documentRef = { ...eventSurface(), hidden: false, activeElement: null };
  let poll = null;
  const root = {
    ...eventSurface(),
    document: documentRef,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    setInterval(callback) {
      assert.equal(poll, null);
      poll = callback;
      return 1;
    },
    clearInterval() {
      poll = null;
    }
  };
  const field = (tagName = "INPUT", type = "search", value = "") => ({
    tagName,
    type,
    value,
    events: [],
    dispatchEvent(event) {
      this.events.push(event.type);
      documentRef.emit(event.type, this);
    }
  });
  const first = field("INPUT", "search", "existing");
  installVidaaKeyboardFix(root);
  installVidaaKeyboardFix(root);
  assert.equal(poll, null, "No background polling without a focused field");
  documentRef.activeElement = first;
  documentRef.emit("focusin", first);
  poll();
  assert.deepEqual(first.events, [], "Focus must not submit the existing value");
  first.value = "silent keyboard commit";
  poll();
  poll();
  assert.deepEqual(
    first.events,
    ["input"],
    "Silent editing emits input without an early change commit"
  );
  first.value = "native event";
  first.dispatchEvent({ type: "input" });
  poll();
  assert.equal(first.events.length, 2, "Do not duplicate the native input event");
  first.value = "last commit on keyboard close";
  documentRef.emit("focusout", first);
  assert.deepEqual(
    first.events,
    ["input", "input", "input", "change"],
    "Flush the final value and one commit on blur"
  );
  assert.equal(poll, null);
  const checkbox = field("INPUT", "checkbox");
  documentRef.emit("focusin", checkbox);
  assert.equal(poll, null, "Only text fields need a keyboard fallback");
  const second = field("TEXTAREA", "", "different initial value");
  documentRef.activeElement = second;
  documentRef.emit("focusin", second);
  poll();
  assert.deepEqual(second.events, [], "Do not carry another field's value across focus");
  documentRef.hidden = true;
  documentRef.emit("visibilitychange");
  assert.equal(poll, null, "Stop polling while hidden");
  documentRef.hidden = false;
  documentRef.emit("visibilitychange");
  assert.equal(typeof poll, "function");
  root.emit("pagehide");
  assert.equal(poll, null);
  root.emit("pageshow");
  assert.equal(typeof poll, "function");
}

// Fallback notifications must not duplicate delayed native events. DOM change
// is a commit, rather than one extra notification for every character.
for (const tagName of ["INPUT", "TEXTAREA", "DIV"]) {
  const h = createTextInputHarness();
  const field = h.node(
    tagName,
    tagName === "DIV" ? { contentEditable: "true", isContentEditable: true, value: undefined } : {}
  );
  const events = [];
  field.addEventListener("input", () => events.push("input"));
  field.addEventListener("change", () => events.push("change"));
  const write = (value) => {
    if (tagName === "DIV") field.textContent = value;
    else field.value = value;
  };
  field.focus();
  write("first silent edit");
  h.poll();
  h.poll();
  assert.deepEqual(events, ["input"]);
  h.native("input", field);
  assert.deepEqual(
    events,
    ["input"],
    "A late native input cannot duplicate a fallback notification"
  );
  write("final silent commit");
  field.blur();
  assert.deepEqual(events, ["input", "input", "change"]);
  h.native("input", field);
  h.native("change", field);
  assert.deepEqual(
    events,
    ["input", "input", "change"],
    "Late native input/change after focusout are deduplicated"
  );
  assert.equal(h.timers.size, 0);
  field.focus();
  write("normal DOM input");
  h.native("input", field);
  h.poll();
  h.native("change", field);
  assert.deepEqual(
    events.slice(3),
    ["input", "change"],
    "Existing DOM events produce no synthetic duplicates"
  );
  assert.equal(h.timers.size, 0, "Native change releases the observer even without focusout");
}
{
  const h = createTextInputHarness();
  const field = h.node();
  field.focus();
  field.value = "commit on removal";
  field.isConnected = false;
  h.poll();
  assert.equal(h.timers.size, 0, "A rerender/removal must not leave a keyboard observer running");
}
{
  const h = createTextInputHarness();
  const field = h.node();
  let inputs = 0;
  field.addEventListener("input", () => {
    inputs++;
    field.value = field.value.slice(0, 20);
  });
  field.focus();
  field.value = "a silently entered profile name longer than twenty characters";
  h.poll();
  h.poll();
  assert.equal(inputs, 1, "Screen value normalization must not create a second fallback input");
  field.blur();
}

// Use the actual shared controller and adapters for playback regressions.
const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { createPlayerControllerMethods12 } =
  await import("../js/core/player/playerControllerMethods-12-get-playback-engine-candidates.js");
const { createPlayerControllerMethods16 } =
  await import("../js/core/player/playerControllerMethods-16-set-web-os-embedded-subtitle-track.js");
const { createPlayerScreenMethods33 } =
  await import("../js/ui/screens/player/playerScreenMethods-33-resolve-media-action.js");

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}
const controller = {
  ...createPlayerControllerMethods12(),
  getPlatformAvplayEngineName: () => "tizen-avplay",
  isLivePlaybackItemType: () => false,
  canUseAvPlay: () => false,
  shouldPreferTvNativePipeline: () => false,
  canUseHlsJs: () => true,
  canUseDashJs: () => true,
  canPlayNatively: (mime) => mime === "application/vnd.apple.mpegurl",
  isLikelyHlsMimeType: (mime) => mime === "application/vnd.apple.mpegurl"
};
const hls = "application/vnd.apple.mpegurl";
assert.deepEqual(controller.getPlaybackEngineCandidates("https://example.com/live.m3u8", hls), [
  "native-hls",
  "hls.js"
]);
controller.canPlayNatively = () => false;
assert.deepEqual(controller.getPlaybackEngineCandidates("https://example.com/live.m3u8", hls), [
  "hls.js"
]);
controller.canPlayNatively = () => true;
for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  assert.equal(
    controller.getPlaybackEngineCandidates("https://example.com/live.m3u8", hls)[0],
    "hls.js",
    `${name} retains its HLS priority`
  );
}
platform("vidaa");
// A native choice must not load the MSE libraries just to play the stream.
await createPlayerControllerMethods16().ensureAdaptiveLibrariesForSource(hls, "native-hls");

// Subtitle selection must disable every track before enabling an earlier one.
const writes = [];
const textTracks = [0, 1].map((index) => {
  let mode = index === 1 ? "showing" : "disabled";
  return {
    get mode() {
      return mode;
    },
    set mode(value) {
      if (value === "showing") assert.ok(textTracks.every((track) => track.mode === "disabled"));
      writes.push([index, value]);
      mode = value;
    }
  };
});
const trackController = { video: { textTracks } };
assert.equal(PlayerController.setNativeTextTrack.call(trackController, 0), true);
assert.deepEqual(writes, [
  [0, "disabled"],
  [1, "disabled"],
  [0, "showing"]
]);
assert.equal(PlayerController.setNativeTextTrack.call(trackController, -1), true);
assert.ok(textTracks.every((track) => track.mode === "disabled"));
const beforeInvalid = writes.length;
assert.equal(PlayerController.setNativeTextTrack.call(trackController, 0.5), false);
assert.equal(PlayerController.setNativeTextTrack.call(trackController, 2), false);
assert.equal(writes.length, beforeInvalid, "Invalid selections must not mutate tracks");
const readonlyController = { video: { textTracks: [Object.freeze({ mode: "disabled" })] } };
assert.equal(await PlayerController.setNativeTextTrack.call(readonlyController, 0), false);

// Native audio is selected by the common controller rather than an external app.
const audioTracks = [{ enabled: true }, { enabled: false }];
assert.equal(
  PlayerController.setNativeAudioTrack.call(
    { video: {}, nativeAudioTrackListToArray: () => audioTracks },
    1
  ),
  true
);
assert.deepEqual(
  audioTracks.map((track) => track.enabled),
  [false, true]
);

// Remote shortcuts must resolve to Nuvio's existing seek preview actions.
const mediaActions = createPlayerScreenMethods33();
for (const [code, action] of [
  [427, "fastForward"],
  [428, "rewind"]
]) {
  const normalized = Platform.normalizeKey({ keyCode: code });
  assert.equal(normalized.originalKeyCode, code);
  assert.equal(mediaActions.resolveMediaAction(normalized), action);
}
assert.equal(Platform.isBackEvent({ keyCode: 8, target: { tagName: "INPUT" } }), false);
assert.equal(Platform.isBackEvent({ keyCode: 8, target: { tagName: "DIV" } }), true);
// HTTP compatibility must use the requested media host before any async work.
{
  const { createPlayerControllerMethods18 } =
    await import("../js/core/player/playerControllerMethods-18-play.js");
  const { registerVidaaHttpMediaDomain } = await import("../js/platform/adapters/vidaaAdapter.js");
  const calls = [];
  globalThis.Hisense_AddInsecureDomain = (host) => calls.push(host);
  platform("vidaa");
  Platform.prepareMediaRequest("https://cdn.example/video.mkv");
  Platform.prepareMediaRequest("not a URL");
  assert.deepEqual(calls, []);
  const checkpoint = new Error("stop before media probing");
  const playback = {
    video: {},
    stopProgressSaving() {},
    cancelProgressSyncAfterSeek() {},
    flushCurrentProgress() {
      assert.deepEqual(calls, ["cdn.example"], "Register before source probing/loading");
      throw checkpoint;
    }
  };
  await assert.rejects(
    createPlayerControllerMethods18().play.call(
      playback,
      "http://cdn.example:8080/video.mkv?token=private"
    ),
    (error) => error === checkpoint
  );
  platform("tizen");
  Platform.prepareMediaRequest("http://other.example/video.mp4");
  assert.deepEqual(calls, ["cdn.example"], "Other platforms must not call Hisense APIs");
  assert.doesNotThrow(() => registerVidaaHttpMediaDomain("http://cdn.example/video.mp4", {}));
  assert.doesNotThrow(() =>
    registerVidaaHttpMediaDomain("http://cdn.example/video.mp4", {
      Hisense_AddInsecureDomain() {
        throw new Error("disabled by firmware");
      }
    })
  );
  delete globalThis.Hisense_AddInsecureDomain;
}

// Background transitions use the shared pause/checkpoint path without autoplay.
for (const name of ["vidaa", "tizen", "webos"]) {
  platform(name);
  const video = { ...eventSurface(), paused: false, muted: true, setAttribute() {} };
  globalThis.document = {
    ...eventSurface(),
    getElementById: () => video,
    visibilityState: "visible"
  };
  globalThis.window = eventSurface();
  let pauses = 0;
  let checkpoints = 0;
  let resumes = 0;
  const lifecycleController = {
    ...createPlayerControllerMethods16(),
    playbackSessionActive: true,
    refreshWebOsDeviceInfo() {},
    flushCurrentProgress() {
      checkpoints++;
    },
    pause() {
      pauses++;
      video.paused = true;
      checkpoints++;
    },
    resume() {
      resumes++;
    }
  };
  lifecycleController.init();
  document.visibilityState = "hidden";
  document.emit("visibilitychange");
  assert.equal(pauses, name === "vidaa" ? 1 : 0, `${name} lifecycle behavior`);
  assert.equal(checkpoints, 1);
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  assert.equal(resumes, 0, "Returning to the app must not force autoplay");
  window.emit("pagehide");
  assert.equal(checkpoints, 2);
}
console.log(
  "VIDAA runtime checks passed: keyboard, HLS priorities, native tracks, HTTP compatibility, remote and lifecycle."
);
