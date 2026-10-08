import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.HTMLElement = class {};
globalThis.HTMLImageElement = class extends HTMLElement {};
const { createHomeScreenMethods24 } =
  await import("../js/ui/screens/home/homeScreenMethods-24-schedule-home-lazy-image-hydration.js");
const {
  cancelVidaaHomePosterPrefetches,
  observeVidaaPosterReady,
  cancelVidaaPosterObservation,
  prefetchVidaaPosterSource,
  reconcileVidaaHomePosterPrefetches
} = await import("../js/ui/screens/home/vidaaHomePosterPrefetch.js");
const { releaseVidaaHomeImage } = await import("../js/ui/screens/home/vidaaHomeImageWindow.js");

let now = 0,
  id = 0,
  decoded = 0;
Date.now = () => now;
const timers = new Map();
globalThis.setTimeout = (callback, delay) => {
  const key = ++id;
  timers.set(key, { callback, at: now + delay });
  return key;
};
globalThis.clearTimeout = (key) => timers.delete(key);
globalThis.cancelAnimationFrame = () => {};
const images = [];
globalThis.Image = class {
  constructor() {
    this.src = "";
    images.push(this);
  }
  decode() {
    decoded++;
    return new Promise(() => {});
  }
  removeAttribute() {
    this.src = "";
  }
};
// A short reversal must retain progress while capacity is available.
{
  const near = {};
  reconcileVidaaHomePosterPrefetches(near, ["near-a"]);
  prefetchVidaaPosterSource(near, "near-a");
  const first = near.homeVidaaPosterPrefetchInflight.get("near-a");
  now += 80;
  reconcileVidaaHomePosterPrefetches(near, ["near-b"]);
  prefetchVidaaPosterSource(near, "near-b");
  assert.equal(first.image.src, "near-a", "Reversal preserves the nearby HTTP request");
  first.image.onload();
  assert.ok(near.homeVidaaPosterWarmUrls.has("near-a"));
  cancelVidaaHomePosterPrefetches(near);
}
const rows = Array.from({ length: 40 }, (_, r) =>
  Array.from({ length: 50 }, (_, c) => ({
    dataset: { navRow: String(r), navCol: String(c), posterSrc: `poster-${r}-${c}` },
    querySelector: () => null
  }))
);
const owner = {
  ...createHomeScreenMethods24(),
  container: { isConnected: true },
  navModel: { rows },
  getCurrentFocusedNode: () => rows[0][0]
};
function move(r, c, direction) {
  now += 80;
  owner.scheduleHomeLazyImageHydration(rows[r][c], { navigationDirection: direction });
}

move(0, 10, "down");
assert.equal(owner.homeVidaaPosterPrefetchInflight.size, 18);
const obsolete = [...owner.homeVidaaPosterPrefetchInflight.values()];
const staleLoad = obsolete[0].image.onload;
move(30, 40, "up");
assert.equal(
  owner.homeVidaaPosterPrefetchInflight.size,
  18,
  "Latest row must acquire slots immediately"
);
for (const record of obsolete) {
  assert.equal(record.image.src, "", "Obsolete network images release their source");
  assert.equal(record.timeoutId, 0);
  assert.equal(record.image.onload, null);
}
staleLoad();
assert.equal(owner.homeVidaaPosterWarmUrls.size, 0, "Late events cannot revive retired requests");

// Thousands of reversals must never queue work proportional to visited cards.
for (let step = 0; step < 2000; step++) {
  move(5 + (step % 28), 8 + (step % 30), ["up", "right", "down", "left"][step % 4]);
  assert.ok(owner.homeVidaaPosterPrefetchInflight.size <= 18);
  assert.ok(timers.size <= 19, "At most 18 requests plus one settle timer");
  if (step % 5 === 0)
    [...owner.homeVidaaPosterPrefetchInflight.values()].forEach((record) =>
      record.image.onload?.()
    );
  assert.ok(owner.homeVidaaPosterWarmUrls.size <= 96);
}
assert.equal(
  decoded,
  0,
  "Invisible requests never force decode, even if decode would never settle"
);
assert.ok(
  images.filter((image) => image.src).length <= 18,
  "Completed and obsolete images release sources"
);

// Missing responses must release actual requests at timeout, not just Map slots.
const pending = [...owner.homeVidaaPosterPrefetchInflight.values()];
now += 5000;
for (const [key, timer] of [...timers]) {
  if (timer.at <= now && pending.some((record) => record.timeoutId === key)) {
    timers.delete(key);
    timer.callback();
  }
}
assert.equal(owner.homeVidaaPosterPrefetchInflight.size, 0);
pending.forEach((record) => assert.equal(record.image.src, ""));
move(10, 20, "down");
const beforeCleanup = [...owner.homeVidaaPosterPrefetchInflight.values()];
cancelVidaaHomePosterPrefetches(owner);
clearTimeout(owner.homeLazyImageHydrationSettleTimer);
assert.equal(timers.size, 0);
beforeCleanup.forEach((record) => assert.equal(record.image.src, ""));

// Failed/cancelled live images cannot accumulate one-shot load listeners.
const listeners = new Map();
const live = {
  dataset: {},
  classList: { contains: () => false },
  src: "visible-poster",
  addEventListener(type, callback) {
    const set = listeners.get(type) || new Set();
    set.add(callback);
    listeners.set(type, set);
  },
  removeEventListener(type, callback) {
    listeners.get(type)?.delete(callback);
  },
  getAttribute: () => live.src,
  removeAttribute() {
    live.src = "";
  }
};
for (let step = 0; step < 100; step++) {
  observeVidaaPosterReady(owner, live);
  assert.equal(listeners.get("load").size, 1);
  assert.equal(listeners.get("error").size, 1);
}
[...listeners.get("error")][0]();
assert.equal(listeners.get("load").size, 0);
observeVidaaPosterReady(owner, live);
releaseVidaaHomeImage(live);
assert.equal(live.dataset.src, "visible-poster");
assert.equal(listeners.get("load").size, 0);
cancelVidaaPosterObservation(live);
console.log(
  "VIDAA poster stress passed: 2000 reversals, bounded requests/cache/listeners, timeout and cleanup recovery, no forced decode."
);
