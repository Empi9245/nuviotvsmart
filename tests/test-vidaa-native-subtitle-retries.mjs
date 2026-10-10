import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.document = { getElementById: () => null, documentElement: {} };

const { selectVidaaTextTrack } = await import("../js/platform/vidaa/vidaaVideo.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { Platform } = await import("../js/platform/index.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");

let now = 0;
Date.now = () => now;
let timerId = 0;
const timers = new Map();
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++timerId;
  timers.set(id, { callback, at: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
async function advance(ms = 1000) {
  const until = now + ms;
  let count = 0;
  while (true) {
    const due = [...timers]
      .filter(([, timer]) => timer.at <= until)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    assert.ok(++count < 100, "Native subtitle retries must be bounded");
    const [id, timer] = due;
    timers.delete(id);
    now = timer.at;
    timer.callback();
    for (let flush = 0; flush < 5; flush++) await Promise.resolve();
  }
  now = until;
}
function track(initial, { delay = 0, ignore = false, readonly = false } = {}) {
  let mode = initial;
  const writes = [];
  let writable = !ignore;
  return {
    writes,
    setWritable(value) {
      writable = value;
    },
    get mode() {
      return mode;
    },
    set mode(value) {
      writes.push({ mode: value, at: now });
      if (readonly) throw new Error("readonly mode");
      if (!writable) return;
      if (delay)
        setTimeout(() => {
          mode = value;
        }, delay);
      else mode = value;
    }
  };
}
function controller(tracks) {
  Platform.current = null;
  return {
    ...PlayerController,
    video: { src: "fixture-a", textTracks: tracks },
    playRequestToken: 1
  };
}
const failures = [];
let passed = 0;
async function test(name, body) {
  timers.clear();
  try {
    await body();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL: ${name}: ${error.message}`);
  }
}

await test("Ignored native setters return a failed confirmation, not accepted", async () => {
  const target = track("disabled", { ignore: true });
  const result = selectVidaaTextTrack([target], 0);
  await advance();
  assert.equal(await result, false);
  assert.ok(
    target.writes.length <= 4,
    "Retry only the pending enable, without repeated disable/enable pairs"
  );
  assert.equal(timers.size, 0);
});
await test("Readonly OFF still disables writable outputs and cannot report success", async () => {
  const fixed = track("showing", { readonly: true });
  const writable = track("showing");
  const result = selectVidaaTextTrack([fixed, writable], -1);
  await advance();
  assert.equal(await result, false);
  assert.equal(writable.mode, "disabled");
});
await test("Invalidated subtitle ownership prevents every deferred mode write", async () => {
  const target = track("disabled", { ignore: true });
  let current = true;
  const result = selectVidaaTextTrack([target], 0, { isCurrent: () => current });
  const writesBefore = target.writes.length;
  current = false;
  target.setWritable(true);
  await advance();
  assert.equal(await result, false);
  assert.equal(target.writes.length, writesBefore);
  assert.equal(
    target.mode,
    "disabled",
    "A late retry cannot enable native text over an app overlay"
  );
});
await test("A new source on the same video cancels native retries even without a new play token", async () => {
  const target = track("disabled", { ignore: true });
  const owner = controller([target]);
  const result = owner.setNativeTextTrack(0);
  const writesBefore = target.writes.length;
  owner.video.src = "fixture-b";
  target.setWritable(true);
  await advance();
  assert.equal(await result, false);
  assert.equal(target.writes.length, writesBefore);
  assert.equal(target.mode, "disabled");
});
await test("Video replacement and playback invalidation stop writing to old tracks", async () => {
  for (const invalidate of [
    (owner) => {
      owner.video = { src: "fixture-b", textTracks: [] };
    },
    (owner) => {
      owner.playRequestToken++;
    }
  ]) {
    const target = track("disabled", { ignore: true });
    const owner = controller([target]);
    const result = owner.setNativeTextTrack(0);
    const writesBefore = target.writes.length;
    invalidate(owner);
    target.setWritable(true);
    await advance();
    assert.equal(await result, false);
    assert.equal(target.writes.length, writesBefore);
  }
});
await test("Delayed native readback does not repeatedly disable an enabled target", async () => {
  const target = track("disabled", { delay: 180 });
  const result = selectVidaaTextTrack([target], 0);
  await advance();
  assert.equal(await result, true);
  const firstEnable = target.writes.findIndex((write) => write.mode === "showing");
  assert.ok(firstEnable >= 0);
  assert.ok(target.writes.slice(firstEnable).every((write) => write.mode === "showing"));
});
await test("Already applied selections avoid a native renderer restart", async () => {
  const target = track("showing");
  const other = track("disabled");
  assert.equal(selectVidaaTextTrack([target, other], 0), true);
  assert.equal(target.writes.length + other.writes.length, 0);
});
await test("Retry targets the same track object after list reordering", async () => {
  const target = track("disabled", { ignore: true });
  const other = track("disabled");
  let tracks = [target, other];
  const result = selectVidaaTextTrack(tracks, 0, { getTracks: () => tracks });
  tracks = [other, target];
  target.setWritable(true);
  await advance();
  assert.equal(await result, true);
  assert.equal(target.mode, "showing");
  assert.equal(other.mode, "disabled");
});
await test("Removed target objects cannot be enabled by a deferred retry", async () => {
  const target = track("disabled", { ignore: true });
  let tracks = [target];
  const result = selectVidaaTextTrack(tracks, 0, { getTracks: () => tracks });
  const writesBefore = target.writes.length;
  tracks = [];
  target.setWritable(true);
  await advance();
  assert.equal(await result, false);
  assert.equal(target.writes.length, writesBefore);
});
await test("A newer OFF request cancels retries and leaves only disabled tracks", async () => {
  const target = track("disabled", { ignore: true });
  const selection = selectVidaaTextTrack([target], 0);
  target.setWritable(true);
  const off = selectVidaaTextTrack([target], -1);
  await advance();
  assert.equal(await off, true);
  assert.equal(await selection, false);
  assert.equal(target.mode, "disabled");
});

function mountedScreen(target, native = track("disabled")) {
  const nodes = [];
  const element = {
    src: "fixture-mounted",
    get textTracks() {
      return [native, ...nodes.map((node) => node.track)];
    },
    appendChild(node) {
      nodes.push(node);
    }
  };
  Object.assign(PlayerController, {
    video: element,
    playRequestToken: 1,
    avplayActive: false,
    playbackEngine: "native"
  });
  Platform.current = null;
  const ui = {
    ...PlayerScreen,
    playerMountToken: 1,
    subtitleSelectionToken: 1,
    selectedSubtitleTrackIndex: -1,
    selectedAddonSubtitleId: null,
    externalTrackNodes: [],
    externalSubtitleObjectUrls: [],
    builtInSubtitleCount: 1,
    subtitles: [],
    getTextTracks: () => element.textTracks,
    applyTvHtmlAddonSubtitle: async () => false,
    fetchSubtitleRawBody: async () => ({ body: null, sourceUrl: "blob:fixture-subtitle" }),
    disableEmbeddedSubtitleSelection() {},
    clearMountedExternalSubtitleTracks() {
      this.externalTrackNodes = [];
      nodes.splice(0);
    },
    setSelectedAddonSubtitle(subtitle) {
      this.selectedAddonSubtitleId = subtitle.id;
    },
    syncTrackState() {},
    invalidateTrackDialogCaches() {},
    refreshSubtitleCueStyles() {},
    refreshTrackDialogs() {},
    renderControlButtons() {},
    renderSubtitleDialog() {}
  };
  const node = new EventTarget();
  Object.assign(node, { track: target, setAttribute() {} });
  document.createElement = () => node;
  return { ui, element, node, native };
}
await test("Mounted native fallback waits for delayed readback without disable/enable restarts", async () => {
  const target = track("disabled", { delay: 180 });
  const { ui } = mountedScreen(target);
  const result = ui.applyFallbackAddonSubtitle(0, 1, {
    id: "external",
    url: "blob:fixture-subtitle",
    lang: "it"
  });
  for (let flush = 0; flush < 10; flush++) await Promise.resolve();
  await advance(700);
  assert.equal(await result, true);
  const firstEnable = target.writes.findIndex((write) => write.mode === "showing");
  assert.ok(firstEnable >= 0);
  assert.ok(target.writes.slice(firstEnable).every((write) => write.mode === "showing"));
  assert.equal(ui.selectedAddonSubtitleId, "external");
  assert.equal(ui.selectedSubtitleTrackIndex, 1);
  assert.equal(timers.size, 0);
});
await test("Mounted activation is idempotent and commits only an exclusive showing target", async () => {
  const target = track("showing");
  const { ui, element, node } = mountedScreen(target);
  element.appendChild(node);
  assert.equal(ui.activateMountedExternalSubtitleTrack(node), true);
  assert.equal(ui.activateMountedExternalSubtitleTrack(node), true);
  await advance(1000);
  assert.equal(ui.activateMountedExternalSubtitleTrack(node), true);
  assert.equal(target.writes.length, 0);
  const blocked = track("showing", { readonly: true });
  const blockedTarget = track("hidden");
  const fixture = mountedScreen(blockedTarget, blocked);
  fixture.element.appendChild(fixture.node);
  assert.equal(fixture.ui.activateMountedExternalSubtitleTrack(fixture.node), false);
  assert.equal(blockedTarget.mode, "hidden");
  assert.equal(fixture.ui.selectedSubtitleTrackIndex, -1);
});
await test("Mounted retries stop on selection or source replacement", async () => {
  for (const invalidate of [
    ({ ui }) => {
      ui.subtitleSelectionToken++;
    },
    ({ element }) => {
      element.src = "fixture-new-source";
    }
  ]) {
    const target = track("hidden", { ignore: true });
    const fixture = mountedScreen(target);
    fixture.element.appendChild(fixture.node);
    fixture.ui.externalTrackNodes.push(fixture.node);
    assert.equal(fixture.ui.activateMountedExternalSubtitleTrack(fixture.node), false);
    const before = target.writes.length;
    invalidate(fixture);
    target.setWritable(true);
    await advance(300);
    assert.equal(fixture.ui.activateMountedExternalSubtitleTrack(fixture.node), false);
    assert.equal(target.writes.length, before);
  }
});

assert.deepEqual(failures, [], `${failures.length} native subtitle retry regressions`);
console.log(`PASS: ${passed} VIDAA native subtitle retry cases.`);
