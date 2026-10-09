import assert from "node:assert/strict";
import demux from "../services/webos/src/matroskaTextDemux.cjs";
import { createEmbeddedTextFixture } from "../scripts/create-vidaa-embedded-text-fixture.mjs";
import {
  createVidaaEmbeddedTextProvider,
  vidaaEmbeddedTextProvider,
  VIDAA_EMBEDDED_TEXT_LIMITS
} from "../js/platform/vidaa/vidaaEmbeddedTextProvider.js";

const fixture = createEmbeddedTextFixture();
const url = "https://media.invalid/known.mkv";
const tests = [];
const test = (name, run) => tests.push({ name, run });

function transport(change = () => {}, fixtureData = fixture) {
  const calls = [];
  const held = [];
  let time = 0;
  const fetchImpl = async (_url, options) => {
    const [, first, last] = /bytes=(\d+)-(\d+)/.exec(options.headers.get("Range"));
    const start = Number(first);
    const end = Math.min(Number(last), fixtureData.buffer.length - 1);
    const config = {
      start,
      end,
      status: 206,
      body: new Uint8Array(fixtureData.buffer.subarray(start, end + 1)),
      range: `bytes ${start}-${end}/${fixtureData.buffer.length}`,
      length: String(end - start + 1),
      etag: '"fixture-v1"'
    };
    calls.push({ start, end, options, url: _url });
    change(config, calls.length);
    const response = () => {
      const headers = new Headers();
      if (config.range !== null) headers.set("Content-Range", config.range);
      if (config.length !== null) headers.set("Content-Length", config.length);
      if (config.etag) headers.set("ETag", config.etag);
      return new Response(config.body, { status: config.status, headers });
    };
    if (config.error) throw config.error;
    if (config.hold)
      return new Promise((resolve) => {
        held.push(() => resolve(response()));
      });
    return response();
  };
  return {
    calls,
    held,
    fetchImpl,
    now: () => time,
    advance: (ms) => {
      time += ms;
    }
  };
}
async function selected(p) {
  return (await p.getTracks(url))[0];
}
const windowFor = (p, track, start = 0, end = start + 120) =>
  p.getWindow({
    url,
    trackNumber: 7,
    sourceIdentity: track.sourceIdentity,
    startSeconds: start,
    endSeconds: end
  });

test("discovery verifies header/index/known cue with readable 206; identity never implies native index", async () => {
  const h = transport();
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  assert.equal(track.id, 7);
  assert.equal(track.nativeTrackIndex, -1);
  assert.equal(track.codecId, "S_TEXT/UTF8");
  assert.equal(track.textAccessVerified, true);
  assert.ok(track.containerTrackUid);
  assert.equal(h.calls.length, 5);
  assert.ok(p.diagnostics().receivedBytes < fixture.buffer.length / 2);
  assert.ok(
    h.calls.every(
      (call) =>
        call.options.mode === "cors" &&
        call.options.redirect === "error" &&
        call.options.credentials === "omit"
    )
  );
  const count = h.calls.length;
  assert.equal((await selected(p)).sourceIdentity, track.sourceIdentity);
  assert.equal(h.calls.length, count);
  p.dispose();
  assert.equal(p.diagnostics().active, false);
});
test("real browser demux keeps absolute times and cross-boundary duration; empty window is valid", async () => {
  const h = transport();
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  const first = await windowFor(p, track);
  assert.match(first.body, /00:00:01\.250 --> 00:00:03\.500\nCue iniziale: città/);
  assert.match(first.body, /00:01:29\.500 --> 00:01:31\.500/);
  const second = await windowFor(p, track, 90);
  assert.match(second.body, /00:01:29\.500 --> 00:01:31\.500/);
  assert.match(second.body, /00:03:01\.250 --> 00:03:03\.500/);
  const empty = await windowFor(p, track, 210);
  assert.equal(empty.cueCount, 0);
  assert.equal(empty.body, "WEBVTT\n\n");
  assert.ok(p.diagnostics().peakResidentBytes <= VIDAA_EMBEDDED_TEXT_LIMITS.residentBytes);
  p.dispose();
});
test("cache is bounded to two windows and a cache hit does not fetch", async () => {
  const h = transport();
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  await windowFor(p, track);
  const count = h.calls.length;
  await windowFor(p, track);
  assert.equal(h.calls.length, count);
  await windowFor(p, track, 90);
  await windowFor(p, track, 210);
  const afterEviction = h.calls.length;
  await windowFor(p, track);
  assert.ok(h.calls.length > afterEviction);
  p.dispose();
});
for (const [name, change, code] of [
  [
    "Range denied",
    (c) => {
      c.status = 200;
    },
    "RANGE_UNAVAILABLE"
  ],
  [
    "Content-Range hidden by CORS",
    (c) => {
      c.range = null;
    },
    "CONTENT_RANGE_UNREADABLE"
  ],
  [
    "range does not match",
    (c) => {
      c.range = "bytes 1-2/999999";
    },
    "CONTENT_RANGE_MISMATCH"
  ],
  [
    "auth denied",
    (c) => {
      c.status = 401;
    },
    "AUTH_DENIED"
  ],
  [
    "redirect/transport denied",
    (c) => {
      c.error = new TypeError("secret URL");
    },
    "TRANSPORT_UNAVAILABLE"
  ],
  [
    "oversized response declared",
    (c) => {
      c.length = "999999999";
    },
    "RANGE_TOO_LARGE"
  ],
  [
    "oversized streamed response",
    (c) => {
      c.length = null;
      c.body = new Uint8Array(200 * 1024);
    },
    "RANGE_TOO_LARGE"
  ]
]) {
  test(name, async () => {
    const h = transport(change);
    const p = createVidaaEmbeddedTextProvider(h);
    assert.deepEqual(await p.getTracks(url), []);
    assert.equal(p.diagnostics().errorCode, code);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(JSON.stringify(p.diagnostics()).includes("secret"), false);
    p.dispose();
  });
}
test("temporary metadata failure is retried after backoff without a permanent blacklist", async () => {
  let failing = true;
  const h = transport((c) => {
    if (failing) c.status = 200;
  });
  const p = createVidaaEmbeddedTextProvider(h);
  assert.deepEqual(await p.getTracks(url), []);
  failing = false;
  assert.deepEqual(await p.getTracks(url), []);
  assert.equal(h.calls.length, 1);
  h.advance(5001);
  assert.equal((await selected(p)).id, 7);
  p.dispose();
});
test("an unresponsive fetch times out and the total operation deadline stops subsequent requests", async () => {
  const setTimer = globalThis.setTimeout;
  const clearTimer = globalThis.clearTimeout;
  let timeout;
  globalThis.setTimeout = (callback) => {
    timeout = callback;
    return "range-timeout";
  };
  globalThis.clearTimeout = () => {};
  const h = transport((c) => {
    c.hold = true;
  });
  const p = createVidaaEmbeddedTextProvider(h);
  try {
    const pending = p.getTracks(url);
    timeout();
    assert.deepEqual(await pending, []);
    assert.equal(p.diagnostics().errorCode, "RANGE_TIMEOUT");
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(h.calls.length, 1);
  } finally {
    p.dispose();
    h.held.forEach((resolve) => resolve());
    globalThis.setTimeout = setTimer;
    globalThis.clearTimeout = clearTimer;
  }
  const elapsed = transport(() => {
    elapsed.advance(15001);
  });
  const q = createVidaaEmbeddedTextProvider(elapsed);
  assert.deepEqual(await q.getTracks(url), []);
  assert.equal(q.diagnostics().errorCode, "RANGE_TIMEOUT");
  assert.equal(elapsed.calls.length, 1);
  q.dispose();
});
test("seek supersedes an unresponsive window and cleanup aborts discovery", async () => {
  let hold = false;
  const h = transport((c) => {
    c.hold = hold;
  });
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  hold = true;
  const old = windowFor(p, track);
  hold = false;
  const current = await windowFor(p, track, 180);
  await assert.rejects(old, { code: "REQUEST_SUPERSEDED" });
  assert.match(current.body, /Cue dopo seek/);
  h.held.forEach((resolve) => resolve());
  p.dispose();
  const other = transport((c) => {
    c.hold = true;
  });
  const q = createVidaaEmbeddedTextProvider(other);
  const pending = q.getTracks(url);
  q.dispose();
  assert.deepEqual(await pending, []);
  assert.equal(other.calls[0].options.signal.aborted, true);
  assert.equal(other.calls.length, 1);
  other.held.forEach((resolve) => resolve());
});
test("header credentials affect identity, are applied, and are absent from diagnostics", async () => {
  const h = transport();
  const p = createVidaaEmbeddedTextProvider(h);
  const a = await p.getTracks(url, { headers: { Authorization: "Bearer PRIVATE" } });
  assert.equal(h.calls[0].options.headers.get("Authorization"), "Bearer PRIVATE");
  const b = await p.getTracks(url, { headers: { Authorization: "Bearer ROTATED" } });
  assert.notEqual(a[0].sourceIdentity, b[0].sourceIdentity);
  assert.ok(!JSON.stringify(p.diagnostics()).includes("PRIVATE"));
  await assert.rejects(
    p.getWindow({
      url,
      headers: { Authorization: "Bearer ROTATED" },
      trackNumber: 7,
      sourceIdentity: a[0].sourceIdentity,
      startSeconds: 0,
      endSeconds: 120
    }),
    { code: "SOURCE_UNVERIFIED" }
  );
  p.dispose();
});
test("identity/seek invalid windows make no requests, changed validators reject mixed content", async () => {
  let changed = false;
  const h = transport((c) => {
    if (changed) c.etag = '"fixture-v2"';
  });
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  const count = h.calls.length;
  await assert.rejects(windowFor(p, { sourceIdentity: "stale" }), { code: "SOURCE_UNVERIFIED" });
  await assert.rejects(windowFor(p, track, 0, 999), { code: "INVALID_WINDOW" });
  assert.equal(h.calls.length, count);
  changed = true;
  await assert.rejects(windowFor(p, track), { code: "SOURCE_CHANGED" });
  assert.equal(h.calls.length, count + 1);
  p.dispose();
});
test("request budget rejects excessive requests before any additional network", async () => {
  const h = transport();
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  for (let i = 0; i < VIDAA_EMBEDDED_TEXT_LIMITS.requestsPerMinute; i++) {
    try {
      await windowFor(p, track, i % 2 ? 0 : 90, i % 2 ? 120 + i / 1000 : 210 + i / 1000);
    } catch (error) {
      assert.equal(error.code, "TRAFFIC_BUDGET");
      break;
    }
  }
  assert.equal(h.calls.length, VIDAA_EMBEDDED_TEXT_LIMITS.requestsPerMinute);
  assert.ok(p.diagnostics().requestedBytes <= VIDAA_EMBEDDED_TEXT_LIMITS.sessionBytes);
  p.dispose();
});
test("bad subtitle timestamps cannot verify access, and missing subtitle indexes cause no cluster scan", async () => {
  const changed = transport((c) => {
    if (c.start === fixture.manifest.ranges[1].start && c.body.length > 12) {
      // Change CueTrack 7 to 8 in every index entry; header still says track 7.
      for (let i = 0; i + 5 < c.body.length; i++) {
        if (c.body[i] === 0xf7 && c.body[i + 1] === 0x84) c.body[i + 5] = 8;
      }
    }
  });
  const p = createVidaaEmbeddedTextProvider(changed);
  assert.deepEqual(await p.getTracks(url), []);
  assert.equal(p.diagnostics().errorCode, "SUBTITLE_INDEX_UNAVAILABLE");
  assert.equal(changed.calls.length, 3);
  p.dispose();
  const wrong = transport((c) => {
    if (c.start === fixture.segmentDataStart + fixture.positions[0]) {
      // The small Cluster contains its entire Timestamp element; change 1000 to 1002.
      const at = c.body.indexOf(0xe7);
      c.body[at + 5] = 0xea;
    }
  });
  const q = createVidaaEmbeddedTextProvider(wrong);
  assert.deepEqual(await q.getTracks(url), []);
  assert.equal(q.diagnostics().errorCode, "CUE_TIMESTAMP_MISMATCH");
  q.dispose();
});

for (const [name, options] of [
  ["subtitle index without CueRelativePosition", { noRelativePosition: true }],
  ["video-only index skips large video BlockGroups", { videoIndex: true, videoBytes: 128 * 1024 }],
  [
    "no SeekHead finds distant metadata/index by element sizes",
    { noSeekHead: true, lateMetadata: true, scaleNs: 500000 }
  ],
  [
    "chained SeekHead with distant metadata",
    { chainedSeekHead: true, lateMetadata: true, scaleNs: 500000 }
  ],
  [
    "unknown-sized indexed Clusters find structural boundaries",
    { unknownClusters: true, videoIndex: true, videoBytes: 128 * 1024 }
  ],
  ["Cluster Timestamp beyond the first 64 bytes", { lateTimestamp: true }],
  ["header-stripped UTF8", { compression: "header" }],
  ["zlib UTF8", { compression: "zlib" }],
  ["SimpleBlock with DefaultDuration", { simpleBlock: true, defaultDurationNs: 2250000000 }]
]) {
  test(name, async () => {
    const data = createEmbeddedTextFixture(options);
    const h = transport(() => {}, data);
    const p = createVidaaEmbeddedTextProvider(h);
    const track = await selected(p);
    assert.ok(track, p.diagnostics().errorCode);
    const first = await windowFor(p, track, 0, 4);
    assert.match(first.body, /00:00:01\.250 --> 00:00:03\.500\nCue iniziale: città/);
    const crossing = await windowFor(p, track, 90, 92);
    assert.match(crossing.body, /00:01:29\.500 --> 00:01:31\.500/);
    const afterSeek = await windowFor(p, track, 180, 184);
    assert.match(afterSeek.body, /00:03:01\.250 --> 00:03:03\.500/);
    const empty = await windowFor(p, track, 210, 230);
    assert.equal(empty.body, "WEBVTT\n\n");
    assert.ok(
      h.calls.every((call) => call.end - call.start + 1 <= VIDAA_EMBEDDED_TEXT_LIMITS.headerBytes)
    );
    assert.ok(p.diagnostics().receivedBytes < 150 * 1024, JSON.stringify(p.diagnostics()));
    assert.ok(p.diagnostics().peakResidentBytes <= VIDAA_EMBEDDED_TEXT_LIMITS.residentBytes);
    p.dispose();
  });
}
for (const lacing of [2, 4, 6])
  test(`text lacing mode ${lacing} splits BlockDuration across exact frames`, async () => {
    const h = transport(() => {}, createEmbeddedTextFixture({ lacing }));
    const p = createVidaaEmbeddedTextProvider(h);
    const track = await selected(p);
    assert.ok(track, p.diagnostics().errorCode);
    const body = (await windowFor(p, track, 0, 4)).body;
    assert.match(body, /00:00:01\.250 --> 00:00:02\.375/);
    assert.match(body, /00:00:02\.375 --> 00:00:03\.500/);
    p.dispose();
  });
const assPrivate =
  "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Signs,Arial,42,&H00FFFF00,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,8,10,20,30,1\n[Events]\nFormat: ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n";
for (const codecId of ["S_TEXT/ASS", "S_TEXT/SSA"])
  test(`${codecId} preserves CodecPrivate, fields, override tags and comma text`, async () => {
    const p = createVidaaEmbeddedTextProvider(
      transport(
        () => {},
        createEmbeddedTextFixture({
          codecId,
          codecPrivate: assPrivate,
          compression: "zlib",
          compressionScope: 3
        })
      )
    );
    const track = await selected(p);
    assert.ok(track, p.diagnostics().errorCode);
    const data = await windowFor(p, track, 0, 4);
    assert.match(data.assBody, /PlayResX: 1920/);
    assert.match(data.assBody, /Style: Signs,Arial,42/);
    assert.match(
      data.assBody,
      /Dialogue: 2,0:00:01\.25,0:00:03\.50,Signs,Speaker,10,20,30,,\{\\an8\\i1\}Cue iniziale: città, coda/
    );
    assert.match(data.body, /Cue iniziale: città, coda/);
    assert.ok(!data.body.includes("\\an8"));
    p.dispose();
  });
test("compressed output bomb is bounded; encrypted tracks and missing durations are refused", async () => {
  for (const [options, code] of [
    [{ compression: "zlib", inflateBomb: true }, "DECOMPRESSED_BLOCK_LIMIT"],
    [{ compression: "zlib", encrypted: true }, "SUBTITLE_INDEX_UNAVAILABLE"],
    [{ noDuration: true, noCueDuration: true }, "CUE_DURATION_UNAVAILABLE"]
  ]) {
    const p = createVidaaEmbeddedTextProvider(
      transport(() => {}, createEmbeddedTextFixture(options))
    );
    assert.deepEqual(await p.getTracks(url), []);
    assert.equal(p.diagnostics().errorCode, code);
    assert.ok(p.diagnostics().peakResidentBytes <= VIDAA_EMBEDDED_TEXT_LIMITS.residentBytes);
    p.dispose();
  }
});
test("unindexed EOF Cues are found with one bounded tail probe", async () => {
  const data = createEmbeddedTextFixture({
    noSeekHead: true,
    cuesAtEnd: true,
    videoBytes: 128 * 1024
  });
  const h = transport(() => {}, data);
  const p = createVidaaEmbeddedTextProvider(h);
  const track = await selected(p);
  assert.ok(track, p.diagnostics().errorCode);
  assert.ok(
    h.calls.some(
      (call) =>
        call.end === data.buffer.length - 1 &&
        call.end - call.start + 1 === VIDAA_EMBEDDED_TEXT_LIMITS.indexBytes
    )
  );
  assert.match((await windowFor(p, track, 180, 184)).body, /Cue dopo seek/);
  assert.ok(p.diagnostics().receivedBytes < 420 * 1024);
  p.dispose();
});
test("WebVTT BlockAdditions preserve supported layout; inline HTML never appears as control text", async () => {
  const p = createVidaaEmbeddedTextProvider(
    transport(
      () => {},
      createEmbeddedTextFixture({
        codecId: "S_TEXT/WEBVTT",
        vttSettings: "position:90% align:right size:35%",
        markup: true
      })
    )
  );
  const track = await selected(p);
  assert.ok(track, p.diagnostics().errorCode);
  const data = await windowFor(p, track, 0, 4);
  assert.match(
    data.body,
    /00:00:03\.500 position:90% align:right size:35%\nCue iniziale: città\nSeconda riga/
  );
  assert.ok(!data.body.includes("&lt;i&gt;"));
  p.dispose();
});
test("dense subtitle windows exceed the old 64-cue limit within explicit bytes/request budgets", async () => {
  const p = createVidaaEmbeddedTextProvider(
    transport(() => {}, createEmbeddedTextFixture({ cueCount: 200 }))
  );
  const track = await selected(p);
  assert.ok(track, p.diagnostics().errorCode);
  const data = await windowFor(p, track);
  assert.equal(data.cueCount, 200);
  assert.match(data.body, /Cue 199: città/);
  assert.ok(
    p.diagnostics().receivedBytes <=
      VIDAA_EMBEDDED_TEXT_LIMITS.discoveryBytes + VIDAA_EMBEDDED_TEXT_LIMITS.windowBytes
  );
  assert.ok(p.diagnostics().peakResidentBytes <= VIDAA_EMBEDDED_TEXT_LIMITS.residentBytes);
  p.dispose();
});
test("a failed decode cannot poison the generic cluster cache; a subsequent good response recovers", async () => {
  const data = createEmbeddedTextFixture({
    codecId: "S_TEXT/ASS",
    codecPrivate: assPrivate,
    videoIndex: true,
    videoBytes: 4096
  });
  const groupOffset =
    data.segmentDataStart +
    data.positions[1] +
    demux.readElement(data.clusters[1].buffer, 0).dataStart +
    data.clusters[1].relativePosition;
  let failing = false;
  const p = createVidaaEmbeddedTextProvider(
    transport((c) => {
      if (failing && c.start === groupOffset) {
        const at = Buffer.from(c.body).indexOf("1,2,Signs");
        if (at >= 0) c.body[at] = 0x78;
      }
    }, data)
  );
  const track = await selected(p);
  assert.ok(track, p.diagnostics().errorCode);
  failing = true;
  await assert.rejects(windowFor(p, track, 80, 94), { code: "INVALID_ASS_PACKET" });
  failing = false;
  assert.match((await windowFor(p, track, 80, 94)).assBody, /Cue sul confine 90 s/);
  p.dispose();
});

// Integration uses the same singleton reached by the real repositories.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.document = {
  getElementById: () => null,
  documentElement: {},
  head: {
    appendChild() {
      throw new Error("Unexpected script load");
    }
  }
};
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { localMediaEmbeddedSubtitleRepository } =
  await import("../js/data/repository/localMediaEmbeddedSubtitleRepository.js");
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalWarn = console.warn;
const consumerTimers = new Map();
let timerId = 0;
globalThis.setTimeout = (callback, ms) => {
  if (ms !== 120) return originalSetTimeout(callback, ms);
  const id = `overlay-${++timerId}`;
  consumerTimers.set(id, () => {
    consumerTimers.delete(id);
    callback();
  });
  return id;
};
globalThis.clearTimeout = (id) => {
  if (typeof id === "string") consumerTimers.delete(id);
  else originalClearTimeout(id);
};
console.warn = () => {};
function screen(h) {
  vidaaEmbeddedTextProvider.dispose();
  globalThis.fetch = h.fetchImpl;
  Object.assign(PlayerController, {
    video: { textTracks: [], audioTracks: [], currentTime: 2 },
    playbackEngine: "native",
    avplayActive: false,
    hlsInstance: null,
    dashInstance: null,
    playRequestToken: Number(PlayerController.playRequestToken || 0) + 1
  });
  return {
    ...PlayerScreen,
    playerMountToken: 1,
    subtitleSelectionToken: 0,
    activePlaybackUrl: url,
    time: 2,
    embeddedSubtitleTracks: [],
    embeddedAudioTracks: [],
    embeddedSubtitleLoading: false,
    embeddedAudioLoading: false,
    selectedEmbeddedSubtitleTrackIndex: -1,
    selectedEmbeddedAudioTrackIndex: -1,
    selectedSubtitleTrackIndex: -1,
    selectedAudioTrackIndex: -1,
    selectedAddonSubtitleId: null,
    selectedManifestSubtitleTrackId: null,
    subtitles: [],
    manifestSubtitleTracks: [],
    externalTrackNodes: [],
    externalSubtitleObjectUrls: [],
    uiRefs: {},
    subtitleRenderMode: "native",
    subtitleDelayMs: 0,
    htmlSubtitleCues: [],
    htmlSubtitleRenderTimer: null,
    webOsEmbeddedTextSubtitleLoadToken: 0,
    webOsEmbeddedTextSubtitleLoading: false,
    webOsEmbeddedTextSubtitleFallbackUnavailable: false,
    webOsEmbeddedTextSubtitleTrack: null,
    webOsEmbeddedTextSubtitleUsingHtml: false,
    webOsEmbeddedTextSubtitleUsingAss: false,
    getTrackProbeUrl: () => url,
    getCurrentStreamRequestHeaders: () => ({}),
    getCurrentStreamCandidate: () => ({ url }),
    isCurrentSourceAdaptiveManifest: () => false,
    isCurrentSourceLikelyMkv: () => true,
    getPlaybackCurrentSeconds() {
      return this.time;
    },
    renderHtmlSubtitleOverlayCue(cues) {
      this.visibleCues = cues;
    },
    refreshTrackDialogs() {
      this.syncTrackState();
    },
    invalidateTrackDialogCaches() {
      this.trackDialogCache = null;
    },
    resetSubtitleDelayAfterSelectionChange() {},
    applySubtitlePresentationSettings() {},
    refreshSubtitleCueStyles() {},
    renderControlButtons() {},
    renderSubtitleDialog() {},
    shouldUseEmbeddedAudioTracks: () => false
  };
}
test("stream -> discovery -> normal subtitle menu -> real VIDAA selection -> shared renderer -> delay/seek -> OFF", async () => {
  const h = transport();
  const ui = screen(h);
  await ui.loadEmbeddedSubtitleTracks();
  assert.equal(ui.embeddedSubtitleTracks[0].sourceTrackId, 7);
  assert.equal(ui.embeddedSubtitleTracks[0].nativeTrackIndex, -1);
  const entry = ui
    .getSubtitleEntries("builtIn")
    .find((item) => item.embeddedSubtitleTrackIndex === 0);
  assert.ok(entry);
  assert.equal(await ui.applySubtitleEntry(entry), true);
  assert.equal(ui.selectedEmbeddedSubtitleTrackIndex, 0);
  assert.equal(ui.visibleCues[0].text, fixture.manifest.knownCues[0].text);
  ui.syncTrackState();
  assert.equal(ui.selectedEmbeddedSubtitleTrackIndex, 0);
  ui.time = 4;
  [...consumerTimers.values()][0]();
  assert.equal(ui.visibleCues.length, 0);
  ui.subtitleDelayMs = 1000;
  ui.time = 2;
  ui.renderHtmlSubtitleOverlayAtCurrentTime();
  assert.equal(ui.visibleCues.length, 0);
  ui.time = 2.25;
  ui.renderHtmlSubtitleOverlayAtCurrentTime();
  assert.equal(ui.visibleCues.length, 1);
  ui.prepareWebOsEmbeddedTextSubtitleForSeek(182);
  ui.time = 182;
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(181), true);
  assert.equal(ui.visibleCues.length, 0); // Subtitle time is exactly 181, before 181.25.
  ui.time = 182.25;
  ui.renderHtmlSubtitleOverlayAtCurrentTime();
  assert.equal(ui.visibleCues[0].text, fixture.manifest.knownCues[2].text);
  await ui.applySubtitleEntry({ trackIndex: -1 });
  assert.equal(ui.selectedEmbeddedSubtitleTrackIndex, -1);
  assert.equal(ui.webOsEmbeddedTextSubtitleTrack, null);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(consumerTimers.size, 0);
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("video-index windows advance through the real consumer, prefetch and seek", async () => {
  const ui = screen(
    transport(() => {}, createEmbeddedTextFixture({ videoIndex: true, videoBytes: 128 * 1024 }))
  );
  await ui.loadEmbeddedSubtitleTracks();
  const entry = ui
    .getSubtitleEntries("builtIn")
    .find((item) => item.embeddedSubtitleTrackIndex === 0);
  assert.equal(await ui.applySubtitleEntry(entry), true);
  assert.equal(ui.webOsEmbeddedTextSubtitleWindowEnd, 32);
  ui.time = 25;
  ui.renderWebOsEmbeddedTextSubtitleAtCurrentTime();
  while (ui.webOsEmbeddedTextSubtitleLoading)
    await new Promise((resolve) => originalSetTimeout(resolve, 1));
  assert.equal(ui.webOsEmbeddedTextSubtitleWindowStart, 25);
  assert.equal(ui.webOsEmbeddedTextSubtitleWindowEnd, 55);
  ui.time = 90;
  ui.prepareWebOsEmbeddedTextSubtitleForSeek(90);
  ui.renderWebOsEmbeddedTextSubtitleAtCurrentTime();
  while (ui.webOsEmbeddedTextSubtitleLoading)
    await new Promise((resolve) => originalSetTimeout(resolve, 1));
  assert.equal(ui.visibleCues[0].text, "Cue sul confine 90 s");
  await ui.applySubtitleEntry({ trackIndex: -1 });
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("a video-indexed stream with an empty intro verifies a later cue and accepts the first empty window", async () => {
  const ui = screen(
    transport(
      () => {},
      createEmbeddedTextFixture({ videoIndex: true, videoBytes: 4096, emptyFirstCue: true })
    )
  );
  await ui.loadEmbeddedSubtitleTracks();
  const entry = ui
    .getSubtitleEntries("builtIn")
    .find((item) => item.embeddedSubtitleTrackIndex === 0);
  assert.ok(entry);
  assert.equal(await ui.applySubtitleEntry(entry), true);
  assert.equal(ui.webOsEmbeddedTextSubtitleUsingHtml, true);
  assert.deepEqual(ui.htmlSubtitleCues, []);
  ui.time = 90;
  ui.prepareWebOsEmbeddedTextSubtitleForSeek(90);
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(90), true);
  assert.equal(ui.visibleCues[0].text, "Cue sul confine 90 s");
  await ui.applySubtitleEntry({ trackIndex: -1 });
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("anonymous direct URL and addon filename reach discovery; known MP4 and native text remain excluded", async () => {
  const h = transport();
  const ui = screen(h);
  const anonymousUrl = "https://media.invalid/signed-content?id=123";
  ui.getTrackProbeUrl = () => anonymousUrl;
  ui.getCurrentStreamCandidate = () => ({ url: anonymousUrl });
  ui.resolvePlaybackMediaSourceType = () => "";
  ui.isCurrentSourceLikelyMkv = PlayerScreen.isCurrentSourceLikelyMkv;
  assert.equal(ui.isCurrentSourceLikelyMkv(), false);
  assert.equal(ui.canDiscoverEmbeddedSubtitleTracks(), true);
  await ui.loadEmbeddedSubtitleTracks();
  assert.equal(ui.embeddedSubtitleTracks.length, 1);
  ui.getCurrentStreamCandidate = () => ({
    url: anonymousUrl,
    behaviorHints: { filename: "Film.mkv" }
  });
  assert.equal(ui.isCurrentSourceLikelyMkv(), true);
  ui.getCurrentStreamCandidate = () => ({ url: anonymousUrl });
  ui.resolvePlaybackMediaSourceType = () => "video/mp4";
  assert.equal(ui.canDiscoverEmbeddedSubtitleTracks(), false);
  ui.resolvePlaybackMediaSourceType = () => "";
  PlayerController.video.textTracks = [{ mode: "disabled", language: "ita", cues: [] }];
  assert.equal(ui.canDiscoverEmbeddedSubtitleTracks(), false);
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("real VIDAA ASS consumer preserves renderer on transport failure, forces a live frame loop and cleans OFF", async () => {
  const originalAss = globalThis.ASS;
  const originalObserver = globalThis.ResizeObserver;
  const bodies = [];
  let destroyed = 0;
  let failWindow = false;
  globalThis.ResizeObserver = class {};
  globalThis.ASS = class {
    constructor(body, video) {
      bodies.push(body);
      assert.equal(video.requestVideoFrameCallback, undefined);
    }
    show() {}
    hide() {}
    destroy() {
      destroyed++;
    }
  };
  try {
    const ui = screen(
      transport(
        (c) => {
          if (failWindow) c.status = 200;
        },
        createEmbeddedTextFixture({
          codecId: "S_TEXT/ASS",
          codecPrivate: assPrivate,
          secondTrack: true
        })
      )
    );
    const classes = new Set(["hidden"]);
    ui.uiRefs.assSubtitles = {
      classList: { add: (v) => classes.add(v), remove: (v) => classes.delete(v) },
      setAttribute() {},
      childNodes: [],
      textContent: "",
      replaceChildren() {}
    };
    const callback = () => {};
    let kicked = 0;
    Object.assign(PlayerController.video, {
      paused: false,
      requestVideoFrameCallback: callback,
      dispatchEvent(event) {
        if (event.type === "play") kicked++;
      }
    });
    await ui.loadEmbeddedSubtitleTracks();
    const entry = ui
      .getSubtitleEntries("builtIn")
      .find((item) => item.embeddedSubtitleTrackIndex === 0);
    assert.ok(entry);
    assert.equal(await ui.applySubtitleEntry(entry), true);
    assert.equal(ui.webOsEmbeddedTextSubtitleUsingAss, true);
    assert.match(bodies[0], /Style: Signs,Arial,42/);
    assert.equal(PlayerController.video.requestVideoFrameCallback, callback);
    assert.equal(kicked, 1);
    const previous = ui.assSubtitleRenderer;
    failWindow = true;
    const secondEntry = ui
      .getSubtitleEntries("builtIn")
      .find((item) => item.embeddedSubtitleTrackIndex === 1);
    assert.ok(secondEntry);
    assert.equal(await ui.applySubtitleEntry(secondEntry), false);
    assert.equal(ui.selectedEmbeddedSubtitleTrackIndex, 0);
    assert.equal(previous.active, true);
    assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(182), false);
    assert.equal(ui.assSubtitleRenderer, previous);
    assert.equal(previous.active, true);
    failWindow = false;
    assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(182), true);
    assert.match(bodies[1], /0:03:01\.25,0:03:03\.50/);
    ui.assSubtitleRenderer.setDelay(1000);
    await ui.applySubtitleEntry({ trackIndex: -1 });
    assert.equal(ui.assSubtitleRenderer, null);
    assert.equal(destroyed, 2);
    localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
  } finally {
    globalThis.ASS = originalAss;
    globalThis.ResizeObserver = originalObserver;
  }
});
test("real ASS to VTT fallback produces readable dialogue when renderer cannot initialize", async () => {
  const ui = screen(
    transport(
      () => {},
      createEmbeddedTextFixture({ codecId: "S_TEXT/SSA", codecPrivate: assPrivate })
    )
  );
  await ui.loadEmbeddedSubtitleTracks();
  const entry = ui
    .getSubtitleEntries("builtIn")
    .find((item) => item.embeddedSubtitleTrackIndex === 0);
  assert.equal(await ui.applySubtitleEntry(entry), true);
  assert.equal(ui.webOsEmbeddedTextSubtitleUsingHtml, true);
  assert.equal(ui.visibleCues[0].text, "Cue iniziale: città, coda");
  assert.ok(!ui.visibleCues[0].text.includes("Signs"));
  await ui.applySubtitleEntry({ trackIndex: -1 });
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("a first empty window selects successfully; native text already exposed skips probing", async () => {
  const h = transport();
  const ui = screen(h);
  await ui.loadEmbeddedSubtitleTracks();
  ui.time = 270;
  assert.equal(await ui.applySubtitleEntry({ embeddedSubtitleTrackIndex: 0 }), true);
  assert.equal(ui.webOsEmbeddedTextSubtitleUsingHtml, true);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  ui.disableEmbeddedSubtitleSelection();
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
  const other = transport();
  const nativeUi = screen(other);
  PlayerController.video.textTracks = [{ mode: "showing", kind: "subtitles" }];
  await nativeUi.loadEmbeddedSubtitleTracks();
  assert.equal(other.calls.length, 0);
  assert.equal(PlayerController.video.textTracks[0].mode, "showing");
});
test("recovery replacing video/playback token rejects a late first selection on the same URL", async () => {
  let held = false;
  const h = transport((c) => {
    c.hold = held;
  });
  const ui = screen(h);
  await ui.loadEmbeddedSubtitleTracks();
  held = true;
  const selection = ui.applySubtitleEntry({ embeddedSubtitleTrackIndex: 0 });
  PlayerController.video = { ...PlayerController.video, textTracks: [] };
  PlayerController.playRequestToken++;
  h.held.forEach((resolve) => resolve());
  assert.equal(await selection, false);
  assert.equal(ui.selectedEmbeddedSubtitleTrackIndex, -1);
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(ui.webOsEmbeddedTextSubtitleTrack, null);
  assert.equal(ui.vidaaEmbeddedTextPendingIndex, null);
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});
test("temporary window failure retains previous output; reselect recovers; late response after OFF is ignored", async () => {
  let failed = false;
  let held = false;
  const h = transport((c) => {
    if (failed) c.status = 200;
    c.hold = held;
  });
  const ui = screen(h);
  await ui.loadEmbeddedSubtitleTracks();
  await ui.applySubtitleEntry({ embeddedSubtitleTrackIndex: 0 });
  const cues = ui.htmlSubtitleCues;
  failed = true;
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(100), false);
  assert.equal(ui.htmlSubtitleCues, cues);
  assert.equal(ui.webOsEmbeddedTextSubtitleFallbackUnavailable, false);
  assert.equal(
    ui.getSubtitleEntries("builtIn").find((item) => item.embeddedSubtitleTrackIndex === 0).disabled,
    false
  );
  failed = false;
  assert.equal(await ui.loadWebOsEmbeddedTextSubtitleWindow(100), true);
  held = true;
  const pending = ui.loadWebOsEmbeddedTextSubtitleWindow(182);
  await ui.applySubtitleEntry({ trackIndex: -1 });
  assert.equal(await pending, false);
  h.held.forEach((resolve) => resolve());
  assert.equal(ui.htmlSubtitleCues.length, 0);
  assert.equal(ui.webOsEmbeddedTextSubtitleTrack, null);
  localMediaEmbeddedSubtitleRepository.disposeVidaaSource();
});

try {
  for (const { name, run } of tests) {
    await run();
    console.log(`PASS ${name}`);
  }
  console.log(
    `${tests.length}/${tests.length} VIDAA embedded provider tests passed (simulated HTTP; TV still unverified).`
  );
} finally {
  vidaaEmbeddedTextProvider.dispose();
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  console.warn = originalWarn;
  consumerTimers.clear();
}
