import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { getTvRuntimePerformanceProfile, resetTvRuntimePerformanceProfile } =
  await import("../js/platform/tvRuntimePerformance.js");
const { Router } = await import("../js/ui/navigation/routerState.js");
const { noteVidaaNavigationKeyDown, noteVidaaNavigationKeyUp, resetVidaaNavigationActivity } =
  await import("../js/ui/navigation/vidaaNavigationActivity.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { createHomeScreenMethods04 } =
  await import("../js/ui/screens/home/homeScreenMethods-04-get-hero-focus-delay.js");
const { createHomeScreenMethods10 } =
  await import("../js/ui/screens/home/homeScreenMethods-10-schedule-modern-hero-update.js");
const { createHomeScreenMethods11 } =
  await import("../js/ui/screens/home/homeScreenMethods-11-enrich-current-hero-async.js");
const { createHomeScreenMethods14 } =
  await import("../js/ui/screens/home/homeScreenMethods-14-activate-focused-poster-flow.js");
const { createHomeScreenMethods15 } =
  await import("../js/ui/screens/home/homeScreenMethods-15-schedule-focused-poster-flow.js");
const { metaRepository, mdbListRepository, TmdbSettingsStore } =
  await import("../js/ui/screens/home/homeScreenContext.js");
const { heroImagePreloadCache } =
  await import("../js/ui/screens/home/homeScreenHelpers-02-extract-release-date-text.js");

let now = 0;
let nextId = 0;
const timers = new Map();
const frames = new Map();
const imageLoads = [];
Date.now = () => now;
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++nextId;
  timers.set(id, { callback, at: now + Number(delay) });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.Image = class {
  constructor() {
    this.complete = true;
    this.naturalWidth = 100;
  }
  set src(value) {
    imageLoads.push(value);
  }
};
Router.getCurrent = () => "home";
TmdbSettingsStore.get = () => ({ enabled: false });

async function flush() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}
async function advance(time) {
  for (;;) {
    const pending = [...timers]
      .filter(([, timer]) => timer.at <= time)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!pending) break;
    const [id, timer] = pending;
    now = timer.at;
    timers.delete(id);
    timer.callback();
    await flush();
  }
  now = time;
  await flush();
}
async function paint() {
  for (const [id, callback] of [...frames]) {
    if (frames.delete(id)) callback(now);
  }
  await flush();
}
function reset(name = "vidaa") {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  resetTvRuntimePerformanceProfile();
  assert.equal(getTvRuntimePerformanceProfile().platform, name);
  now = 0;
  timers.clear();
  frames.clear();
  imageLoads.length = 0;
  heroImagePreloadCache.clear();
  resetVidaaNavigationActivity();
}
function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
const classList = { add() {}, remove() {}, contains: () => true };
function card(id) {
  return {
    isConnected: true,
    dataset: { itemId: id, itemType: "movie" },
    classList,
    hero: { id, type: "movie", name: id, background: `https://example.com/${id}.jpg` }
  };
}
function home() {
  const state = {
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods04(),
    ...createHomeScreenMethods10(),
    ...createHomeScreenMethods11(),
    ...createHomeScreenMethods14(),
    ...createHomeScreenMethods15(),
    layoutMode: "modern",
    layoutPrefs: { focusedPosterBackdropExpandDelaySeconds: 0 },
    container: { querySelector: () => ({ classList }) },
    focused: null,
    heroCandidates: [],
    heroItem: { id: "previous", type: "movie" },
    commits: [],
    getCurrentFocusedNode() {
      return this.focused;
    },
    getNodeHeroSource(node) {
      return node?.hero || null;
    },
    isCollectionFolderNode: () => false,
    isModernPosterNode: () => true,
    collapseFocusedPoster() {},
    getFocusedPosterFlowConfig: () => ({
      shouldExpand: true,
      shouldPreviewTrailer: true,
      trailerTarget: "hero_media"
    }),
    restorePersistentHeroTrailer: () => false,
    isPerformanceConstrained: () => true,
    isLegacyTvRuntime: () => false,
    applyHeroToDom() {
      this.commits.push(this.heroItem);
    },
    syncCollectionHeroMedia() {}
  };
  return state;
}

// Fast horizontal and vertical traversal must start no secondary work for
// intermediate cards, including firmware repeats while focus stays at an edge.
for (const direction of [39, 40]) {
  reset();
  const state = home();
  const metadata = [];
  const trailers = [];
  const expanded = [];
  state.enrichCurrentHeroAsync = async (hero) => {
    metadata.push(hero.id);
  };
  state.prefetchFocusedPosterTrailer = async (node) => {
    trailers.push(node.hero.id);
    return null;
  };
  state.promotePosterCardAssets = (node) => {
    expanded.push(node.hero.id);
  };
  state.activateFocusedPosterFlow = async () => {};
  for (const [time, id] of [
    [0, "first"],
    [90, "middle"],
    [180, "final"]
  ]) {
    await advance(time);
    noteVidaaNavigationKeyDown(direction);
    state.focused = card(id);
    state.scheduleModernHeroUpdate(state.focused, { deferUntilVerticalSettle: direction === 40 });
    state.scheduleFocusedPosterFlow(state.focused, { deferUntilVerticalSettle: direction === 40 });
  }
  await advance(450);
  assert.deepEqual(imageLoads, [], "Held navigation must not decode interim backdrops");
  assert.deepEqual(metadata, []);
  assert.deepEqual(trailers, []);
  assert.deepEqual(expanded, []);
  noteVidaaNavigationKeyUp(direction);
  await advance(690);
  assert.deepEqual(imageLoads, [], "The final release must receive the 250ms quiet period");
  await advance(750);
  await paint();
  assert.deepEqual(metadata, ["final"]);
  assert.deepEqual(trailers, ["final"]);
  assert.deepEqual(expanded, ["final"]);
  assert.deepEqual(
    state.commits.map((hero) => hero.id),
    ["final"]
  );
  assert.deepEqual(imageLoads, ["https://example.com/final.jpg"]);
}

// Idle input alone is insufficient while either camera axis is still moving.
{
  reset();
  const state = home();
  const track = {};
  state.modernCameraFollowLastHorizontalContainer = track;
  state.scrollAnimations = new WeakMap([[track, { x: 10 }]]);
  state.focused = card("camera-pending");
  state.enrichCurrentHeroAsync = async () => {};
  state.scheduleModernHeroUpdate(state.focused);
  await advance(600);
  await paint();
  assert.deepEqual(state.commits, []);
  assert.deepEqual(imageLoads, []);
  state.scrollAnimations.get(track).x = null;
  await advance(670);
  await paint();
  assert.equal(state.commits.at(-1).id, "camera-pending");
}

// The classic/grid hero carousel also coalesces held remote input before
// starting full-size artwork requests for the selected scene.
{
  reset();
  const state = home();
  state.layoutMode = "classic";
  state.heroCandidates = [
    card("carousel-first").hero,
    card("carousel-middle").hero,
    card("carousel-final").hero
  ];
  state.heroIndex = 0;
  state.heroItem = state.heroCandidates[0];
  noteVidaaNavigationKeyDown(39);
  state.rotateHero(1);
  await advance(90);
  state.rotateHero(1);
  await advance(450);
  assert.deepEqual(imageLoads, []);
  assert.deepEqual(state.commits, []);
  noteVidaaNavigationKeyUp(39);
  await advance(750);
  assert.deepEqual(imageLoads, ["https://example.com/carousel-final.jpg"]);
  assert.equal(state.commits.at(-1).id, "carousel-final");
}

// Actual repository requests wait until idle. A stale response must be
// discarded before its new artwork is decoded or published to the hero.
{
  reset();
  const requests = [];
  const responses = new Map();
  metaRepository.getMetaFromAllAddons = (_type, id) => {
    requests.push(id);
    const response = deferred();
    responses.set(id, response);
    return response.promise;
  };
  mdbListRepository.getImdbRatingForItem = async () => null;
  const state = home();
  state.heroFocusToken = 1;
  state.focused = card("discard-before-request");
  state.heroItem = state.focused.hero;
  noteVidaaNavigationKeyDown(39);
  const pending = state.enrichCurrentHeroAsync(state.heroItem, 1, { deferCommit: true });
  await advance(100);
  assert.deepEqual(requests, []);
  state.heroFocusToken = 2;
  state.focused = card("late-response");
  state.heroItem = state.focused.hero;
  await advance(120);
  await pending;
  assert.deepEqual(requests, []);
  const late = state.enrichCurrentHeroAsync(state.heroItem, 2, { deferCommit: true });
  noteVidaaNavigationKeyUp(39);
  await advance(420);
  assert.deepEqual(requests, ["late-response"]);
  state.heroFocusToken = 3;
  state.focused = card("settled");
  state.heroItem = state.focused.hero;
  responses
    .get("late-response")
    .resolve({ status: "success", data: { background: "https://example.com/stale.jpg" } });
  await flush();
  await late;
  assert.deepEqual(imageLoads, []);
  assert.deepEqual(state.commits, []);
  const settled = state.enrichCurrentHeroAsync(state.heroItem, 3, { deferCommit: true });
  await flush();
  assert.deepEqual(requests, ["late-response", "settled"]);
  noteVidaaNavigationKeyDown(39);
  responses
    .get("settled")
    .resolve({ status: "success", data: { description: "Loaded after settling" } });
  await flush();
  assert.deepEqual(imageLoads, [], "A renewed hold must also pause post-response image decoding");
  assert.deepEqual(state.commits, []);
  noteVidaaNavigationKeyUp(39);
  await advance(720);
  await settled;
  assert.equal(state.commits.at(-1).description, "Loaded after settling");
  assert.deepEqual(imageLoads, ["https://example.com/settled.jpg"]);
}

// Existing trailer responses cannot mount on a card that lost focus.
{
  reset();
  const state = home();
  const source = deferred();
  let mounts = 0;
  state.focused = card("trailer");
  state.focusedPosterFlowToken = 1;
  state.getFocusedPosterFlowConfig = () => ({
    shouldExpand: false,
    shouldPreviewTrailer: true,
    trailerTarget: "hero_media"
  });
  state.getFocusedPosterTrailerDelayMs = () => 0;
  state.prefetchFocusedPosterTrailer = () => source.promise;
  state.mountTrailerLayer = () => {
    mounts++;
  };
  const pending = state.activateFocusedPosterFlow(state.focused, 1);
  await flush();
  noteVidaaNavigationKeyDown(39);
  state.focused = card("other");
  state.focusedPosterFlowToken = 2;
  source.resolve({ kind: "video", url: "https://example.com/trailer.mp4" });
  await flush();
  await pending;
  assert.equal(mounts, 0);
}

// Tizen/webOS/browser retain the prior early artwork and trailer prefetch.
for (const name of ["tizen", "webos", "browser"]) {
  reset(name);
  const state = home();
  const trailers = [];
  state.focused = card(`${name}-prior`);
  state.prefetchFocusedPosterTrailer = async () => {
    trailers.push(name);
  };
  state.promotePosterCardAssets = () => {};
  state.activateFocusedPosterFlow = async () => {};
  noteVidaaNavigationKeyDown(39);
  state.scheduleModernHeroUpdate(state.focused);
  state.scheduleFocusedPosterFlow(state.focused);
  await advance(120);
  assert.equal(imageLoads.length, 1, `${name} retains 120ms artwork preload`);
  assert.deepEqual(trailers, []);
  await advance(150);
  assert.deepEqual(trailers, [name], `${name} retains 150ms trailer prefetch`);
  assert.equal(state.isVidaaHomeLoadingBusy(), false);
}

console.log(
  "VIDAA Home loading checks passed: settled info/artwork/trailers, stale responses and platform isolation."
);
