import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createEmbeddedTextFixture } from "../scripts/create-vidaa-embedded-text-fixture.mjs";

// Production demux, repositories and consumers; transport/DOM only are simulated.
// No listener, real HTTP, Luna bridge, video decoder or VIDAA provider is started.
const fixture = createEmbeddedTextFixture();
const parserSource = await readFile(
  new URL("../services/webos/src/bitmapSubtitles.js", import.meta.url),
  "utf8"
);
const requireModule = createRequire(import.meta.url);
const tests = [];
const test = (name, run) => tests.push({ name, run });

function demux(change = () => {}) {
  const calls = [];
  const pending = [];
  const transport = {
    request(url, options, callback) {
      const [, rawStart, rawEnd] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
      const start = Number(rawStart);
      const end = Math.min(Number(rawEnd), fixture.buffer.length - 1);
      const config = { status: 206, body: fixture.buffer.subarray(start, end + 1) };
      calls.push({ start, end, url: url.href });
      change(config, calls.length);
      const request = new EventEmitter();
      let destroyed = false;
      request.setTimeout = () => request;
      request.destroy = (error) => {
        if (!destroyed) {
          destroyed = true;
          request.emit("error", error);
        }
      };
      request.end = () => {
        const deliver = () => {
          if (destroyed) return;
          const response = new EventEmitter();
          response.statusCode = config.status;
          response.headers = { "content-range": `bytes ${start}-${end}/${fixture.buffer.length}` };
          response.resume = () => {};
          callback(response);
          if (!destroyed) response.emit("data", config.body);
          if (!destroyed) response.emit("end");
        };
        if (config.hold) pending.push(deliver);
        else queueMicrotask(deliver);
      };
      return request;
    }
  };
  const context = {
    Buffer,
    URL,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    require(name) {
      if (name === "http" || name === "https") return transport;
      if (name === "net") return {};
      if (name === "zlib")
        return {
          inflateSync() {
            throw new Error("Compression outside UTF8 experiment");
          }
        };
      if (name === "./bitmapSubtitleRangeIO.js" || name === "./matroskaTextDemux.cjs") {
        return requireModule(
          new URL(`../services/webos/src/${name.slice(2)}`, import.meta.url).pathname.slice(1)
        );
      }
      throw new Error(`Unexpected Node dependency: ${name}`);
    }
  };
  vm.runInNewContext(parserSource, context, { filename: "services/webos/src/bitmapSubtitles.js" });
  const api = context.module.exports;
  const metadata = api._test.parseHeader(fixture.header, fixture.buffer.length);
  metadata.cues = api._test.parseCues(fixture.cues, metadata.timecodeScaleNs);
  metadata.clusterPositions = [...fixture.positions];
  const track = metadata.tracks[0];
  const requestContext = () => ({ cancelled: false, requests: new Set() });
  return { api, metadata, track, calls, pending, requestContext };
}

test("chosen MKV has the known UTF8 identity, index offsets and all three exact timestamps", () => {
  const h = demux();
  assert.equal(h.track.number, 7);
  assert.equal(h.track.codecId, "S_TEXT/UTF8");
  assert.equal(h.api._test.isTextSubtitleTrack(h.track), true);
  assert.equal(h.metadata.cuesOffset, fixture.manifest.ranges[1].start);
  for (let index = 0; index < fixture.clusters.length; index++) {
    const frames = h.api._test.parseCluster(
      fixture.clusters[index].buffer,
      h.track,
      h.metadata.timecodeScaleNs
    );
    const expected = fixture.manifest.knownCues[index];
    assert.equal(frames.length, 1);
    assert.equal(frames[0].timestampMs, expected.startMs);
    assert.equal(frames[0].durationMs, expected.endMs - expected.startMs);
    assert.equal(frames[0].payload.toString("utf8"), expected.text);
  }
  assert.equal(h.calls.length, 0);
});
test("real indexed block reads avoid clusters and are cached, then invalidated by cleanup", async () => {
  const h = demux();
  const load = () =>
    h.api._test.loadCueFrames(
      "https://media.invalid/fixture",
      h.metadata,
      h.track,
      [h.metadata.cues[1]],
      h.requestContext()
    );
  const first = await load();
  assert.equal(first[0].timestampMs, 89500);
  assert.equal(first[0].durationMs, 2000);
  assert.equal(first[0].payload.toString(), fixture.manifest.knownCues[1].text);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].start >= fixture.manifest.ranges[2].start);
  assert.ok(h.calls[0].end - h.calls[0].start < 1024);
  await load();
  assert.equal(h.calls.length, 1);
  h.api.clearBitmapSubtitleCaches();
  await load();
  assert.equal(h.calls.length, 2);
});
test("public webOS windows keep their existing protocol after Node I/O separation", async () => {
  const h = demux();
  const initial = await h.api.getEmbeddedTextSubtitleWindow({
    url: "https://media.invalid/node-regression",
    trackNumber: 7,
    startSeconds: 0,
    endSeconds: 120
  });
  assert.equal(initial.codecId, "S_TEXT/UTF8");
  assert.match(initial.body, /00:00:01\.250 --> 00:00:03\.500/);
  const afterSeek = await h.api.getEmbeddedTextSubtitleWindow({
    url: "https://media.invalid/node-regression",
    trackNumber: 7,
    startSeconds: 180,
    endSeconds: 300
  });
  assert.match(afterSeek.body, /00:03:01\.250 --> 00:03:03\.500/);
  h.api.clearBitmapSubtitleCaches();
});
test("real VTT serializer accepts empty windows and carries a cue across the 90-second boundary", () => {
  const h = demux();
  const frame = h.api._test.parseCluster(fixture.clusters[1].buffer, h.track, 1000000)[0];
  const left = h.api._test.buildTextSubtitleWindowPayload(h.track, [frame], 0, 90000, {});
  const right = h.api._test.buildTextSubtitleWindowPayload(h.track, [frame], 90000, 210000, {});
  assert.equal(left.cueCount, 1);
  assert.match(left.body, /00:01:29\.500 --> 00:01:30\.000/);
  assert.match(right.body, /00:01:29\.500 --> 00:01:31\.500/);
  const empty = h.api._test.buildTextSubtitleWindowPayload(h.track, [], 210000, 330000, {});
  assert.equal(empty.cueCount, 0);
  assert.equal(empty.body, "WEBVTT\n\n");
  const giant = { ...frame, payload: Buffer.alloc(600 * 1024, "a") };
  assert.throws(() => h.api._test.buildTextSubtitleWindowPayload(h.track, [giant], 0, 120000, {}), {
    code: "TEXT_WINDOW_TOO_LARGE"
  });
});
test("demux rejects Range denial, oversized response and cancelled work with real transport bookkeeping", async () => {
  for (const [change, code] of [
    [
      (c) => {
        c.status = 200;
      },
      "RANGE_UNAVAILABLE"
    ],
    [
      (c) => {
        c.body = Buffer.alloc(70 * 1024);
      },
      "RANGE_TOO_LARGE"
    ]
  ]) {
    const h = demux(change);
    const context = h.requestContext();
    await assert.rejects(
      h.api._test.loadCueFrames(
        "https://media.invalid/fixture",
        h.metadata,
        h.track,
        [h.metadata.cues[1]],
        context
      ),
      { code }
    );
    assert.equal(context.requests.size, 0);
  }
  const h = demux((c) => {
    c.hold = true;
  });
  const context = h.requestContext();
  const pending = h.api._test.loadCueFrames(
    "https://media.invalid/fixture",
    h.metadata,
    h.track,
    [h.metadata.cues[1]],
    context
  );
  assert.equal(context.requests.size, 1);
  h.api._test.cancelRequestContext(context);
  await assert.rejects(pending, { code: "REQUEST_SUPERSEDED" });
  assert.equal(context.requests.size, 0);
  h.pending[0]();
  assert.equal(h.calls.length, 1);
});

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: "" };
globalThis.__NUVIO_PLATFORM__ = "webos";
globalThis.document = {
  getElementById: () => null,
  documentElement: {},
  head: {
    appendChild() {
      throw new Error("Unexpected script load");
    }
  }
};
const { Platform } = await import("../js/platform/index.js");
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { localMediaEmbeddedSubtitleRepository: repository } =
  await import("../js/data/repository/localMediaEmbeddedSubtitleRepository.js");
const { localMediaTracksRepository: tracks } =
  await import("../js/data/repository/localMediaTracksRepository.js");
const { WebOsLunaService } = await import("../js/platform/webos/webosLunaService.js");
const saved = {
  fetch: globalThis.fetch,
  available: WebOsLunaService.isAvailable,
  request: WebOsLunaService.request,
  visibility: PlayerController.setWebOsEmbeddedSubtitleNativeVisibility,
  warn: console.warn
};
globalThis.fetch = async () => {
  throw new Error("No real network authorized");
};
WebOsLunaService.isAvailable = () => true;
console.warn = () => {};
let transportCalls = [];
let deliver = async () => payload();
WebOsLunaService.request = async (_service, options) => {
  transportCalls.push(options);
  return deliver(options);
};
let nativeVisibility = [];
PlayerController.setWebOsEmbeddedSubtitleNativeVisibility = (visible) => {
  nativeVisibility.push(visible);
  return true;
};
const platform = (value) => {
  globalThis.__NUVIO_PLATFORM__ = value;
  Platform.current = null;
};

function payload(start = 0, end = 120, frames = null) {
  const h = demux();
  const cueFrames =
    frames ??
    fixture.clusters.map(
      (cluster) => h.api._test.parseCluster(cluster.buffer, h.track, 1000000)[0]
    );
  return {
    ...h.api._test.buildTextSubtitleWindowPayload(h.track, cueFrames, start * 1000, end * 1000, {}),
    codecId: "S_TEXT/UTF8",
    trackNumber: 7,
    language: "ita",
    name: "Fixture",
    windowStartSeconds: start,
    windowEndSeconds: end,
    contextStartSeconds: Math.max(0, start - 30)
  };
}
function screen() {
  platform("webos");
  transportCalls = [];
  nativeVisibility = [];
  deliver = async () => payload();
  const scheduled = new Map();
  return {
    ...PlayerScreen,
    playerMountToken: 1,
    subtitleSelectionToken: 1,
    selectedEmbeddedSubtitleTrackIndex: 0,
    subtitleRenderMode: "html",
    subtitleDelayMs: 0,
    time: 2,
    webOsEmbeddedTextSubtitleTrack: { sourceTrackId: 7, codec: "S_TEXT/UTF8" },
    webOsEmbeddedTextSubtitleLoadToken: 0,
    webOsEmbeddedTextSubtitleLoading: false,
    webOsEmbeddedTextSubtitleFallbackUnavailable: false,
    webOsEmbeddedTextSubtitleUsingHtml: false,
    webOsEmbeddedTextSubtitleUsingAss: false,
    webOsEmbeddedTextSubtitleWindowStart: 0,
    webOsEmbeddedTextSubtitleWindowEnd: 0,
    webOsEmbeddedTextSubtitleWindowFailureCount: 0,
    webOsEmbeddedTextSubtitleLastErrorAt: 0,
    htmlSubtitleCues: [],
    htmlSubtitleSelectedId: null,
    htmlSubtitleRenderTimer: null,
    htmlSubtitleRenderFrame: null,
    uiRefs: {},
    getTrackProbeUrl: () => "https://media.invalid/fixture.mkv",
    getPlaybackCurrentSeconds() {
      return this.time;
    },
    renderHtmlSubtitleOverlayCue(cues) {
      this.visibleCues = cues;
    },
    // Exercise the real scheduler but hold its timer until the next test step.
    scheduled
  };
}
const timerSet = globalThis.setTimeout;
const timerClear = globalThis.clearTimeout;
let timerId = 0;
const consumerTimers = new Map();
function useConsumerTimers() {
  globalThis.setTimeout = (callback, ms) => {
    if (ms === 60000) return timerSet(callback, ms); // Repository timeout, always cleared.
    const id = `consumer-${++timerId}`;
    consumerTimers.set(id, () => {
      consumerTimers.delete(id);
      callback();
    });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    if (typeof id === "string") consumerTimers.delete(id);
    else timerClear(id);
  };
}

test("real repository normalizes valid/empty windows and preserves transport error codes", async () => {
  platform("webos");
  const request = {
    url: "https://media.invalid/fixture",
    trackNumber: 7,
    startSeconds: 210,
    endSeconds: 330
  };
  deliver = async () => payload(210, 330, []);
  assert.equal((await repository.getWindow(request)).cueCount, 0);
  for (const [reply, expected] of [
    [
      { returnValue: false, errorCode: "RANGE_UNAVAILABLE", errorText: "Range denied" },
      "RANGE_UNAVAILABLE"
    ],
    [{ bodyTruncated: true, body: "WEBVTT\n\n" }, undefined]
  ]) {
    deliver = async () => reply;
    await assert.rejects(
      repository.getWindow(request),
      expected ? { code: expected } : /too large/
    );
  }
});
test("production VIDAA gap remains gated rather than claiming success from metadata", async () => {
  const ui = screen();
  platform("vidaa");
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(2), false);
  assert.equal(transportCalls.length, 0);
  assert.equal(ui.webOsEmbeddedTextSubtitleUsingHtml, false);
});
test("existing metadata repository shares in-flight requests and retries after the temporary negative cache", async () => {
  platform("browser");
  const now = Date.now;
  const base = now();
  let count = 0;
  let successful = false;
  globalThis.fetch = async () => {
    count++;
    if (!successful) throw new Error("Temporary transport failure");
    return { ok: true, json: async () => [{ trackNumber: 7, codecId: "S_TEXT/UTF8" }] };
  };
  try {
    const media = "https://media.invalid/metadata-contract-unique";
    const a = tracks.getTracks(media);
    const b = tracks.getTracks(media);
    assert.deepEqual(await a, []);
    assert.deepEqual(await b, []);
    assert.equal(count, 6);
    successful = true;
    assert.deepEqual(await tracks.getTracks(media), []);
    assert.equal(count, 6);
    Date.now = () => base + 6000;
    const result = await tracks.getTracks(media);
    assert.equal(result[0].trackNumber, 7);
    assert.equal(count, 7);
    assert.equal(result[0].nativeTrackIndex, undefined);
  } finally {
    Date.now = now;
    globalThis.fetch = async () => {
      throw new Error("No real network authorized");
    };
    platform("webos");
  }
});
test("consumer uses the real repository/parser/scheduler; cue advances and delay is positive-later", async () => {
  useConsumerTimers();
  const ui = screen();
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(ui.time), true);
  assert.equal(transportCalls[0].parameters.trackNumber, 7);
  assert.equal(ui.visibleCues[0].text, fixture.manifest.knownCues[0].text);
  assert.deepEqual(nativeVisibility, [false]);
  ui.time = 4;
  [...consumerTimers.values()][0]();
  assert.equal(ui.visibleCues.length, 0);
  ui.time = 2;
  ui.subtitleDelayMs = 1000;
  ui.renderHtmlSubtitleOverlayAtCurrentTime();
  assert.equal(ui.visibleCues.length, 0);
  ui.time = 2.25;
  ui.renderHtmlSubtitleOverlayAtCurrentTime();
  assert.equal(ui.visibleCues.length, 1);
  ui.clearWebOsEmbeddedTextSubtitleOverlay({ dispose: true });
  assert.equal(ui.webOsEmbeddedTextSubtitleTrack, null);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(consumerTimers.size, 0);
});
test("empty window replaces old text; first empty-window limitation is recorded for the future adapter", async () => {
  const ui = screen();
  await ui.loadWebOsEmbeddedTextSubtitleWindow(2);
  deliver = async () => payload(90, 210, []);
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(100), true);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(ui.webOsEmbeddedTextSubtitleWindowEnd, 210);
  ui.clearWebOsEmbeddedTextSubtitleOverlay({ dispose: true });
  const first = screen();
  deliver = async () => payload(0, 120, []);
  assert.equal(await first.loadWebOsEmbeddedTextSubtitleWindow(2), false);
  assert.equal(first.webOsEmbeddedTextSubtitleFallbackUnavailable, false);
});
test("seek outside window supersedes late response, then renders a valid post-seek cue", async () => {
  const ui = screen();
  await ui.loadWebOsEmbeddedTextSubtitleWindow(2);
  let resolveOld;
  deliver = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  const late = ui.loadWebOsEmbeddedTextSubtitleWindow(100);
  ui.prepareWebOsEmbeddedTextSubtitleForSeek(182);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  deliver = async () => payload(180, 300);
  ui.time = 182;
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(182), true);
  const currentCues = ui.htmlSubtitleCues;
  resolveOld(payload(90, 210));
  assert.equal(await late, false);
  assert.equal(ui.htmlSubtitleCues, currentCues);
  assert.equal(ui.visibleCues[0].text, fixture.manifest.knownCues[2].text);
  ui.clearWebOsEmbeddedTextSubtitleOverlay({ dispose: true });
});
test("transient failure preserves renderer and retry recovers without hiding the track", async () => {
  const ui = screen();
  await ui.loadWebOsEmbeddedTextSubtitleWindow(2);
  const cues = ui.htmlSubtitleCues;
  deliver = async () => {
    throw Object.assign(new Error("Temporary"), { code: "RANGE_TIMEOUT" });
  };
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(100), false);
  assert.equal(ui.htmlSubtitleCues, cues);
  assert.equal(ui.webOsEmbeddedTextSubtitleUsingHtml, true);
  assert.equal(ui.webOsEmbeddedTextSubtitleFallbackUnavailable, false);
  deliver = async () => payload(90, 210);
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(100), true);
  assert.equal(ui.webOsEmbeddedTextSubtitleWindowFailureCount, 0);
  ui.clearWebOsEmbeddedTextSubtitleOverlay({ dispose: true });
});
test("OFF cleanup invalidates a pending response without clearing a newer external overlay", async () => {
  const ui = screen();
  let resolveOld;
  deliver = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  const late = ui.loadWebOsEmbeddedTextSubtitleWindow(2);
  ui.clearWebOsEmbeddedTextSubtitleOverlay({ dispose: true });
  ui.htmlSubtitleSelectedId = "external-new";
  const externalCues = [{ start: 1, end: 5, text: "External" }];
  ui.htmlSubtitleCues = externalCues;
  resolveOld(payload());
  assert.equal(await late, false);
  assert.equal(ui.htmlSubtitleCues, externalCues);
  assert.equal(ui.htmlSubtitleSelectedId, "external-new");
  assert.equal(ui.webOsEmbeddedTextSubtitleLoading, false);
});

try {
  for (const { name, run } of tests) {
    await run();
    console.log(`PASS ${name}`);
  }
  console.log(
    `${tests.length}/${tests.length} production embedded-text characterizations passed (no VIDAA provider/TV).`
  );
} finally {
  globalThis.fetch = saved.fetch;
  WebOsLunaService.isAvailable = saved.available;
  WebOsLunaService.request = saved.request;
  PlayerController.setWebOsEmbeddedSubtitleNativeVisibility = saved.visibility;
  console.warn = saved.warn;
  globalThis.setTimeout = timerSet;
  globalThis.clearTimeout = timerClear;
  consumerTimers.clear();
}
