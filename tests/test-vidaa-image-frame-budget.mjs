import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.HTMLElement = class {};
globalThis.HTMLImageElement = class extends HTMLElement {};
const { Platform } = await import("../js/platform/index.js");
const { resetTvRuntimePerformanceProfile } = await import("../js/platform/tvRuntimePerformance.js");
const { resetVidaaNavigationActivity } =
  await import("../js/ui/navigation/vidaaNavigationActivity.js");
const { createHomeScreenMethods24 } =
  await import("../js/ui/screens/home/homeScreenMethods-24-schedule-home-lazy-image-hydration.js");
const { createHomeScreenMethods30 } =
  await import("../js/ui/screens/home/homeScreenMethods-30-cleanup.js");

const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
const originalDateNow = Date.now;
let time = 0;
let wallTime = 0;
let nextId = 0;
let assigned = [];
const frames = new Map();
const timers = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.setTimeout = (callback, delay) => {
  const id = ++nextId;
  timers.set(id, { callback, delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
Date.now = () => wallTime;

function reset(platform = "vidaa", clock = { now: () => time }) {
  globalThis.__NUVIO_PLATFORM__ = platform;
  Platform.current = null;
  resetTvRuntimePerformanceProfile();
  resetVidaaNavigationActivity();
  Object.defineProperty(globalThis, "performance", { configurable: true, value: clock });
  time = wallTime = 1000;
  assigned = [];
  frames.clear();
  timers.clear();
}

function frame() {
  assert.equal(frames.size, 1, "Only one image-drain frame may be pending");
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(time);
}

function image(id, cost = 0) {
  const result = Object.assign(new HTMLImageElement(), {
    isConnected: true,
    dataset: { src: id },
    closest: () => null,
    removeAttribute(name) {
      if (name === "data-src") delete this.dataset.src;
    }
  });
  Object.defineProperty(result, "src", {
    get() {
      return this.currentSrc;
    },
    set(value) {
      this.currentSrc = value;
      assigned.push(value);
      time += cost;
      wallTime += cost;
    }
  });
  return result;
}

function surface(images) {
  const owner = {
    ...createHomeScreenMethods24(),
    container: { isConnected: true },
    isVidaaHomeLoadingBusy: () => false,
    getCurrentFocusedNode: () => null
  };
  owner.commitHomeLazyImageSources(
    images.map((item) => ({ image: item, src: item.dataset.src, priority: 2 }))
  );
  return owner;
}

try {
  reset();
  {
    const owner = surface(Array.from({ length: 10 }, (_, index) => image(`fast-${index}`)));
    frame();
    assert.equal(assigned.length, 4, "Fast work retains the four-image limit");
    frame();
    assert.equal(assigned.length, 8);
    frame();
    assert.equal(assigned.length, 10);
    assert.equal(owner.homeLazyImageCommitQueue.length, 0);
    assert.equal(frames.size, 0);
    assert.equal(timers.size, 0, "Budget continuation uses RAF without polling timers");
  }

  reset();
  {
    const images = [image("secondary", 8), image("focused", 8), image("same-row", 8)];
    const owner = surface(images);
    const focusedRow = {};
    owner.homeLazyImageCommitQueue[1].row = focusedRow;
    owner.homeLazyImageCommitQueue[2].row = focusedRow;
    owner.commitHomeLazyImageSources(
      [],
      { contains: (candidate) => candidate === images[1] },
      focusedRow
    );
    frame();
    assert.deepEqual(assigned, ["focused"], "One costly focused image progresses before yielding");
    frame();
    assert.deepEqual(assigned, ["focused", "same-row"], "Focused row keeps priority across frames");
    frame();
    assert.deepEqual(assigned, ["focused", "same-row", "secondary"]);
    assert.equal(frames.size, 0);
  }

  reset();
  {
    const images = Array.from({ length: 20 }, (_, index) => image(`stale-${index}`));
    const owner = surface(images);
    for (const item of images) {
      Object.defineProperty(item, "isConnected", {
        get() {
          time += 3;
          wallTime += 3;
          return false;
        }
      });
    }
    frame();
    assert.equal(owner.homeLazyImageCommitQueue.length, 18, "Invalid scans share the time budget");
    assert.deepEqual(assigned, []);
    for (let count = 0; frames.size && count < 20; count++) frame();
    assert.equal(
      owner.homeLazyImageCommitQueue.length,
      0,
      "Invalid-only queues still make progress"
    );
    assert.equal(frames.size, 0);
  }

  reset();
  {
    const images = Array.from({ length: 25 }, (_, index) => image(`expired-${index}`));
    const owner = surface(images);
    images.slice(0, 24).forEach((item) => delete item.dataset.src);
    frame();
    assert.equal(
      owner.homeLazyImageCommitQueue.length,
      17,
      "A frozen clock still caps stale scans at eight"
    );
    frame();
    frame();
    assert.equal(owner.homeLazyImageCommitQueue.length, 1);
    frame();
    assert.deepEqual(assigned, ["expired-24"]);
    assert.equal(frames.size, 0);
  }

  for (const clock of [
    undefined,
    { now: () => NaN },
    {
      now() {
        throw Error("Unavailable clock");
      }
    }
  ]) {
    reset("vidaa", clock === undefined ? null : clock);
    const owner = surface(Array.from({ length: 5 }, (_, index) => image(`fallback-${index}`, 2)));
    frame();
    assert.equal(assigned.length, 2, "Wall-time fallback yields at four milliseconds");
    while (frames.size) frame();
    assert.equal(owner.homeLazyImageCommitQueue.length, 0);
  }

  reset("vidaa", { now: () => -time });
  {
    surface(Array.from({ length: 5 }, (_, index) => image(`backward-${index}`, 2)));
    frame();
    assert.equal(
      assigned.length,
      2,
      "Backward performance time uses the nonnegative wall-time delta"
    );
    while (frames.size) frame();
  }

  reset();
  {
    const owner = surface([image("busy", 8)]);
    owner.isVidaaHomeLoadingBusy = () => true;
    frame();
    assert.deepEqual(assigned, [], "Renewed input defers background source assignment");
    assert.equal(frames.size, 0);
    assert.equal(timers.size, 1, "Deferral retains one existing settle timer");
    assert.equal(owner.homeLazyImageCommitQueue.length, 0);
  }

  reset();
  {
    const owner = surface([image("cleanup", 8), image("cleanup-later", 8)]);
    frame();
    Object.assign(owner, createHomeScreenMethods30(), {
      hasLoadedOnce: true,
      rows: [{}],
      container: { childNodes: [{}], style: {}, classList: { add() {} } }
    });
    for (const name of [
      "cancelModernSidebarPillAutoCollapse",
      "cancelPendingContinueWatchingEnter",
      "cancelPendingContinueWatchingHold",
      "destroyHomeHoldDialog",
      "unlockHomeHoldFocus",
      "persistCurrentFocusState",
      "cancelInitialHomeLoadTimeout",
      "cancelScheduledRender",
      "cancelModernCameraFollow",
      "endModernVerticalFastScroll",
      "stopHeroRotation",
      "cancelPendingHeroFocus",
      "cancelFocusedPosterFlow",
      "clearFocusedPosterFlowState",
      "collapseFocusedPoster",
      "clearHomeTrailerLayers",
      "teardownGridStickyHeader",
      "teardownModernTrackScrollPagination",
      "teardownContinueWatchingProgressiveRendering"
    ])
      owner[name] = () => {};
    owner.cleanup();
    assert.equal(frames.size, 0, "Route cleanup cancels budget continuation");
    assert.equal(owner.homeLazyImageCommitQueue.length, 0);
    assert.deepEqual(assigned, ["cleanup"]);
  }

  for (const platform of ["tizen", "webos", "browser"]) {
    reset(platform);
    const images = Array.from({ length: 13 }, (_, index) => image(`${platform}-${index}`, 100));
    const owner = surface(images);
    images.slice(0, 10).forEach((item) => delete item.dataset.src);
    frame();
    assert.equal(
      assigned.length,
      2,
      `${platform}: preserve the legacy per-frame limit without a time budget`
    );
    assert.equal(
      owner.homeLazyImageCommitQueue.length,
      1,
      `${platform}: preserve stale-entry processing`
    );
    frame();
    assert.equal(frames.size, 0);
  }
  console.log(
    "VIDAA image frame budget passed: four milliseconds, four assignments, bounded stale scans, clock fallback, focus priority and lifecycle isolation."
  );
} finally {
  Date.now = originalDateNow;
  if (originalPerformance) Object.defineProperty(globalThis, "performance", originalPerformance);
  else delete globalThis.performance;
}
