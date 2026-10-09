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
const { createHomeScreenMethods19 } =
  await import("../js/ui/screens/home/homeScreenMethods-19-handle-home-dpad.js");
const { createHomeScreenMethods21 } =
  await import("../js/ui/screens/home/homeScreenMethods-21-load-data.js");
const {
  metaRepository,
  mdbListRepository,
  TmdbSettingsStore,
  addonRepository,
  watchedItemsRepository,
  watchProgressRepository,
  LayoutPreferences,
  buildCatalogOrderKey
} = await import("../js/ui/screens/home/homeScreenContext.js");
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
    ...createHomeScreenMethods19(),
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

function watchFocusWork(state) {
  const work = { metadata: [], trailers: [], promoted: [], activated: [] };
  state.enrichCurrentHeroAsync = async (hero) => work.metadata.push(hero.id);
  state.prefetchFocusedPosterTrailer = async (node) => {
    work.trailers.push(node.hero.id);
    return null;
  };
  state.promotePosterCardAssets = (node) => work.promoted.push(node.hero.id);
  state.activateFocusedPosterFlow = async (node) => work.activated.push(node.hero.id);
  return work;
}

function navigate(state, name, direction, id, { held = false } = {}) {
  if (name === "vidaa") {
    noteVidaaNavigationKeyDown(direction);
    if (!held) noteVidaaNavigationKeyUp(direction);
  }
  const accepted = !state.shouldThrottleHomeDirectionalInput(direction === 40 ? "down" : "right");
  if (accepted) {
    state.focused = card(id);
    state.scheduleModernHeroUpdate(state.focused, { deferUntilVerticalSettle: direction === 40 });
    state.scheduleFocusedPosterFlow(state.focused, { deferUntilVerticalSettle: direction === 40 });
  }
  return accepted;
}

// Use the production input gate: a second arrow inside 60ms can be skipped for
// focus, but it must still keep the pending 120/150ms media work suspended.
// Later held repeats and release/repress taps at 160-200ms must have the same
// quiet window, and only the final accepted card may start secondary work.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  for (const direction of [39, 40]) {
    for (const held of [false, true]) {
      reset(name);
      const state = home();
      state.layoutPrefs.focusedPosterBackdropExpandDelaySeconds = 0.2;
      const work = watchFocusWork(state);
      const label = `${name} ${direction === 40 ? "vertical" : "horizontal"} ${held ? "held" : "taps"}`;
      for (const [time, id] of [
        [0, "first"],
        [60, "skipped"],
        [220, "middle-a"],
        [420, "middle-b"],
        [600, "final"]
      ]) {
        await advance(time);
        await paint();
        const accepted = navigate(state, name, direction, id, { held });
        assert.equal(accepted, id !== "skipped", `${label}: production cadence`);
        assert.deepEqual(imageLoads, [], `${label}: no intermediate artwork decoding`);
        assert.deepEqual(
          work,
          { metadata: [], trailers: [], promoted: [], activated: [] },
          `${label}: no intermediate focus effects`
        );
        assert.deepEqual(state.commits, [], `${label}: no intermediate hero commits`);
      }
      if (held && name === "vidaa") {
        await advance(660);
        noteVidaaNavigationKeyUp(direction);
      }
      await advance(held && name === "vidaa" ? 900 : 849);
      await paint();
      assert.deepEqual(imageLoads, [], `${label}: retain the complete quiet window`);
      assert.deepEqual(work, { metadata: [], trailers: [], promoted: [], activated: [] });
      await advance(1150);
      await paint();
      assert.deepEqual(
        imageLoads,
        ["https://example.com/final.jpg"],
        `${label}: decode the settled card only`
      );
      assert.deepEqual(work, {
        metadata: ["final"],
        trailers: ["final"],
        promoted: ["final"],
        activated: ["final"]
      });
      assert.deepEqual(
        state.commits.map((hero) => hero.id),
        ["final"]
      );
      assert.equal(timers.size, 0, `${label}: settled flow must leave no polling timers`);
    }
  }
}

// Route/focus cleanup must cancel both polling paths after a skipped arrow has
// made them wait. A stale card must not restart previews or keep polling.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  reset(name);
  const state = home();
  state.layoutPrefs.focusedPosterBackdropExpandDelaySeconds = 0.2;
  const work = watchFocusWork(state);
  navigate(state, name, 39, "cleanup");
  await advance(60);
  assert.equal(navigate(state, name, 39, "skipped"), false);
  await advance(160);
  state.cancelFocusedPosterFlow();
  state.cancelPendingHeroFocus();
  assert.equal(timers.size, 0, `${name}: cleanup cancels media settle polling`);
  state.focused = card("other-route");
  await advance(1200);
  await paint();
  assert.deepEqual(imageLoads, []);
  assert.deepEqual(work, { metadata: [], trailers: [], promoted: [], activated: [] });
  assert.deepEqual(state.commits, []);

  reset(name);
  const stale = home();
  stale.layoutPrefs.focusedPosterBackdropExpandDelaySeconds = 0.2;
  const staleWork = watchFocusWork(stale);
  navigate(stale, name, 39, "lost-focus");
  await advance(60);
  navigate(stale, name, 39, "skipped");
  await advance(160);
  stale.focused = card("different-card");
  await advance(1200);
  await paint();
  assert.equal(
    timers.size,
    0,
    `${name}: invalid focus must stop polling before checking navigation state`
  );
  assert.deepEqual(staleWork, { metadata: [], trailers: [], promoted: [], activated: [] });
  assert.deepEqual(imageLoads, []);
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

// A single accepted tap keeps its original media timing; the burst gate must
// not slow normal navigation or an immediate expansion preference.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  reset(name);
  const state = home();
  const work = watchFocusWork(state);
  const id = `${name}-first-tap`;
  assert.equal(navigate(state, name, 39, id), true);
  assert.equal(state.isHomeNavigationSettling(), false);
  await advance(120);
  assert.equal(
    imageLoads.length,
    name === "vidaa" ? 0 : 1,
    `${name}: retain the first-tap artwork timing`
  );
  assert.deepEqual(
    work.activated,
    name === "vidaa" ? [] : [id],
    `${name}: retain the immediate expansion preference`
  );
  assert.deepEqual(work.trailers, []);
  await advance(150);
  assert.deepEqual(
    work.trailers,
    name === "vidaa" ? [] : [id],
    `${name}: retain the first-tap trailer timing`
  );
  if (name === "vidaa") {
    await advance(249);
    assert.deepEqual(imageLoads, []);
    await advance(250);
    assert.deepEqual(imageLoads, [`https://example.com/${id}.jpg`]);
    assert.deepEqual(work.trailers, [id]);
    assert.deepEqual(work.activated, [id]);
  }
}

// A resumed Home refresh must use the same input-aware render scheduler as
// progressive responses. Previously these two completion paths rendered inline
// despite a held arrow, reattaching the whole catalog during navigation.
const originalAddons = addonRepository.getInstalledAddons;
const originalWatched = watchedItemsRepository.getAll;
const originalAllProgress = watchProgressRepository.getAllForContinueWatching;
const originalRecent = watchProgressRepository.getRecent;
const originalPrefs = LayoutPreferences.get;
const never = () => new Promise(() => {});
watchedItemsRepository.getAll = never;
watchProgressRepository.getAllForContinueWatching = never;
watchProgressRepository.getRecent = never;
LayoutPreferences.get = () => ({ homeLayout: "modern", continueWatchingEnabled: false });
addonRepository.getInstalledAddons = async () => [
  {
    id: "test",
    baseUrl: "https://invalid.test",
    displayName: "Test",
    catalogs: [{ id: "demo", apiType: "movie", name: "Demo" }]
  }
];
try {
  for (const name of ["vidaa", "tizen", "webos", "browser"]) {
    for (const inputMode of ["platform-held", "rapid-burst"]) {
      for (const operation of ["background-load", "catalog-refresh", "cold-load"]) {
        reset(name);
        let renders = 0;
        const row = {
          addonId: "test",
          addonBaseUrl: "https://invalid.test",
          type: "movie",
          catalogId: "demo",
          homeCatalogKey: buildCatalogOrderKey("test", "movie", "demo"),
          result: { status: "success", data: { items: [{ id: "old", type: "movie" }] } }
        };
        const fresh = {
          ...row,
          result: { status: "success", data: { items: [{ id: "new", type: "movie" }] } }
        };
        const state = {
          ...createHomeScreenMethods03(),
          ...createHomeScreenMethods04(),
          ...createHomeScreenMethods19(),
          ...createHomeScreenMethods21(),
          container: {},
          layoutMode: "modern",
          hasLoadedOnce: true,
          continueWatchingInitialResolved: true,
          hasUserInteractedSinceHomePaint: true,
          rows: [row],
          heroCandidates: [],
          buildSyncSensitiveHomeSignature: () => "inputs",
          buildHomeRouteInputSignature: () => "inputs",
          fetchCatalogRows: async () => [fresh],
          sortAndFilterRows: (rows) => rows,
          collectHeroCandidates: () => [],
          pickInitialHero: () => null,
          retryPendingCatalogRows() {},
          refreshWatchedTitleState() {},
          captureCurrentFocusState: () => null,
          getInitialCatalogLoadCount: () => 1,
          getDeferredCatalogBatchSize: () => 1,
          getBackgroundRenderDelay: () => 0,
          isPerformanceConstrained: () => false,
          isLegacyTvRuntime: () => false,
          render() {
            renders++;
          }
        };
        const label = `${name} ${inputMode} ${operation}`;
        if (inputMode === "platform-held") {
          noteVidaaNavigationKeyDown(39);
        } else {
          state.shouldThrottleHomeDirectionalInput("right");
          await advance(60);
          state.shouldThrottleHomeDirectionalInput("right");
          assert.equal(
            state.isHomeNavigationSettling(),
            true,
            `${label}: production burst input state`
          );
        }
        if (operation === "catalog-refresh") await state.refreshHomeCatalogsIfStale();
        else
          await state.loadData({
            background: operation === "background-load",
            preserveReturnState: true
          });
        const deferred =
          (name === "vidaa" || inputMode === "rapid-burst") && operation !== "cold-load";
        assert.equal(renders, deferred ? 0 : 1, `${label}: completion render policy`);
        if (deferred) {
          await paint();
          assert.equal(renders, 0, `${label}: arrows must keep the live Home responsive`);
          if (inputMode === "rapid-burst") {
            await advance(309);
            await paint();
            assert.equal(
              renders,
              0,
              `${label}: no background DOM changes before the full quiet window`
            );
          } else {
            noteVidaaNavigationKeyUp(39);
          }
          await advance(400);
          await paint();
          assert.equal(renders, 1, `${label}: refreshed data must render once after input settles`);
        }
      }
    }
  }
} finally {
  addonRepository.getInstalledAddons = originalAddons;
  watchedItemsRepository.getAll = originalWatched;
  watchProgressRepository.getAllForContinueWatching = originalAllProgress;
  watchProgressRepository.getRecent = originalRecent;
  LayoutPreferences.get = originalPrefs;
}

console.log(
  "Home loading checks passed: cross-runtime held/tap media settling, unchanged single-tap timing, polling cleanup and stale responses."
);
