import assert from "node:assert/strict";

// The fixtures exercise the production methods, with no media or real services.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.fetch = async () => {
  throw new Error("Unexpected network request");
};
globalThis.document = {
  getElementById: () => null,
  documentElement: {},
  createElement: () => new TrackNode(),
  head: {
    appendChild: () => {
      throw new Error("Unexpected script load");
    }
  }
};

const { PlayerController } = await import("../js/core/player/playerController.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { Platform } = await import("../js/platform/index.js");
const { resetAssSubtitleLibCache } = await import("../js/core/player/assSubtitleLoader.js");
const { createPlayerVideoEventHandlers } =
  await import("../js/ui/screens/player/playerVideoEventHandlers.js");
const controllerMethods = { ...PlayerController };
const noFetch = globalThis.fetch;
const defaultCreateElement = document.createElement;
const defaultAppendScript = document.head.appendChild;

let now = 0;
let nextTimer = 0;
const timers = new Map();
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++nextTimer;
  timers.set(id, { callback, time: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);

async function drain() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function advance(ms = 2000) {
  const until = now + ms;
  await drain();
  let count = 0;
  while (true) {
    const due = [...timers]
      .filter(([, timer]) => timer.time <= until)
      .sort((a, b) => a[1].time - b[1].time)[0];
    if (!due) break;
    assert.ok(++count < 100, "Timers must be bounded");
    const [id, timer] = due;
    timers.delete(id);
    now = timer.time;
    timer.callback();
    await drain();
  }
  now = until;
  await drain();
}
async function settle(result) {
  await advance(3000);
  return await result;
}

function list(tracks, itemOnly = false) {
  const result = new EventTarget();
  Object.assign(result, { length: tracks.length, item: (index) => tracks[index] });
  if (!itemOnly)
    tracks.forEach((track, index) => {
      result[index] = track;
    });
  return result;
}
function flags(key, initial, behavior = "mutable") {
  let value = initial;
  return Object.defineProperty({}, key, {
    enumerable: true,
    get: () => value,
    set: (next) => {
      if (behavior === "throw") throw new Error("readonly");
      if (behavior === "noop") return;
      if (behavior === "async" || typeof behavior === "number")
        setTimeout(
          () => {
            value = next;
          },
          behavior === "async" ? 180 : behavior
        );
      else value = next;
    }
  });
}
class TrackNode extends EventTarget {
  constructor(track = flags("mode", "disabled")) {
    super();
    this.track = track;
  }
  setAttribute() {}
  remove() {
    this.parent?.nodes.splice(this.parent.nodes.indexOf(this), 1);
  }
}
function video(audio = [], text = [], itemOnly = false) {
  const result = new EventTarget();
  Object.assign(result, {
    audioTracks: list(audio, itemOnly),
    nodes: [],
    currentTime: 3,
    paused: false,
    appendChild(node) {
      node.parent = this;
      this.nodes.push(node);
    }
  });
  Object.defineProperty(result, "textTracks", {
    get: () => list([...text, ...result.nodes.map((node) => node.track)], itemOnly)
  });
  return result;
}
function useVideo(element, platform = "vidaa") {
  globalThis.__NUVIO_PLATFORM__ = platform;
  Platform.current = null;
  Object.assign(PlayerController, {
    video: element,
    playbackEngine: "native",
    avplayActive: false,
    hlsInstance: null,
    dashInstance: null,
    nativeMediaId: "",
    avplayTrackInfo: [],
    selectedWebOsEmbeddedSubtitleTrackIndex: -1,
    playRequestToken: Number(PlayerController.playRequestToken || 0) + 1
  });
}
function screen() {
  return {
    ...PlayerScreen,
    playerMountToken: 1,
    activePlaybackUrl: "fixture-video",
    subtitles: [],
    externalTrackNodes: [],
    externalSubtitleObjectUrls: [],
    subtitleSelectionToken: 0,
    subtitleDelayMs: 0,
    selectedAudioTrackIndex: 0,
    selectedSubtitleTrackIndex: 0,
    selectedEmbeddedAudioTrackIndex: -1,
    selectedEmbeddedSubtitleTrackIndex: -1,
    selectedAddonSubtitleId: null,
    selectedManifestSubtitleTrackId: null,
    uiRefs: {},
    htmlSubtitleCues: [],
    subtitleAutoSyncLoadToken: 0,
    shouldUseEmbeddedSubtitleTracks: () => false,
    disableEmbeddedSubtitleSelection() {},
    refreshTrackDialogs() {
      this.syncTrackState();
    },
    invalidateTrackDialogCaches() {},
    refreshSubtitleCueStyles() {},
    renderControlButtons() {},
    renderSubtitleDialog() {},
    renderAudioDialog() {},
    renderSubtitleTimingDialog() {},
    isAudioEntryPending: () => false,
    getAudioTrackPreference: () => ({ language: "it" }),
    rememberAudioTrackSelection(preference) {
      this.rememberedAudio = preference;
    },
    resetSubtitleDelayAfterSelectionChange() {},
    getAudioEntries() {
      return this.getAudioTracks().map((track, audioTrackIndex) => ({ track, audioTrackIndex }));
    },
    getSubtitleRequestHeaders: () => ({})
  };
}
const assBody =
  "[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.25,0:00:03.50,Default,,0,0,0,,Ciao, mondo\\NSeconda riga";
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("item-only enumeration and text OFF use the real controller", async () => {
  useVideo(video([{ enabled: true }, { enabled: false }], [{ mode: "showing" }], true));
  assert.equal(PlayerController.nativeAudioTrackListToArray().length, 2);
  assert.equal(await settle(PlayerController.setNativeTextTrack(-1)), true);
  assert.equal(PlayerController.video.textTracks.item(0).mode, "disabled");
});
test("readonly audio is not confirmed by controller or UI", async () => {
  useVideo(video([flags("enabled", true, "noop"), flags("enabled", false, "noop")]));
  assert.equal(await settle(PlayerController.setNativeAudioTrack(1)), false);
  const ui = screen();
  await settle(ui.applyAudioTrack(1, { rememberSelection: true }));
  assert.equal(ui.selectedAudioTrackIndex, 0);
});
test("readonly text selection and OFF do not produce a false UI confirmation", async () => {
  useVideo(video([], [flags("mode", "showing", "noop"), flags("mode", "disabled", "noop")]));
  const ui = screen();
  await settle(ui.applySubtitleEntry({ trackIndex: 1 }));
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
});
test("mounted external activation checks actual mode", async () => {
  const target = flags("mode", "disabled", "noop");
  useVideo(video([], [{ mode: "disabled" }, target]));
  const ui = screen();
  assert.equal(ui.activateMountedExternalSubtitleTrack(new TrackNode(target)), false);
});
test("ASS activation retires native text and OFF destroys the adapter", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  let destroys = 0;
  globalThis.ResizeObserver = class {};
  globalThis.ASS = class {
    destroy() {
      destroys++;
    }
  };
  ui.uiRefs.assSubtitles = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    replaceChildren() {}
  };
  ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
  await settle(ui.applyFallbackAddonSubtitle(0, 0, { id: "ass", url: "fixture.ass" }));
  assert.equal(ui.isAssAddonSubtitleActive(), true);
  assert.equal(ui.getTextTracks()[0].mode, "disabled");
  await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
  assert.equal(ui.isAssAddonSubtitleActive(), false);
  assert.equal(destroys, 1);
  delete globalThis.ASS;
});
test("Auto Sync loads and converts ASS through the existing parser", async () => {
  const ui = screen();
  const selected = { id: "ass", url: "fixture.ass" };
  ui.getSelectedAddonSubtitle = () => selected;
  globalThis.fetch = async (url) => {
    assert.equal(url, "fixture.ass");
    return new Response(assBody, { headers: { "content-type": "text/x-ass; charset=utf-8" } });
  };
  await settle(ui.loadSubtitleAutoSyncCues());
  assert.deepEqual(
    ui.subtitleAutoSyncCues.map(({ startTimeMs, endTimeMs, text }) => ({
      startTimeMs,
      endTimeMs,
      text
    })),
    [{ startTimeMs: 1250, endTimeMs: 3500, text: "Ciao, mondo\nSeconda riga" }]
  );
});

test("indexed, iterable and item-only audio/text lists select and turn OFF", async () => {
  for (const itemOnly of [false, true]) {
    const audio = [{ enabled: true }, { enabled: false }];
    const text = [{ mode: "showing" }, { mode: "disabled" }];
    useVideo(video(audio, text, itemOnly));
    assert.deepEqual(PlayerController.nativeAudioTrackListToArray(), audio);
    assert.equal(await settle(PlayerController.setNativeAudioTrack(1)), true);
    assert.deepEqual(
      audio.map((track) => track.enabled),
      [false, true]
    );
    assert.equal(await settle(PlayerController.setNativeTextTrack(1)), true);
    assert.deepEqual(
      text.map((track) => track.mode),
      ["disabled", "showing"]
    );
    assert.equal(await settle(PlayerController.setNativeTextTrack(-1)), true);
    assert.deepEqual(
      text.map((track) => track.mode),
      ["disabled", "disabled"]
    );
  }
  const audio = [{ selected: true }, { selected: false }];
  useVideo(video());
  PlayerController.video.audioTracks = {
    length: 2,
    *[Symbol.iterator]() {
      yield* audio;
    }
  };
  assert.deepEqual(PlayerController.nativeAudioTrackListToArray(), audio);
  assert.equal(await settle(PlayerController.setNativeAudioTrack(1)), true);
});
test("enumeration tolerates throwing indexed access and item access", async () => {
  useVideo(video());
  const target = { enabled: false };
  PlayerController.video.audioTracks = {
    length: 2,
    get 0() {
      throw new Error("inaccessible indexed track");
    },
    item(index) {
      if (index === 1) throw new Error("inaccessible item");
      return target;
    }
  };
  assert.deepEqual(PlayerController.nativeAudioTrackListToArray(), [target]);
  assert.equal(await settle(PlayerController.setNativeAudioTrack(0)), true);
});
test("invalid indices cannot be confirmed; empty text OFF succeeds", async () => {
  useVideo(video([{ enabled: true }], [{ mode: "showing" }]));
  for (const index of [-2, 0.5, 1, NaN, Infinity]) {
    assert.equal(await settle(PlayerController.setNativeAudioTrack(index)), false);
    assert.equal(await settle(PlayerController.setNativeTextTrack(index)), false);
  }
  assert.equal(await settle(PlayerController.setNativeAudioTrack(-1)), false);
  useVideo(video());
  assert.equal(await settle(PlayerController.setNativeAudioTrack(0)), false);
  const ui = screen();
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("readonly exceptions still disable the remaining text outputs", async () => {
  const tracks = [flags("mode", "showing", "throw"), { mode: "showing" }];
  useVideo(video([], tracks));
  assert.equal(await settle(PlayerController.setNativeTextTrack(-1)), false);
  assert.equal(tracks[1].mode, "disabled");
  const ui = screen();
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), false);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
});
test("UI audio/text fallback can succeed after the real controller sees no list", async () => {
  const element = video(
    [{ enabled: true }, { enabled: false }],
    [{ mode: "showing" }, { mode: "disabled" }],
    true
  );
  useVideo(element);
  const ui = screen();
  PlayerController.nativeAudioTrackListToArray = () => [];
  assert.equal(await settle(ui.applyAudioTrack(1, { rememberSelection: true })), true);
  assert.equal(ui.selectedAudioTrackIndex, 1);
  assert.deepEqual(ui.rememberedAudio, { language: "it" });
  // A rejected request must leave the UI fallback usable for selection and OFF.
  PlayerController.setNativeTextTrack = () => false;
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: 1 })), true);
  assert.equal(ui.selectedSubtitleTrackIndex, 1);
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("desired audio preference survives an unconfirmed request", async () => {
  useVideo(video([flags("selected", true, "throw"), flags("selected", false, "noop")]));
  const ui = screen();
  assert.equal(await settle(ui.applyAudioTrack(1, { rememberSelection: true })), false);
  assert.equal(ui.requestedAudioTrackIndex, 1);
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.deepEqual(ui.rememberedAudio, { language: "it" });
  ui.syncTrackState();
  assert.equal(ui.selectedAudioTrackIndex, 0);
});
test("asynchronous native setters remain pending until their flags confirm", async () => {
  const text = [flags("mode", "showing", "async"), flags("mode", "disabled", "async")];
  useVideo(video([flags("enabled", true, "async"), flags("enabled", false, "async")], text));
  const ui = screen();
  const audioResult = ui.applyAudioTrack(1);
  const textResult = ui.applySubtitleEntry({ trackIndex: 1 });
  await drain();
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  assert.equal(ui.requestedSubtitleEntry.trackIndex, 1);
  await advance(200);
  assert.equal(await audioResult, true);
  assert.equal(await textResult, true);
  assert.equal(ui.selectedAudioTrackIndex, 1);
  assert.equal(ui.selectedSubtitleTrackIndex, 1);
  ui.syncTrackState();
  assert.equal(ui.selectedSubtitleTrackIndex, 1);
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
});
test("superseded audio/text confirmations do not overwrite the new selection", async () => {
  useVideo(
    video(
      [flags("enabled", true, "async"), flags("enabled", false, "async")],
      [flags("mode", "showing", "async"), flags("mode", "disabled", "async")]
    )
  );
  const ui = screen();
  const oldAudio = ui.applyAudioTrack(1);
  const oldText = ui.applySubtitleEntry({ trackIndex: 1 });
  await advance(100);
  const currentAudio = ui.applyAudioTrack(0);
  const currentText = ui.applySubtitleEntry({ trackIndex: -1 });
  await advance(700);
  assert.equal(await oldAudio, false);
  assert.equal(await oldText, false);
  await currentAudio;
  assert.equal(await currentText, true);
  ui.syncTrackState();
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("stream replacement and controller reset retire pending confirmation", async () => {
  useVideo(
    video(
      [flags("enabled", true, "noop"), flags("enabled", false, "noop")],
      [flags("mode", "showing", "noop")]
    )
  );
  const ui = screen();
  const audio = ui.applyAudioTrack(1);
  const text = ui.applySubtitleEntry({ trackIndex: -1 });
  await drain();
  ui.playerMountToken++;
  PlayerController.resetNativeMediaState();
  useVideo(video([{ enabled: true }], [{ mode: "showing" }]));
  await advance();
  assert.equal(await audio, false);
  assert.equal(await text, false);
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  assert.equal(timers.size, 0);
});
test("shared browser and Tizen native methods confirm mutable tracks", async () => {
  for (const platform of ["browser", "tizen", "webos"]) {
    useVideo(
      video([{ enabled: true }, { enabled: false }], [{ mode: "showing" }, { mode: "disabled" }]),
      platform
    );
    if (platform === "webos") PlayerController.playbackEngine = "hls.js";
    const ui = screen();
    assert.equal(await settle(ui.applyAudioTrack(1)), true);
    assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: 1 })), true);
    assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
    ui.syncTrackState();
    assert.equal(ui.selectedAudioTrackIndex, 1);
    assert.equal(ui.selectedSubtitleTrackIndex, -1);
  }
});
test("webOS text commands are awaited and a delayed selection cannot undo OFF", async () => {
  const element = video([], [flags("mode", "showing", "noop"), flags("mode", "disabled", "noop")]);
  element.mediaId = "fixture-media";
  useVideo(element, "webos");
  const commands = [];
  PlayerController.requestWebOsMediaCommand = async (method, params) => {
    commands.push({ method, ...params });
    return { returnValue: true };
  };
  const selection = PlayerController.setNativeTextTrack(1);
  await advance(100);
  assert.equal(
    PlayerController.selectedWebOsSubtitleTrackIndex,
    1,
    "Desired selection is retained"
  );
  const off = PlayerController.setNativeTextTrack(-1);
  await advance(500);
  assert.equal(await off, true);
  assert.equal(await selection, false);
  assert.equal(
    commands.some((command) => command.method === "selectTrack"),
    false
  );
  assert.equal(commands.at(-1).enable, false);
});
test("webOS command rejection falls back to real modes without confirming readonly OFF", async () => {
  const element = video([], [flags("mode", "showing", "noop")]);
  element.mediaId = "fixture-media";
  useVideo(element, "webos");
  PlayerController.requestWebOsMediaCommand = async () => ({ returnValue: false });
  const ui = screen();
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), false);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
});
test("external activation requires the target and exclusion of other outputs", async () => {
  const native = flags("mode", "showing", "noop");
  const target = { mode: "hidden" };
  useVideo(video([], [native, target]));
  const ui = screen();
  assert.equal(ui.activateMountedExternalSubtitleTrack(new TrackNode(target)), false);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  assert.equal(ui.activateMountedExternalSubtitleTrack(new TrackNode({ mode: "disabled" })), false);
});
test("external activation never selects a builtin track before the addon appears", async () => {
  useVideo(video([], [{ mode: "disabled" }]));
  const ui = screen();
  ui.builtInSubtitleCount = 1;
  const node = new TrackNode(null);
  assert.equal(ui.activateMountedExternalSubtitleTrack(node), false);
  const external = { mode: "disabled" };
  PlayerController.video.appendChild(new TrackNode(external));
  assert.equal(ui.activateMountedExternalSubtitleTrack(node), true);
  assert.equal(external.mode, "showing");
});
test("Blob/data/direct subtitle URLs remain usable and commit only after activation", async () => {
  for (const url of ["blob:fixture", "data:text/vtt,WEBVTT", "fixture-direct.vtt"]) {
    useVideo(video([], [{ mode: "showing" }]));
    const ui = screen();
    const subtitle = { id: url, url };
    if (url === "fixture-direct.vtt")
      ui.fetchSubtitleRawBody = async () => {
        throw new Error("CORS fixture");
      };
    const result = ui.applySubtitleEntry({
      fallbackAddonSubtitle: true,
      subtitleIndex: 0,
      track: subtitle
    });
    await drain();
    assert.equal(ui.selectedAddonSubtitleId, null);
    const node = ui.externalTrackNodes[0];
    assert.equal(node.src, url);
    assert.equal(node.default, false);
    node.dispatchEvent(new Event("load"));
    await drain();
    assert.equal(await result, true);
    assert.equal(ui.selectedAddonSubtitleId, url);
    assert.equal(ui.getTextTracks()[0].mode, "disabled");
    assert.equal(node.track.mode, "showing");
    assert.equal(timers.size, 0);
    ui.syncTrackState();
    assert.equal(ui.selectedSubtitleTrackIndex, 1);
    assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
    assert.equal(ui.externalTrackNodes.length, 0);
    node.dispatchEvent(new Event("load"));
    assert.equal(ui.selectedAddonSubtitleId, null);
  }
});
test("failed external activation is bounded, cleans up and leaves native state honest", async () => {
  useVideo(video([], [flags("mode", "showing", "noop")]));
  const ui = screen();
  const result = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "blob:fixture" }
  });
  assert.equal(await settle(result), false);
  assert.equal(ui.selectedAddonSubtitleId, null);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  assert.equal(ui.externalTrackNodes.length, 0);
  assert.equal(timers.size, 0);
});
test("OFF during external activation retires timer, listeners and pending result", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  const result = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "blob:fixture" }
  });
  await drain();
  const node = ui.externalTrackNodes[0];
  const off = ui.applySubtitleEntry({ trackIndex: -1 });
  await drain();
  assert.equal(await result, false);
  assert.equal(await off, true);
  node.dispatchEvent(new Event("load"));
  assert.equal(timers.size, 0);
  assert.equal(ui.selectedAddonSubtitleId, null);
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("a stale non-ASS fetch creates neither a Blob URL nor a mounted track", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  let resolveFetch;
  ui.fetchSubtitleRawBody = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  const result = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "fixture.vtt" }
  });
  await drain();
  await ui.applySubtitleEntry({ trackIndex: -1 });
  resolveFetch({ body: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello", contentType: "text/vtt" });
  await drain();
  assert.equal(await result, false);
  assert.equal(ui.externalSubtitleObjectUrls.length, 0);
  assert.equal(ui.externalTrackNodes.length, 0);
});
test("ASS library loading is real, delay uses seconds, and VTT to ASS to OFF is exclusive", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  const container = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    replaceChildren() {}
  };
  ui.uiRefs.assSubtitles = container;
  const vttResult = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "blob:fixture" }
  });
  await settle(vttResult);
  assert.equal(ui.getTextTracks().filter((track) => track.mode === "showing").length, 1);
  const instances = [];
  const scripts = [];
  globalThis.ResizeObserver = class {};
  document.createElement = (tag) => (tag === "script" ? {} : new TrackNode());
  document.head.appendChild = (script) => {
    scripts.push(script.src);
    globalThis.ASS = class {
      constructor(body, element, options) {
        assert.equal(body, assBody);
        assert.equal(element, PlayerController.video);
        assert.equal(options.container, container);
        instances.push(this);
      }
      destroy() {
        this.destroyed = true;
      }
    };
    script.onload();
  };
  ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
  const assResult = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "ass", url: "fixture.ass" }
  });
  assert.equal(await settle(assResult), true);
  assert.deepEqual(scripts, ["assets/libs/ass.min.js"]);
  assert.equal(ui.externalTrackNodes.length, 0);
  assert.equal(
    ui.getTextTracks().every((track) => track.mode === "disabled"),
    true
  );
  ui.subtitleDelayMs = 1250;
  assert.equal(ui.assSubtitleRenderer.setDelay(1250), true);
  assert.equal(instances[0].delay, 1.25);
  PlayerController.video.currentTime = 50;
  ui.assSubtitleRenderer.setDelay(-500);
  assert.equal(instances[0].delay, -0.5);
  await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
  assert.equal(instances[0].destroyed, true);
  assert.equal(ui.isAssAddonSubtitleActive(), false);
  ui.syncTrackState();
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("unavailable ASS renderer preserves conversion to clocked HTML VTT and OFF cleanup", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  ui.uiRefs.assSubtitles = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    replaceChildren() {}
  };
  globalThis.ResizeObserver = undefined;
  globalThis.ASS = class {};
  ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
  assert.equal(
    await settle(
      ui.applySubtitleEntry({
        fallbackAddonSubtitle: true,
        track: { id: "ass", url: "fixture.ass" }
      })
    ),
    true
  );
  assert.equal(ui.isAssAddonSubtitleActive(), false);
  assert.equal(ui.externalSubtitleObjectUrls.length, 0);
  assert.equal(ui.htmlSubtitleCues[0].start, 1.25);
  assert.equal(ui.htmlSubtitleCues[0].end, 3.5);
  assert.ok(ui.htmlSubtitleCues[0].text.includes("Ciao, mondo"));
  await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(ui.externalSubtitleObjectUrls.length, 0);
});
test("ASS cannot activate while native OFF is readonly", async () => {
  useVideo(video([], [flags("mode", "showing", "noop")]));
  const ui = screen();
  globalThis.ASS = class {
    constructor() {
      throw new Error("Must not construct concurrent output");
    }
  };
  ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
  assert.equal(
    await settle(
      ui.applySubtitleEntry({
        fallbackAddonSubtitle: true,
        track: { id: "ass", url: "fixture.ass" }
      })
    ),
    false
  );
  assert.equal(ui.isAssAddonSubtitleActive(), false);
  assert.equal(ui.getTextTracks()[0].mode, "showing");
  assert.equal(ui.selectedAddonSubtitleId, null);
});
test("stale ASS initialization cannot clear or select a newer renderer", async () => {
  useVideo(video([], [{ mode: "disabled" }]));
  const ui = screen();
  ui.uiRefs.assSubtitles = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    replaceChildren() {}
  };
  globalThis.ResizeObserver = class {};
  let script;
  document.createElement = () => ({});
  document.head.appendChild = (node) => {
    script = node;
  };
  const oldResult = ui.applyAssSubtitleBody({ body: assBody, selectionToken: 0 });
  await drain();
  ui.subtitleSelectionToken = 1;
  let constructed = 0;
  globalThis.ASS = class {
    constructor() {
      constructed++;
    }
    destroy() {}
  };
  const newResult = ui.applyAssSubtitleBody({ body: assBody, selectionToken: 1 });
  assert.equal((await newResult).applied, true);
  script.onload();
  assert.equal((await oldResult).applied, false);
  assert.equal(constructed, 1);
  assert.equal(ui.isAssAddonSubtitleActive(), true);
  ui.destroyAssSubtitleRenderer();
});
test("Auto Sync preserves VTT/SRT and ignores superseded ASS cue loads", async () => {
  const ui = screen();
  let selected;
  ui.getSelectedAddonSubtitle = () => selected;
  for (const [format, body] of [
    ["vtt", "WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nCiao, mondo"],
    ["srt", "1\n00:00:01,250 --> 00:00:03,500\nCiao, mondo"]
  ]) {
    selected = { id: format, url: `fixture.${format}` };
    globalThis.fetch = async () =>
      new Response(body, {
        headers: { "content-type": format === "vtt" ? "text/vtt" : "application/x-subrip" }
      });
    await settle(ui.loadSubtitleAutoSyncCues({ force: true }));
    assert.deepEqual(ui.subtitleAutoSyncCues, [
      { startTimeMs: 1250, endTimeMs: 3500, text: "Ciao, mondo" }
    ]);
  }
  let resolveFetch;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  selected = { id: "ass", url: "fixture.ass" };
  const oldLoad = ui.loadSubtitleAutoSyncCues({ force: true });
  await drain();
  selected = null;
  ui.resetSubtitleAutoSyncState();
  resolveFetch(new Response(assBody, { headers: { "content-type": "text/x-ass" } }));
  await drain();
  await oldLoad;
  assert.deepEqual(ui.subtitleAutoSyncCues, []);
  assert.equal(ui.subtitleAutoSyncLoading, false);
});
test("VIDAA UI fallback disables all modes before enabling an earlier track", async () => {
  let modes = ["disabled", "showing"];
  const text = modes.map((_, index) => ({
    get mode() {
      return modes[index];
    },
    set mode(value) {
      if (value === "showing") assert.ok(modes.every((mode) => mode === "disabled"));
      modes[index] = value;
    }
  }));
  useVideo(video([], text, true));
  const ui = screen();
  PlayerController.setNativeTextTrack = () => false;
  assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: 0 })), true);
  assert.deepEqual(modes, ["showing", "disabled"]);
});
test("late external load errors retire the confirmed addon instead of leaving a checkmark", async () => {
  useVideo(video([], [{ mode: "disabled" }]));
  const ui = screen();
  const result = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "blob:fixture" }
  });
  await drain();
  const node = ui.externalTrackNodes[0];
  assert.equal(await settle(result), true);
  assert.equal(ui.selectedAddonSubtitleId, "vtt");
  node.dispatchEvent(new Event("error"));
  assert.equal(ui.selectedAddonSubtitleId, null);
  assert.equal(ui.externalTrackNodes.length, 0);
  assert.equal(ui.selectedSubtitleTrackIndex, -1);
});
test("cleanup of an external activation also settles its result after its timer was cleared", async () => {
  useVideo(video([], [{ mode: "disabled" }]));
  const ui = screen();
  const result = ui.applySubtitleEntry({
    fallbackAddonSubtitle: true,
    track: { id: "vtt", url: "blob:fixture" }
  });
  await drain();
  ui.playerMountToken++;
  ui.subtitleSelectionToken++;
  ui.clearMountedExternalSubtitleTracks();
  clearTimeout(ui.subtitleSelectionTimer);
  ui.subtitleSelectionTimer = null;
  await advance();
  assert.equal(await result, false);
  assert.equal(timers.size, 0);
});
test("the ASS adapter rejects a replaced stream even when its selection token is unchanged", async () => {
  useVideo(video([], [{ mode: "disabled" }]));
  const ui = screen();
  ui.uiRefs.assSubtitles = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    replaceChildren() {}
  };
  globalThis.ResizeObserver = class {};
  let script;
  document.createElement = () => ({});
  document.head.appendChild = (node) => {
    script = node;
  };
  ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
  const result = ui.applyFallbackAddonSubtitle(0, 0, { id: "ass", url: "fixture.ass" });
  await drain();
  PlayerController.playRequestToken++;
  let constructed = false;
  globalThis.ASS = class {
    constructor() {
      constructed = true;
    }
  };
  script.onload();
  await drain();
  await result;
  assert.equal(constructed, false);
  assert.equal(ui.assSubtitleRenderer, null);
  assert.equal(ui.selectedAddonSubtitleId, null);
});
test("webOS audio keeps its existing request and event confirmation contract", async () => {
  const element = video([{ enabled: true }, { enabled: false }]);
  element.mediaId = "fixture-media";
  useVideo(element, "webos");
  globalThis.webOS = {
    service: {
      request() {
        throw new Error("Unexpected real service");
      }
    }
  };
  const ui = screen();
  const { onWebOsAudioTrackSelectionChanged } = createPlayerVideoEventHandlers.call(
    ui,
    element,
    () => false
  );
  element.addEventListener("webosaudiotrackselectionchanged", onWebOsAudioTrackSelectionChanged);
  let resolveCommand;
  PlayerController.requestWebOsMediaCommand = () =>
    new Promise((resolve) => {
      resolveCommand = resolve;
    });
  ui.applyAudioTrack(1, { rememberSelection: true });
  await drain();
  assert.equal(ui.pendingWebOsAudioSelection.status, "pending");
  assert.equal(ui.selectedAudioTrackIndex, 0);
  resolveCommand({ returnValue: true });
  await drain();
  assert.equal(ui.selectedAudioTrackIndex, 1);
  assert.deepEqual(ui.rememberedAudio, { language: "it" });
  assert.equal(ui.pendingWebOsAudioSelection, null);
  assert.equal(timers.size, 0);
});
test("shared Tizen/webOS HTML subtitle paths preserve ASS and plain VTT with OFF cleanup", async () => {
  for (const platform of ["tizen", "webos"]) {
    useVideo(video([], [{ mode: "disabled" }]), platform);
    const ui = screen();
    ui.uiRefs.assSubtitles = {
      classList: { add() {}, remove() {} },
      setAttribute() {},
      replaceChildren() {}
    };
    globalThis.ResizeObserver = class {};
    globalThis.ASS = class {
      destroy() {}
    };
    if (platform === "tizen") {
      PlayerController.isUsingAvPlay = () => true;
      PlayerController.setAvPlaySubtitleTrack = () => true;
    } else {
      PlayerController.isUsingAvPlay = controllerMethods.isUsingAvPlay;
    }
    ui.fetchSubtitleRawBody = async () => ({ body: assBody, contentType: "text/x-ass" });
    assert.equal(
      await settle(ui.applyFallbackAddonSubtitle(0, 0, { id: "ass", url: "fixture.ass" })),
      true
    );
    assert.equal(ui.isAssAddonSubtitleActive(), true);
    await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
    assert.equal(ui.isAssAddonSubtitleActive(), false);
    ui.fetchSubtitleRawBody = async () => ({
      body: "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello",
      contentType: "text/vtt"
    });
    assert.equal(
      await settle(
        ui.applyFallbackAddonSubtitle(0, ui.subtitleSelectionToken, {
          id: "vtt",
          url: "fixture.vtt"
        })
      ),
      true
    );
    assert.equal(ui.htmlSubtitleCues.length, 1);
    assert.equal(ui.isAssAddonSubtitleActive(), false);
    await settle(ui.applySubtitleEntry({ trackIndex: -1 }));
    assert.deepEqual(ui.htmlSubtitleCues, []);
    assert.equal(timers.size, 0);
  }
});
test("VIDAA explicit HTML VTT/SRT owns the overlay, renders cues with delay, and turns OFF", async () => {
  for (const [body, type] of [
    ["WEBVTT\n\n00:00:02.500 --> 00:00:03.500\nHello", "text/vtt"],
    ["1\n00:00:02,500 --> 00:00:03,500\nHello", "application/x-subrip"]
  ]) {
    useVideo(video([], [{ mode: "showing" }]));
    const ui = screen();
    ui.subtitleRenderMode = "html";
    ui.subtitles = [{ id: "external", url: "fixture-subtitle", lang: "it" }];
    ui.fetchSubtitleRawBody = async () => ({ body, contentType: type });
    let rendered = [];
    ui.renderHtmlSubtitleOverlayCue = (cues) => {
      rendered = cues;
    };
    assert.equal(
      await settle(ui.applySubtitleEntry({ fallbackAddonSubtitle: true, subtitleIndex: 0 })),
      true
    );
    assert.equal(ui.htmlSubtitleSelectedId, "external");
    assert.equal(ui.htmlSubtitleCues.length, 1);
    assert.equal(ui.externalTrackNodes.length, 0);
    assert.equal(ui.getTextTracks()[0].mode, "disabled");
    assert.equal(rendered[0].text, "Hello");
    ui.subtitleDelayMs = 1000;
    ui.renderHtmlSubtitleOverlayAtCurrentTime();
    assert.equal(rendered.length, 0, "Positive delay postpones the cue on the active overlay");
    ui.subtitleDelayMs = 0;
    ui.renderHtmlSubtitleOverlayAtCurrentTime();
    assert.equal(rendered.length, 1);
    assert.equal(await settle(ui.applySubtitleEntry({ trackIndex: -1 })), true);
    assert.equal(ui.htmlSubtitleSelectedId, null);
    assert.equal(ui.htmlSubtitleRenderTimer, null);
    assert.equal(ui.selectedAddonSubtitleId, null);
  }
});
test("VIDAA default native preference uses the shared overlay for fetched external text", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  ui.subtitleRenderMode = "native";
  ui.fetchSubtitleRawBody = async () => ({
    body: "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello",
    contentType: "text/vtt"
  });
  assert.equal(
    await settle(ui.applyFallbackAddonSubtitle(0, 0, { id: "native", url: "fixture.vtt" })),
    true
  );
  assert.equal(ui.htmlSubtitleSelectedId, "native");
  assert.equal(ui.htmlSubtitleCues[0].text, "Hello");
  assert.equal(ui.externalTrackNodes.length, 0);
  assert.equal(ui.getTextTracks()[0].mode, "disabled");
});
test("VIDAA HTML fetch failure preserves the successful direct native fallback", async () => {
  useVideo(video([], [{ mode: "showing" }]));
  const ui = screen();
  ui.subtitleRenderMode = "html";
  ui.fetchSubtitleRawBody = async () => {
    throw new Error("CORS fixture");
  };
  ui.resolveSubtitlePlaybackUrl = async () => "fixture-direct.vtt";
  assert.equal(
    await settle(ui.applyFallbackAddonSubtitle(0, 0, { id: "direct", url: "fixture-direct.vtt" })),
    true
  );
  assert.ok(ui.htmlSubtitleSelectedId == null);
  assert.equal(ui.externalTrackNodes[0].src, "fixture-direct.vtt");
  assert.equal(ui.externalTrackNodes[0].track.mode, "showing");
});
test("VIDAA HTML cannot own output while native text is readonly showing", async () => {
  useVideo(video([], [flags("mode", "showing", "noop")]));
  const ui = screen();
  ui.subtitleRenderMode = "html";
  ui.fetchSubtitleRawBody = async () => ({
    body: "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello",
    contentType: "text/vtt"
  });
  assert.equal(
    await settle(ui.applyTvHtmlAddonSubtitle({ id: "external", url: "fixture.vtt" }, 0)),
    false
  );
  assert.equal(ui.htmlSubtitleSelectedId, undefined);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(ui.getTextTracks()[0].mode, "showing");
});
test("a native result later than the confirmation window is reconciled by the existing sync", async () => {
  useVideo(
    video(
      [flags("enabled", true, 2000), flags("enabled", false, 2000)],
      [flags("mode", "showing", 2000), flags("mode", "disabled", 2000)]
    )
  );
  const ui = screen();
  const audio = ui.applyAudioTrack(1, { rememberSelection: true });
  const text = ui.applySubtitleEntry({ trackIndex: 1 });
  await advance(1200);
  assert.equal(await audio, false, "No confirmation within the bounded window");
  assert.equal(await text, false);
  assert.equal(ui.selectedAudioTrackIndex, 0);
  assert.equal(ui.selectedSubtitleTrackIndex, 0);
  assert.deepEqual(ui.rememberedAudio, { language: "it" });
  await advance(2000);
  ui.syncTrackState();
  assert.equal(ui.selectedAudioTrackIndex, 1);
  assert.equal(ui.selectedSubtitleTrackIndex, 1);
  assert.equal(timers.size, 0);
});

let failed = 0;
for (const { name, run } of tests) {
  timers.clear();
  resetAssSubtitleLibCache();
  Object.assign(PlayerController, controllerMethods);
  globalThis.fetch = noFetch;
  document.createElement = defaultCreateElement;
  document.head.appendChild = defaultAppendScript;
  delete globalThis.ASS;
  delete globalThis.webOS;
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(
  `${tests.length - failed}/${tests.length} player selection/lifecycle fixtures passed. TV decoding and visual rendering remain unverified.`
);
if (failed) process.exitCode = 1;
