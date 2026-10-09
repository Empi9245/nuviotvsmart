import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { createHomeScreenMethods29 } =
  await import("../js/ui/screens/home/homeScreenMethods-29-setup-modern-track-scroll-pagination.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { createHomeScreenMethods19 } =
  await import("../js/ui/screens/home/homeScreenMethods-19-handle-home-dpad.js");
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
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods19(),
    ...createHomeScreenMethods29(),
    layoutMode: "modern",
    homeLoadToken: 1,
    rows,
    container: { querySelectorAll: () => tracks },
    getRowItemLimit: () => 5,
    getDirectionalRepeatThrottleMs: () => 112,
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
    const burst = surface();
    const burstRequestStart = requests.length;
    let burstPeakTimers = 0;
    // Start within an ongoing burst, using Home's real cadence and settle
    // helpers. A single ordinary first press retains its normal prefetch below.
    burst.owner.lastHomeInputAt = now - 80;
    for (let step = 0; step < 600; step++) {
      burst.owner.shouldThrottleHomeDirectionalInput("down");
      const index = step % 60;
      const focused = burst.focus(index);
      const handler = burst.owner._trackScrollHandlers.get(burst.tracks[index]);
      handler();
      handler.requestAhead({ focusedNode: focused, focusedIndex: 0 });
      advance(now + 80);
      burstPeakTimers = Math.max(burstPeakTimers, timers.size);
    }
    assert.ok(
      burstPeakTimers <= 8,
      `${name}: inactive burst rows keep polling: ${burstPeakTimers} timers`
    );
    assert.equal(burst.scans(), 0, `${name}: bursts must skip catalog geometry`);
    assert.equal(
      requests.length,
      burstRequestStart,
      `${name}: bursts must not fetch rows that were left`
    );
    advance(now + 300);
    assert.equal(
      requests.length - burstRequestStart,
      1,
      `${name}: settling loads only the active row`
    );
    assert.equal(requests.at(-1).args.catalogId, "catalog-59");

    // Returning data during a new burst waits for navigation. Leaving its row
    // cancels that append, and the next quiet visit uses the retained data.
    burst.owner.shouldThrottleHomeDirectionalInput("up");
    advance(now + 80);
    burst.owner.shouldThrottleHomeDirectionalInput("up");
    requests[burstRequestStart].resolve({
      status: "success",
      data: { items: [{ id: `${name}-new`, name: "New", poster: "p" }], hasMore: false }
    });
    await flush();
    assert.equal(
      burst.rows[59].result.data.items.length,
      2,
      `${name}: keep the returned page in row data`
    );
    assert.equal(burst.appends(), 0, `${name}: returning data must defer DOM work during a burst`);
    assert.equal(timers.size, 1, `${name}: the active row may have one deferred append`);
    burst.focus(0);
    advance(now + 60);
    assert.equal(
      burst.appends(),
      0,
      `${name}: a deferred append must not mutate a row that was left`
    );
    assert.equal(timers.size, 0, `${name}: inactive append must not leave polling behind`);
    advance(now + 300);
    burst.focus(59);
    burst.owner._trackScrollHandlers.get(burst.tracks[59]).requestAhead();
    advance(now + 300);
    assert.equal(burst.appends(), 1, `${name}: revisit appends retained data`);
    assert.equal(
      requests.length - burstRequestStart,
      1,
      `${name}: revisit must not refetch retained data`
    );
    burst.owner.teardownModernTrackScrollPagination();
    assert.equal(timers.size, 0);

    const other = surface(3);
    const before = requests.length;
    for (let index = 0; index < 3; index++) {
      other.focus(index);
      other.owner._trackScrollHandlers.get(other.tracks[index]).requestAhead();
    }
    advance(now + 300);
    assert.equal(requests.length - before, 3, `${name}: retain existing row prefetch behavior`);
    other.owner.teardownModernTrackScrollPagination();

    // Duplicate-page catch-up is one tracked timer on every runtime. Teardown
    // and a newer Home generation must both stop its future request.
    for (const cancellation of ["teardown", "new-generation"]) {
      const retry = surface(1);
      const retryRequestStart = requests.length;
      retry.owner._trackScrollHandlers.get(retry.tracks[0]).requestAhead();
      advance(now + 300);
      assert.equal(requests.length - retryRequestStart, 1);
      requests[retryRequestStart].resolve({
        status: "success",
        data: { items: [{ id: "0-first" }], hasMore: true, nextSkip: 2 }
      });
      await flush();
      assert.equal(timers.size, 1, `${name}: duplicate-page retry must use one catch-up timer`);
      if (cancellation === "teardown") retry.owner.teardownModernTrackScrollPagination();
      else retry.owner.homeLoadToken++;
      advance(now + 300);
      assert.equal(
        requests.length - retryRequestStart,
        1,
        `${name}: ${cancellation} must cancel catch-up requests`
      );
      assert.equal(timers.size, 0);
      retry.owner.teardownModernTrackScrollPagination();
    }
  }
  console.log(
    `Home pagination recovery passed: 600 row changes per runtime, bounded timers, active-row loading, cached-page return, idle prefetch and retry lifecycle.`
  );
} finally {
  catalogRepository.getCatalog = original;
}
