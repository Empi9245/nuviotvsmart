import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { createHomeScreenMethods29 } =
  await import("../js/ui/screens/home/homeScreenMethods-29-setup-modern-track-scroll-pagination.js");
const { Router, buildModernRowKey } = await import("../js/ui/screens/home/homeScreenContext.js");
const { catalogRepository } = await import("../js/data/repository/catalogRepository.js");
const {
  noteVidaaNavigationKeyDown,
  noteVidaaNavigationKeyUp,
  resetVidaaNavigationActivity,
  isVidaaNavigationBusy
} = await import("../js/ui/navigation/vidaaNavigationActivity.js");
let now = 0,
  id = 0;
Date.now = () => now;
const timers = new Map();
globalThis.setTimeout = (callback, delay) => {
  const key = ++id;
  timers.set(key, { callback, at: now + delay });
  return key;
};
globalThis.clearTimeout = (key) => timers.delete(key);
Router.getCurrent = () => "home";
globalThis.document = {
  createRange: () => ({ createContextualFragment: () => ({ querySelectorAll: () => [] }) })
};
function advance(next) {
  now = next;
  for (const [key, timer] of [...timers])
    if (timer.at <= now && timers.has(key)) {
      timers.delete(key);
      timer.callback();
    }
}
const flush = async () => {
  for (let n = 0; n < 5; n++) await Promise.resolve();
};
function surface(count = 60) {
  const rows = Array.from({ length: count }, (_, i) => ({
    type: "movie",
    addonId: "test",
    catalogId: `catalog-${i}`,
    result: { status: "success", data: { items: [{ id: `${i}-first` }], hasMore: true } }
  }));
  let scans = 0,
    appends = 0,
    focused;
  const tracks = rows.map((row) => ({
    isConnected: true,
    dataset: { trackRowKey: buildModernRowKey(row) },
    clientWidth: 800,
    scrollWidth: 800,
    scrollLeft: 0,
    querySelectorAll() {
      scans++;
      return [{ offsetWidth: 200 }];
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {
      appends++;
    }
  }));
  const owner = {
    ...createHomeScreenMethods29(),
    layoutMode: "modern",
    homeLoadToken: 1,
    rows,
    container: { querySelectorAll: () => tracks },
    getRowItemLimit: () => 5,
    getCurrentFocusedNode: () => focused,
    isScrollAnimationActive: () => false,
    isVidaaHomeLoadingBusy: () => isVidaaNavigationBusy(),
    scheduleHomeLazyImageHydration() {},
    invalidateNavigationModel() {},
    buildNavigationModel() {}
  };
  const focus = (index) => {
    focused = { isConnected: true, offsetWidth: 200, closest: () => tracks[index] };
    return focused;
  };
  focus(0);
  owner.setupModernTrackScrollPagination();
  return { owner, rows, tracks, focus, scans: () => scans, appends: () => appends };
}
const original = catalogRepository.getCatalog;
const requests = [];
catalogRepository.getCatalog = (args) => new Promise((resolve) => requests.push({ args, resolve }));
try {
  const state = surface();
  let peakTimers = 0;
  for (let step = 0; step < 600; step++) {
    noteVidaaNavigationKeyDown(40);
    const index = step % 60;
    const focused = state.focus(index);
    const handler = state.owner._trackScrollHandlers.get(state.tracks[index]);
    handler();
    handler.requestAhead({ focusedNode: focused, focusedIndex: 0 });
    advance(now + 80);
    peakTimers = Math.max(peakTimers, timers.size);
  }
  assert.ok(peakTimers <= 8, `Inactive rows keep polling: ${peakTimers} timers`);
  assert.equal(state.scans(), 0, "Held navigation does not scan catalogs");
  assert.equal(requests.length, 0);
  noteVidaaNavigationKeyUp(40);
  advance(now + 300);
  assert.equal(requests.length, 1, "Settling only loads the active row");
  assert.equal(requests[0].args.catalogId, "catalog-59");

  // A completed page is retained as data if navigation has moved elsewhere.
  noteVidaaNavigationKeyDown(38);
  state.focus(0);
  requests[0].resolve({
    status: "success",
    data: { items: [{ id: "new", name: "New", poster: "p" }], hasMore: false }
  });
  await flush();
  advance(now + 60);
  assert.equal(state.appends(), 0);
  assert.equal(state.rows[59].result.data.items.length, 2);
  assert.equal(timers.size, 0, "Old-row append stops polling immediately");
  noteVidaaNavigationKeyUp(38);
  advance(now + 300);
  state.focus(59);
  state.owner._trackScrollHandlers.get(state.tracks[59]).requestAhead();
  advance(now + 300);
  assert.equal(state.appends(), 1, "Revisiting appends the retained page without refetch");
  assert.equal(requests.length, 1);
  state.owner.teardownModernTrackScrollPagination();
  assert.equal(timers.size, 0);

  for (const name of ["tizen", "webos", "browser"]) {
    globalThis.__NUVIO_PLATFORM__ = name;
    Platform.current = null;
    resetVidaaNavigationActivity();
    const other = surface(3);
    const before = requests.length;
    for (let index = 0; index < 3; index++) {
      other.focus(index);
      other.owner._trackScrollHandlers.get(other.tracks[index]).requestAhead();
    }
    advance(now + 300);
    assert.equal(requests.length - before, 3, `${name}: retain existing row prefetch behavior`);
    other.owner.teardownModernTrackScrollPagination();
  }
  console.log(
    `VIDAA pagination recovery passed: 600 row changes, peak ${peakTimers} timers, active-row loading, cached-page return and platform isolation.`
  );
} finally {
  catalogRepository.getCatalog = original;
}
