import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.fetch = async () => { throw new Error("Unexpected network request"); };

class OverlayNode {
  constructor() {
    this.childNodes = [];
    this.attributes = new Map();
    this.classes = new Set();
    this.style = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name)
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  set textContent(value) { this.text = value; this.childNodes = []; }
  get textContent() { return this.text || this.childNodes.map((node) => node.textContent).join(""); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(node) { this.childNodes.push(node); }
  replaceChildren() { this.childNodes = []; this.text = ""; }
}

globalThis.document = {
  getElementById: () => null,
  documentElement: {},
  createElement: () => new OverlayNode(),
  head: { appendChild() { throw new Error("Unexpected script load"); } }
};

const { PlayerController } = await import("../js/core/player/playerController.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { Platform } = await import("../js/platform/index.js");
let timerId = 0;
const timers = new Map();
globalThis.setTimeout = (callback) => { const id = ++timerId; timers.set(id, callback); return id; };
globalThis.clearTimeout = (id) => timers.delete(id);
const frames = [];
globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };

function createScreen(tracks, { itemOnly = false } = {}) {
  Platform.current = null;
  const textTracks = { length: tracks.length, item: (index) => tracks[index] };
  if (!itemOnly) tracks.forEach((track, index) => { textTracks[index] = track; });
  const video = new EventTarget();
  Object.assign(video, { textTracks, audioTracks: [], currentTime: 3, paused: false });
  Object.assign(PlayerController, {
    video, playbackEngine: "native", avplayActive: false, hlsInstance: null,
    dashInstance: null, nativeMediaId: "", avplayTrackInfo: [], isPlaying: true,
    selectedWebOsEmbeddedSubtitleTrackIndex: -1,
    playRequestToken: Number(PlayerController.playRequestToken || 0) + 1
  });
  return {
    ...PlayerScreen,
    playerMountToken: 1, activePlaybackUrl: "fixture-video", subtitles: [],
    externalTrackNodes: [], externalSubtitleObjectUrls: [], subtitleSelectionToken: 0,
    subtitleDelayMs: 0, subtitleRenderMode: "native", selectedAudioTrackIndex: 0,
    selectedSubtitleTrackIndex: 0, selectedEmbeddedSubtitleTrackIndex: -1,
    selectedAddonSubtitleId: null, selectedManifestSubtitleTrackId: null,
    htmlSubtitleCues: [], htmlSubtitleActiveCueKey: "", htmlSubtitleSelectedId: null,
    uiRefs: { htmlSubtitles: new OverlayNode() },
    getPlaybackCurrentSeconds: () => video.currentTime,
    shouldUseEmbeddedSubtitleTracks: () => false,
    disableEmbeddedSubtitleSelection() {},
    invalidateTrackDialogCaches() {}, refreshSubtitleCueStyles() {},
    renderControlButtons() {}, renderSubtitleDialog() {},
    resetSubtitleDelayAfterSelectionChange() {}, getSubtitleRequestHeaders: () => ({})
  };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

for (const [format, body, contentType] of [
  ["VTT", "WEBVTT\n\n00:00:02.500 --> 00:00:03.500\nCiao, mondo\nSeconda riga", "text/vtt"],
  ["SRT", "1\n00:00:02,500 --> 00:00:03,500\nCiao, mondo\nSeconda riga", "application/x-subrip"]
]) {
  test(`default VIDAA ${format} paints real DOM without a native track decoder`, async () => {
    const track = { mode: "showing" };
    const ui = createScreen([track]);
    ui.subtitles = [{ id: "it", url: `fixture.${format.toLowerCase()}`, lang: "it" }];
    let fetches = 0;
    ui.fetchSubtitleRawBody = async () => { fetches++; return { body, contentType }; };
    assert.equal(await ui.applySubtitleEntry({ fallbackAddonSubtitle: true, subtitleIndex: 0 }), true);
    const overlay = ui.uiRefs.htmlSubtitles;
    assert.equal(fetches, 1);
    assert.equal(ui.externalTrackNodes.length, 0, "No unverified native external track is mounted");
    assert.equal(track.mode, "disabled");
    assert.equal(overlay.classList.contains("hidden"), false);
    assert.equal(overlay.getAttribute("aria-hidden"), "false");
    assert.equal(overlay.childNodes[0].childNodes.length, 2);
    assert.match(overlay.textContent, /Ciao, mondo/);
    assert.match(overlay.textContent, /Seconda riga/);
    ui.subtitleDelayMs = 1000;
    ui.renderHtmlSubtitleOverlayAtCurrentTime();
    assert.equal(overlay.classList.contains("hidden"), true);
    ui.subtitleDelayMs = 0;
    PlayerController.video.currentTime = 3.1;
    ui.renderHtmlSubtitleOverlayAtCurrentTime();
    assert.equal(overlay.classList.contains("hidden"), false);
    assert.equal(await ui.applySubtitleEntry({ trackIndex: -1 }), true);
    assert.equal(overlay.childNodes.length, 0);
    assert.equal(overlay.getAttribute("aria-hidden"), "true");
    assert.equal(timers.size, 0, "OFF stops the overlay clock");
  });
}

test("item-only native text tracks expose cues to rendering and timing", () => {
  const track = { mode: "showing", cues: [{ startTime: 2, endTime: 4, text: "Ciao" }] };
  const ui = createScreen([track], { itemOnly: true });
  assert.deepEqual(ui.getSubtitleCueTrackList(), [track]);
  ui.syncSubtitleCueStylesForTrack(track);
  ui.subtitleDelayMs = 1000;
  ui.syncSubtitleCueStylesForTrack(track);
  assert.equal(track.cues[0].startTime, 3);
  assert.equal(track.cues[0].endTime, 5);
});

test("native cue refresh restores the current showing track", () => {
  const track = { mode: "showing" };
  const ui = createScreen([track]);
  ui.refreshSubtitleTrackRendering();
  assert.equal(track.mode, "hidden");
  frames.shift()();
  assert.equal(track.mode, "showing");
});

for (const action of ["OFF", "another track", "stream replacement", "HTML ownership"]) {
  test(`queued cue refresh cannot revive native text after ${action}`, async () => {
    const tracks = [{ mode: "showing" }, { mode: "disabled" }];
    const ui = createScreen(tracks);
    ui.refreshSubtitleTrackRendering();
    assert.equal(tracks[0].mode, "hidden");
    if (action === "OFF") await ui.applySubtitleEntry({ trackIndex: -1 });
    if (action === "another track") await ui.applySubtitleEntry({ trackIndex: 1 });
    if (action === "stream replacement") PlayerController.playRequestToken++;
    if (action === "HTML ownership") ui.htmlSubtitleSelectedId = "fixture-overlay";
    frames.shift()();
    assert.notEqual(tracks[0].mode, "showing");
    assert.equal(tracks.filter((track) => track.mode === "showing").length, action === "another track" ? 1 : 0);
  });
}

let failed = 0;
for (const { name, run } of tests) {
  timers.clear();
  frames.length = 0;
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
}
console.log(`${tests.length - failed}/${tests.length} VIDAA subtitle rendering fixtures passed; real TV display remains unverified.`);
if (failed) process.exitCode = 1;
