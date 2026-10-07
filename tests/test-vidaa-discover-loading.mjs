import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.HTMLImageElement = class {};
const { Platform } = await import("../js/platform/index.js");
const { Router } = await import("../js/ui/navigation/routerState.js");
const {
  noteVidaaNavigationKeyDown,
  noteVidaaNavigationKeyUp,
  isVidaaNavigationBusy,
  resetVidaaNavigationActivity
} = await import("../js/ui/navigation/vidaaNavigationActivity.js");
const { createDiscoverScreenMethods01 } =
  await import("../js/ui/screens/search/discoverScreenMethods-01-clear-closing-picker.js");
const { createDiscoverScreenMethods02 } =
  await import("../js/ui/screens/search/discoverScreenMethods-02-reload-items.js");
const { createDiscoverScreenMethods05 } =
  await import("../js/ui/screens/search/discoverScreenMethods-05-restore-content-focus.js");
const { createDiscoverScreenMethods06 } =
  await import("../js/ui/screens/search/discoverScreenMethods-06-bind-card-events.js");
let now = 1000;
let nextId = 0;
let reads = 0;
const timers = new Map();
const frames = new Map();
Date.now = () => now;
globalThis.setTimeout = (callback, delay) => {
  const id = ++nextId;
  timers.set(id, { callback, at: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
Router.getCurrent = () => "discover";
function frame(time) {
  now = time;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}
function timeouts(time) {
  now = time;
  for (const [id, timer] of [...timers]) {
    if (timer.at <= time) {
      timers.delete(id);
      timer.callback();
    }
  }
}
function setPlatform(platform) {
  globalThis.__NUVIO_PLATFORM__ = platform;
  Platform.current = null;
  timers.clear();
  frames.clear();
  resetVidaaNavigationActivity();
}
const scroller = {
  getBoundingClientRect() {
    reads += 1;
    return { top: 0, bottom: 500, left: 0, right: 1000 };
  }
};
const images = Array.from({ length: 9 }, (_, index) => {
  const image = new HTMLImageElement();
  Object.assign(image, {
    isConnected: true,
    dataset: { src: `poster-${index}.jpg` },
    removeAttribute(name) {
      if (name === "data-src") delete this.dataset.src;
    },
    getBoundingClientRect() {
      reads += 1;
      return { top: 0, bottom: 200, left: 0, right: 200 };
    }
  });
  return image;
});
let renders = 0;
const owner = {
  ...createDiscoverScreenMethods01(),
  ...createDiscoverScreenMethods05(),
  ...createDiscoverScreenMethods06(),
  container: {
    style: {},
    querySelector: () => ({}),
    querySelectorAll: () => images.filter((image) => image.dataset.src)
  },
  getContentScroller: () => scroller,
  render: () => {
    renders += 1;
  }
};
setPlatform("vidaa");
noteVidaaNavigationKeyDown(39);
for (let i = 0; i < 15; i += 1) {
  owner.requestRender();
  owner.scheduleDiscoverPosterHydration();
}
assert.equal(timers.size, 2, "Coalesce loading and render requests while navigating");
assert.equal(frames.size, 0);
assert.equal(reads, 0, "Held navigation must not scan poster geometry");
now = 1200;
noteVidaaNavigationKeyDown(39);
noteVidaaNavigationKeyUp(39);
timeouts(1449);
assert.equal(frames.size, 0, "Respect quiet time after key release");
timeouts(1510);
frame(1530);
assert.equal(renders, 1);
assert.equal(
  images.filter((image) => image.src).length,
  0,
  "Separate geometry scan and source assignment"
);
frame(1546);
assert.equal(images.filter((image) => image.src).length, 4, "VIDAA commits bounded image batches");
noteVidaaNavigationKeyDown(39);
frame(1562);
assert.equal(
  images.filter((image) => image.src).length,
  4,
  "New navigation pauses pending image loads"
);
noteVidaaNavigationKeyUp(39);
timeouts(1820);
frame(1840);
frame(1856);
frame(1880);
assert.equal(images.filter((image) => image.src).length, 9);

// Existing pages wait to request pagination while held; old route/load tokens
// must not wake another request after cleanup or catalog changes.
let selections = 0;
const pageOwner = {
  ...owner,
  ...createDiscoverScreenMethods02(),
  items: [{}],
  hasMore: true,
  loading: false,
  loadToken: 1,
  getSelectedCatalog: () => {
    selections += 1;
    return null;
  }
};
now = 2000;
noteVidaaNavigationKeyDown(40);
await pageOwner.loadNextPage({ preserveViewport: true });
assert.equal(selections, 0);
pageOwner.loadToken += 1;
noteVidaaNavigationKeyUp(40);
timeouts(2300);
assert.equal(selections, 0, "Drop deferred requests after the catalog token changes");

now = 3000;
noteVidaaNavigationKeyDown(39);
assert.equal(isVidaaNavigationBusy(), true);
now = 4001;
assert.equal(isVidaaNavigationBusy(), false, "A missing keyup cannot suspend loading forever");
for (const platform of ["tizen", "webos", "browser"]) {
  setPlatform(platform);
  const other = { ...owner, renderFrame: null, discoverPosterHydrationRaf: 0 };
  noteVidaaNavigationKeyDown(39);
  assert.equal(isVidaaNavigationBusy(), false);
  other.requestRender();
  assert.equal(frames.size, 1, `${platform}: render still schedules immediately`);
  assert.equal(timers.size, 0, `${platform}: no VIDAA settle timer`);
  frames.clear();
}
console.log(
  "VIDAA loading checks passed: held-input deferral, bounded images, resumed loading, stale pagination and platform isolation."
);
