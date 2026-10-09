import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.fetch = async () => {
  throw new Error("Unexpected network request");
};

const { StreamScreen, Router, streamRepository, watchProgressRepository } =
  await import("../js/ui/screens/stream/streamScreen.js");

const navigations = [];
const originalNavigate = Router.navigate;
const originalPause = streamRepository.setLocalPluginSearchPaused;
const originalResume = watchProgressRepository.getResumeByContentId;
Router.navigate = (route, params) => navigations.push({ route, params });
streamRepository.setLocalPluginSearchPaused = () => {};

const streams = [
  { id: "b1", addonName: "Source B", addonOrderIndex: 1, url: "https://b.example/1" },
  { id: "c1", addonName: "Source C", addonOrderIndex: 2, url: "https://c.example/1" },
  { id: "a1", addonName: "Source A", addonOrderIndex: 0, url: "https://a.example/1" },
  { id: "b2", addonName: "Source B", addonOrderIndex: 1, url: "https://b.example/2" }
];
function screen(overrides = {}) {
  return {
    ...StreamScreen,
    streams: streams.slice(),
    sourceChips: [],
    addonFilter: "Source B",
    _filteredStreamsCache: null,
    params: { itemId: "tt1234567", itemType: "movie", startFromBeginning: true },
    cancelAutoPlayCountdown() {},
    cancelAutoPlaySelectionWait() {},
    getBackdropUrl: () => null,
    ...overrides
  };
}

try {
  const filtered = screen();
  await filtered.playStream("b2");
  const first = navigations.at(-1);
  assert.equal(first.route, "player");
  assert.equal(first.params.streamUrl, "https://b.example/2");
  assert.equal(
    first.params.preferredStreamId,
    "b2",
    "The selected source must remain first to play"
  );
  assert.deepEqual(
    first.params.streamCandidates.map((stream) => stream.id),
    ["a1", "b1", "b2", "c1"],
    "An addon filter must not discard fallback sources or change source order"
  );
  assert.equal(first.params.playbackSourceContext.selectedStreamId, "b2");
  assert.equal(filtered.addonFilter, "Source B", "Playback must preserve the chooser filter");

  await screen().playStream("missing-id");
  assert.equal(
    navigations.at(-1).params.preferredStreamId,
    "b1",
    "An unavailable selected ID must fall back to the first visible source"
  );
  const count = navigations.length;
  await screen({ addonFilter: "Empty source" }).playStream("a1");
  assert.equal(
    navigations.length,
    count,
    "An empty filter must not start an unrelated hidden source"
  );

  let finishResume;
  watchProgressRepository.getResumeByContentId = () =>
    new Promise((resolve) => {
      finishResume = resolve;
    });
  const nextEpisode = { season: 1, episode: 2, id: "tt1234567:1:2" };
  const pending = screen({
    params: {
      itemId: "tt1234567",
      itemType: "series",
      videoId: "tt1234567:1:2",
      season: 1,
      episode: 2,
      episodes: [nextEpisode]
    }
  });
  const play = pending.playStream("b2");
  const lateSource = {
    id: "d1",
    addonName: "Source D",
    addonOrderIndex: 3,
    url: "https://d.example/1"
  };
  pending.streams = [...pending.streams, lateSource];
  finishResume({ positionMs: 120000, durationMs: 3600000 });
  await play;
  const last = navigations.at(-1).params;
  assert.deepEqual(
    last.streamCandidates.map((stream) => stream.id),
    ["a1", "b1", "b2", "c1", "d1"],
    "Fallback candidates must include sources received while resume lookup is pending"
  );
  assert.equal(last.preferredStreamId, "b2");
  assert.equal(last.resumePositionMs, 120000);
  assert.equal(last.videoId, "tt1234567:1:2");
  assert.deepEqual(last.episodes, [nextEpisode]);
} finally {
  Router.navigate = originalNavigate;
  streamRepository.setLocalPluginSearchPaused = originalPause;
  watchProgressRepository.getResumeByContentId = originalResume;
}

console.log("PASS: chooser forwards all ordered fallback sources and preserves the chosen stream.");
