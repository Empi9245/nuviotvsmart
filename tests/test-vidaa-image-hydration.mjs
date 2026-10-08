import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { noteVidaaNavigationKeyDown, noteVidaaNavigationKeyUp, resetVidaaNavigationActivity } =
  await import("../js/ui/navigation/vidaaNavigationActivity.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { createHomeScreenMethods05 } =
  await import("../js/ui/screens/home/homeScreenMethods-05-apply-hero-to-dom.js");
const { createHomeScreenMethods24 } =
  await import("../js/ui/screens/home/homeScreenMethods-24-schedule-home-lazy-image-hydration.js");
const { createHomeScreenMethods29 } =
  await import("../js/ui/screens/home/homeScreenMethods-29-setup-modern-track-scroll-pagination.js");
const { Router, buildModernRowKey } = await import("../js/ui/screens/home/homeScreenContext.js");
const { catalogRepository } = await import("../js/data/repository/catalogRepository.js");

let now = 0;
let nextId = 0;
let geometryReads = 0;
let globalScans = 0;
const frames = new Map();
const timers = new Map();
Date.now = () => now;
globalThis.HTMLElement = class {};
globalThis.HTMLImageElement = class extends HTMLElement {};
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.setTimeout = (callback, delay) => {
  const id = ++nextId;
  timers.set(id, { callback, time: now + delay, delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
Router.getCurrent = () => "home";

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  resetVidaaNavigationActivity();
  now = 0;
  geometryReads = 0;
  globalScans = 0;
  frames.clear();
  timers.clear();
}

function advance(time) {
  now = time;
  const due = [...timers].filter(([, timer]) => timer.time <= now);
  for (const [id, timer] of due) {
    if (!timers.has(id)) continue;
    timers.delete(id);
    timer.callback();
  }
}

function frame() {
  const callbacks = [...frames];
  for (const [id, callback] of callbacks) {
    if (!frames.has(id)) continue;
    frames.delete(id);
    callback(now);
  }
}

function homeSurface() {
  const rows = [120, 620, 3000].map((top) =>
    Object.assign(new HTMLElement(), {
      isConnected: true,
      getBoundingClientRect() {
        geometryReads += 1;
        return { top, bottom: top + 250, left: 0, right: 1000 };
      }
    })
  );
  const images = [];
  const cards = [];
  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < 10; index += 1) {
      const image = Object.assign(new HTMLImageElement(), {
        isConnected: true,
        dataset: { src: `poster-${rowIndex}-${index}` },
        classList: { contains: () => false },
        getAttribute(name) {
          return name === "src" ? this.src || null : null;
        },
        removeAttribute(name) {
          if (name === "data-src") delete this.dataset.src;
        },
        closest: (selector) => (selector === ".focusable" ? card : row),
        getBoundingClientRect() {
          geometryReads += 1;
          return {
            top: [120, 620, 3000][rowIndex],
            bottom: [370, 870, 3250][rowIndex],
            left: index * 220,
            right: index * 220 + 200
          };
        }
      });
      const card = Object.assign(new HTMLElement(), {
        offsetWidth: 200,
        image,
        contains: (candidate) => candidate === image,
        closest: () => row,
        querySelector: () => (image.dataset.src ? image : null)
      });
      images.push(image);
      cards.push(card);
    }
  });
  const viewport = {
    getBoundingClientRect() {
      geometryReads += 1;
      return { top: 0, bottom: 1080, left: 0, right: 1000 };
    }
  };
  const container = {
    isConnected: true,
    contains: () => true,
    querySelector: () => viewport,
    querySelectorAll(selector) {
      globalScans += 1;
      if (selector.includes(".home-content-card")) return [];
      if (!selector.includes("[data-src]")) return images.filter((image) => image.src);
      return images.filter((image) => image.dataset.src);
    }
  };
  let focused = cards[0];
  const owner = {
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods24(),
    container,
    layoutMode: "modern",
    getCurrentFocusedNode: () => focused,
    shouldUseImmediateFocusScroll: () => true,
    isPerformanceConstrained: () => true,
    isLegacyTvRuntime: () => false
  };
  return {
    owner,
    images,
    cards,
    setFocused(card) {
      focused = card;
    }
  };
}

platform("vidaa");
{
  const { owner, images, cards } = homeSurface();
  owner.navModel = {
    rows: [cards.slice(0, 10), cards.slice(10, 20), cards.slice(20, 30)]
  };
  owner.navModel.rows.forEach((rowNodes, rowIndex) =>
    rowNodes.forEach((card, colIndex) => {
      card.dataset = { navRow: String(rowIndex), navCol: String(colIndex) };
    })
  );

  const previousImage = globalThis.Image;
  const prefetched = [];
  globalThis.Image = class {
    set src(value) {
      this._src = value;
      prefetched.push(value);
    }
    get src() {
      return this._src;
    }
  };
  cards[9].dataset.posterSrc = "parked-poster-0-9";
  cards[9].querySelector = () => null;

  owner.scheduleHomeLazyImageHydration(cards[0], { navigationDirection: "right" });
  assert.equal(images[0].src, "poster-0-0", "Focused poster must start immediately");
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(
      images[index].src,
      `poster-0-${index}`,
      `Maximum-speed horizontal runway should warm poster ${index}`
    );
    assert.equal(images[index].fetchPriority, "low");
  }
  assert.ok(
    prefetched.includes("parked-poster-0-9"),
    "Parked cards must still start network prefetch without remounting their DOM"
  );
  assert.equal(images[0].fetchPriority, "high");
  globalThis.Image = previousImage;
}

platform("vidaa");
{
  const { owner, images, cards } = homeSurface();
  owner.navModel = {
    rows: [cards.slice(0, 10), cards.slice(10, 20), cards.slice(20, 30)]
  };
  owner.navModel.rows.forEach((rowNodes, rowIndex) =>
    rowNodes.forEach((card, colIndex) => {
      card.dataset = { navRow: String(rowIndex), navCol: String(colIndex) };
    })
  );

  // Slow navigation should not keep the maximum-speed runway. Prime the
  // observed cadence at 300 ms and verify that it contracts automatically.
  owner.homeVidaaPrefetchMotion = { direction: "right", lastAt: 1, intervalMs: 80 };
  now = 301;
  owner.scheduleHomeLazyImageHydration(cards[0], { navigationDirection: "right" });
  for (let index = 1; index <= 6; index += 1) {
    assert.equal(images[index].src, `poster-0-${index}`);
  }
  assert.equal(images[7].src, undefined, "Slow horizontal navigation should shrink the runway");
}

platform("vidaa");
{
  const { owner, images, cards } = homeSurface();
  owner.navModel = {
    rows: [cards.slice(0, 10), cards.slice(10, 20), cards.slice(20, 30)]
  };
  owner.navModel.rows.forEach((rowNodes, rowIndex) =>
    rowNodes.forEach((card, colIndex) => {
      card.dataset = { navRow: String(rowIndex), navCol: String(colIndex) };
    })
  );

  owner.scheduleHomeLazyImageHydration(cards[4], { navigationDirection: "down" });
  assert.equal(images[4].src, "poster-0-4");
  for (const index of [1, 2, 3, 5, 6, 7]) {
    assert.equal(
      images[index].src,
      `poster-0-${index}`,
      "Entered row should hydrate its visible neighborhood"
    );
    assert.equal(images[index].fetchPriority, "auto");
  }
  for (const index of [14, 13, 15, 24, 23, 25]) {
    assert.equal(images[index].src, `poster-${Math.floor(index / 10)}-${index % 10}`);
    assert.equal(images[index].fetchPriority, "low");
  }
  assert.equal(images[12].src, undefined, "Future rows stay within the adaptive request budget");
  assert.equal(images[22].src, undefined, "Farther future rows remain progressively narrower");

  const upSurface = homeSurface();
  upSurface.owner.navModel = {
    rows: [
      upSurface.cards.slice(0, 10),
      upSurface.cards.slice(10, 20),
      upSurface.cards.slice(20, 30)
    ]
  };
  upSurface.owner.navModel.rows.forEach((rowNodes, rowIndex) =>
    rowNodes.forEach((card, colIndex) => {
      card.dataset = { navRow: String(rowIndex), navCol: String(colIndex) };
    })
  );
  upSurface.owner.scheduleHomeLazyImageHydration(upSurface.cards[24], {
    navigationDirection: "up"
  });
  for (const index of [21, 22, 23, 25, 26, 27]) {
    assert.equal(upSurface.images[index].src, `poster-2-${index % 10}`);
    assert.equal(upSurface.images[index].fetchPriority, "auto");
  }
  for (const index of [14, 13, 15, 4, 3, 5]) {
    assert.equal(
      upSurface.images[index].src,
      `poster-${Math.floor(index / 10)}-${index % 10}`,
      "Upward navigation should use the same adaptive runway"
    );
  }
}

platform("vidaa");
{
  const { owner, images, cards, setFocused } = homeSurface();
  noteVidaaNavigationKeyDown(39);
  owner.scheduleHomeLazyImageHydration(cards[0], { refreshIndex: true });
  assert.equal(
    images[0].src,
    "poster-0-0",
    "The selected poster stays available during navigation"
  );
  assert.equal(globalScans, 0);
  assert.equal(geometryReads, 0, "Repeated arrows must not scan or measure background artwork");
  assert.equal(frames.size, 0);

  setFocused(cards[1]);
  now = 100;
  noteVidaaNavigationKeyDown(39);
  owner.scheduleHomeLazyImageHydration(cards[1]);
  assert.equal(images[1].src, "poster-0-1");
  advance(350);
  assert.equal(globalScans, 0, "Held remote repeats keep secondary loading paused");
  noteVidaaNavigationKeyUp(39);
  advance(599);
  assert.equal(globalScans, 0, "Wait for the quiet window after release");
  advance(649);
  assert.equal(globalScans, 3, "Idle passes bound images/cards, then build the deferred index");
  assert.equal(frames.size, 1);
  const loadedBeforeFrame = images.filter((image) => image.src).length;
  frame();
  assert.equal(
    images.filter((image) => image.src).length - loadedBeforeFrame,
    4,
    "Commit at most four secondary sources per frame"
  );
  const readsAfterScan = geometryReads;

  noteVidaaNavigationKeyDown(40);
  setFocused(cards[10]);
  owner.scheduleHomeLazyImageHydration(cards[10]);
  assert.equal(frames.size, 0, "New navigation cancels the queued background image burst");
  assert.equal(geometryReads, readsAfterScan);
  assert.equal(owner.homeLazyImageCommitQueue.length, 0);
  noteVidaaNavigationKeyUp(40);
  advance(899);
  while (frames.size) frame();
  assert.equal(images[10].src, "poster-1-0");
  assert.equal(images[20].src, undefined, "Distant rows remain deferred after settling");
}

for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  const { owner, images, cards } = homeSurface();
  owner.scheduleHomeLazyImageHydration(cards[0]);
  assert.equal(timers.size, 0, `${name}: preserve original animation-frame scheduling`);
  assert.equal(frames.size, 1);
  frame();
  assert.ok(
    images.filter((image) => image.src).length > 4,
    `${name}: preserve original source assignment behavior`
  );
  assert.equal(frames.size, 0);
}

// Prefetch must follow the same remembered/default column as real Up/Down.
platform("vidaa");
{
  const { owner, images, cards } = homeSurface();
  owner.navModel = { rows: [cards.slice(0, 10), cards.slice(10, 20), cards.slice(20, 30)] };
  owner.navModel.rows.forEach((nodes, r) =>
    nodes.forEach((card, c) => {
      card.dataset = { navRow: String(r), navCol: String(c), navRowKey: "row-" + r };
    })
  );
  owner.resolvePreferredNodeForRow = createHomeScreenMethods05().resolvePreferredNodeForRow;
  owner.getNodeRowKey = (node) => node.dataset.navRowKey;
  owner.lastFocusedItemIndexByRowKey = { "row-1": 8 };
  owner.scheduleHomeLazyImageHydration(cards[4], { navigationDirection: "down" });
  assert.equal(images[18].src, "poster-1-8", "Warm the remembered column in the next row");
  assert.equal(images[20].src, "poster-2-0", "Unvisited rows use the navigation default column");
  assert.equal(
    images[14].src,
    undefined,
    "Don't spend bandwidth on the current row's column in another row"
  );
}

// Track pagination must not scan cards or append catalog fragments while the
// held remote is still moving, including an in-flight response finishing then.
platform("vidaa");
{
  const row = {
    type: "movie",
    catalogId: "test",
    addonId: "test",
    result: { status: "success", data: { items: [{ id: "one" }], hasMore: true } }
  };
  const rowKey = buildModernRowKey(row);
  let cardScans = 0;
  let appends = 0;
  let resolveCatalog;
  const track = {
    isConnected: true,
    dataset: { trackRowKey: rowKey },
    clientWidth: 1000,
    scrollWidth: 1000,
    scrollLeft: 0,
    querySelectorAll() {
      cardScans += 1;
      return [{ offsetWidth: 200 }];
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {
      appends += 1;
    }
  };
  globalThis.document = {
    createRange: () => ({ createContextualFragment: () => ({ querySelectorAll: () => [] }) })
  };
  const owner = {
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods29(),
    layoutMode: "modern",
    container: { querySelectorAll: () => [track] },
    rows: [row],
    homeLoadToken: 1,
    getRowItemLimit: () => 5,
    scheduleHomeLazyImageHydration() {},
    invalidateNavigationModel() {},
    buildNavigationModel() {}
  };
  const originalGetCatalog = catalogRepository.getCatalog;
  catalogRepository.getCatalog = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve;
    });
  try {
    owner.setupModernTrackScrollPagination();
    const handler = owner._trackScrollHandlers.get(track);
    noteVidaaNavigationKeyDown(39);
    handler.requestAhead();
    advance(250);
    assert.equal(cardScans, 0, "Pagination card scans wait during held navigation");
    noteVidaaNavigationKeyUp(39);
    advance(550);
    assert.equal(cardScans, 1);
    assert.equal(typeof resolveCatalog, "function");
    noteVidaaNavigationKeyDown(39);
    resolveCatalog({
      status: "success",
      data: { items: [{ id: "two", name: "Two", poster: "poster" }], hasMore: false }
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(
      appends,
      0,
      "An in-flight page does not mutate the track during renewed navigation"
    );
    noteVidaaNavigationKeyUp(39);
    advance(800);
    assert.equal(appends, 1, "Append the completed page once focus has settled");
    owner.teardownModernTrackScrollPagination();
    assert.equal(timers.size, 0);
  } finally {
    catalogRepository.getCatalog = originalGetCatalog;
  }
}

console.log(
  "VIDAA image checks passed: priority posters, idle hydration, bounded commits, pagination handoff, and unchanged Tizen/webOS paths."
);
