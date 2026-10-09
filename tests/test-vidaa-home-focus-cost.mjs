import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.HTMLElement = class {};
const { Platform } = await import("../js/platform/index.js");
const { createHomeScreenMethods12 } =
  await import("../js/ui/screens/home/homeScreenMethods-12-sync-collection-hero-media.js");
const { createHomeScreenMethods13 } =
  await import("../js/ui/screens/home/homeScreenMethods-13-mount-trailer-layer.js");
const { createHomeScreenMethods15 } =
  await import("../js/ui/screens/home/homeScreenMethods-15-schedule-focused-poster-flow.js");
const { createHomeScreenMethods04 } =
  await import("../js/ui/screens/home/homeScreenMethods-04-get-hero-focus-delay.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { reconcileHomeFocusMediaTracking } =
  await import("../js/ui/screens/home/homeFocusMediaTracking.js");

let frames = [];
globalThis.requestAnimationFrame = (callback) => {
  frames.push(callback);
  return frames.length;
};
const classes = (...initial) => {
  const set = new Set(initial);
  return {
    contains: (value) => set.has(value),
    add: (...values) => values.forEach((value) => set.add(value)),
    remove: (...values) => values.forEach((value) => set.delete(value))
  };
};
function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  frames = [];
}

for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  let scans = 0,
    layoutReads = 0,
    transitionWrites = 0;
  const style = () => ({
    transition: "transform 120ms",
    setProperty() {
      transitionWrites++;
    }
  });
  const frame = Object.assign(new HTMLElement(), { style: style(), isConnected: true });
  const layer = { classList: classes(), firstElementChild: null };
  const card = Object.assign(new HTMLElement(), {
    style: style(),
    isConnected: true,
    classList: classes("is-expanded"),
    querySelector: (selector) => (selector === ".home-poster-frame" ? frame : layer)
  });
  Object.defineProperty(card, "offsetWidth", {
    get() {
      layoutReads++;
      return 600;
    }
  });
  const screen = {
    ...createHomeScreenMethods12(),
    ...createHomeScreenMethods13(),
    container: {
      querySelector: () => layer,
      querySelectorAll() {
        scans++;
        return [];
      }
    },
    expandedPosterNode: card,
    isPerformanceConstrained: () => true,
    shouldUseImmediateFocusScroll: () => true,
    setHeroTrailerActive() {}
  };
  screen.homeFocusMediaTrackingContainer = screen.container;
  screen.homeActiveTrailerLayers = new Set();
  screen.homeActivePosterNodes = new Set([card]);
  // No preview was mounted: repeated keys must not create work for empty layers.
  for (let n = 0; n < 100; n++) screen.refreshPendingHomeTrailerCleanup();
  assert.equal(scans, 0, `${name}: empty preview cleanup must not scan all cards per key`);

  // Use a stub for other platforms so this test does not create their timers.
  if (name !== "vidaa") screen.scheduleTrailerLayerCleanup = () => {};
  screen.collapseFocusedPoster(card);
  assert.equal(card.classList.contains("is-expanded"), false);
  assert.equal(screen.expandedPosterNode, null);
  assert.equal(screen.homeActivePosterNodes.size, 0, "Collapsed card references must be released");
  if (name === "vidaa") {
    assert.equal(layoutReads, 0, "VIDAA collapse must not force synchronous layout");
    assert.equal(
      transitionWrites,
      0,
      "VIDAA collapse relies on the existing CSS size-transition override"
    );
    assert.equal(
      frames.length,
      0,
      "Empty previews and transition overrides must not queue callbacks"
    );
    assert.equal(
      screen.homeTrailerLayerCleanupTimers,
      undefined,
      "Don't schedule cleanup for empty previews"
    );
  } else {
    assert.equal(layoutReads, 1, `${name}: preserve forced reflow for animated expansion`);
    assert.equal(transitionWrites, 2);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(card.style.transition, "transform 120ms");
  }
}

for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  const screen = {
    ...createHomeScreenMethods12(),
    shouldUseImmediateFocusScroll: () => true,
    container: {
      querySelectorAll() {
        throw Error("Unexpected global scan");
      }
    },
    homeActiveTrailerLayers: new Set([{}, {}]),
    scheduleTrailerLayerCleanup: () => {
      screen.count++;
    },
    count: 0
  };
  screen.homeFocusMediaTrackingContainer = screen.container;
  screen.homeActivePosterNodes = new Set();
  screen.refreshPendingHomeTrailerCleanup();
  assert.equal(screen.count, 2, "Actual mounted previews still receive cleanup");
  const emptyLayer = { classList: classes(), firstElementChild: null };
  screen.homeActiveTrailerLayers.add(emptyLayer);
  screen.clearTrailerLayer(emptyLayer);
  assert.equal(
    screen.homeActiveTrailerLayers.has(emptyLayer),
    false,
    "Cleared preview references must be released"
  );
  const empty = { classList: classes(), firstElementChild: null };
  screen.homeActiveTrailerLayers.add(empty);
  screen.scheduleTrailerLayerCleanup = createHomeScreenMethods12().scheduleTrailerLayerCleanup;
  screen.scheduleTrailerLayerCleanup(empty);
  assert.equal(
    screen.homeActiveTrailerLayers.has(empty),
    false,
    `${name}: empty layers must not schedule cleanup`
  );
  assert.equal(screen.homeTrailerLayerCleanupTimers, undefined);
}
for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  const empty = { classList: classes(), firstElementChild: null };
  const screen = {
    ...createHomeScreenMethods12(),
    ...createHomeScreenMethods13(),
    container: {
      querySelector: () => empty,
      querySelectorAll() {
        throw Error("Empty expansion must not scan all cards");
      }
    },
    isPerformanceConstrained: () => true,
    shouldUseImmediateFocusScroll: () => true,
    setHeroTrailerActive() {}
  };
  screen.homeFocusMediaTrackingContainer = screen.container;
  screen.homeActivePosterNodes = new Set();
  screen.homeActiveTrailerLayers = new Set();
  for (let n = 0; n < 100; n++) screen.collapseFocusedPoster();
  assert.equal(screen.homeTrailerLayerCleanupTimers, undefined);
}
// A restored Home can already contain expanded cards or live previews. Discover
// that state once, retain it through a DOM refresh, and never rescan on key input.
for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  let scans = 0;
  let pauses = 0;
  let videoLoads = 0;
  const video = { pause: () => pauses++, removeAttribute() {}, load: () => videoLoads++ };
  const liveLayer = {
    firstElementChild: video,
    classList: classes("is-active"),
    querySelector: (selector) => (selector === "video" ? video : null),
    innerHTML: "video"
  };
  const emptyLayer = { classList: classes(), firstElementChild: null };
  const card = Object.assign(new HTMLElement(), {
    isConnected: true,
    classList: classes("is-expanded"),
    querySelector: (selector) => (selector === ".home-poster-trailer-layer" ? emptyLayer : null)
  });
  const nextCard = Object.assign(new HTMLElement(), {
    isConnected: true,
    classList: classes(),
    querySelector: () => null
  });
  let restoredCards = [card];
  let restoredLayers = [liveLayer];
  let connected = new Set([card, nextCard, liveLayer]);
  const screen = {
    ...createHomeScreenMethods12(),
    ...createHomeScreenMethods13(),
    container: {
      querySelector: () => emptyLayer,
      querySelectorAll(selector) {
        scans++;
        return selector.startsWith(".home-main") ? restoredCards : restoredLayers;
      },
      contains: (node) => connected.has(node)
    },
    isPerformanceConstrained: () => false,
    shouldUseImmediateFocusScroll: () => false,
    isModernPosterNode: () => true,
    hydrateFocusedPosterAssets() {},
    ensureTrackHorizontalVisibility() {},
    setHeroTrailerActive() {}
  };
  reconcileHomeFocusMediaTracking(screen);
  assert.equal(scans, 2);
  assert.equal(screen.expandedPosterNode, card, `${name}: restore the generated expanded card`);
  assert.equal(screen.homeActiveTrailerLayers.has(liveLayer), true);
  screen.expandFocusedPoster(nextCard);
  assert.equal(card.classList.contains("is-expanded"), false);
  assert.equal(nextCard.classList.contains("is-expanded"), true);
  assert.equal(screen.homeActivePosterNodes.has(nextCard), true);
  assert.equal(scans, 2, "Replacing the expanded card must use tracked state");
  for (let n = 0; n < 100; n++) screen.collapseFocusedPoster();
  assert.equal(scans, 2, "Repeated empty collapses must not scan Home");

  // An incremental render can preserve a preview and introduce a generated
  // expanded card. Reconciliation must retain both and release removed media.
  nextCard.classList.add("is-expanded");
  restoredCards = [nextCard];
  reconcileHomeFocusMediaTracking(screen, { refresh: true });
  assert.equal(screen.expandedPosterNode, nextCard);
  assert.equal(screen.homeActiveTrailerLayers.has(liveLayer), true);
  connected = new Set([nextCard]);
  restoredLayers = [];
  reconcileHomeFocusMediaTracking(screen, { refresh: true });
  assert.equal(pauses, 1, "Removed preview playback must stop during a DOM refresh");
  assert.equal(videoLoads, 1, "Removed preview sources must be released");
  assert.equal(screen.homeActiveTrailerLayers.size, 0);
  screen.collapseFocusedPoster();
  assert.equal(screen.expandedPosterNode, null);
}

// Mounting and remounting previews must track every platform and cancel stale
// deferred cleanup before it can clear a newly mounted preview.
for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  const savedSetTimeout = globalThis.setTimeout;
  const savedClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  let listeners = 0;
  globalThis.setTimeout = (callback) => {
    timers.set(++timerId, callback);
    return timerId;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.window = {
    addEventListener: () => listeners++,
    removeEventListener: () => listeners--
  };
  globalThis.document = {
    createElement: () => ({
      addEventListener() {},
      removeAttribute() {},
      contentWindow: { postMessage() {} }
    })
  };
  try {
    let mounted = null;
    const layer = {
      classList: classes(),
      get firstElementChild() {
        return mounted;
      },
      appendChild: (child) => {
        mounted = child;
      },
      querySelector: (selector) => (selector === "iframe" ? mounted : null),
      set innerHTML(_value) {
        mounted = null;
      }
    };
    const screen = {
      ...createHomeScreenMethods12(),
      ...createHomeScreenMethods13(),
      homeActiveTrailerLayers: new Set(),
      homeActivePosterNodes: new Set(),
      container: {
        querySelectorAll() {
          throw Error("Tracked previews must not scan Home");
        }
      }
    };
    screen.homeFocusMediaTrackingContainer = screen.container;
    const source = { kind: "youtube", embedUrl: "https://example.test/trailer" };
    screen.mountTrailerLayer(layer, source);
    assert.equal(
      screen.homeActiveTrailerLayers.has(layer),
      true,
      `${name}: mounted previews must be tracked`
    );
    assert.equal(listeners, 1);
    screen.scheduleTrailerLayerCleanup(layer);
    assert.equal(timers.size, 1);
    screen.mountTrailerLayer(layer, source);
    assert.equal(timers.size, 0, "Remount must cancel previous preview cleanup");
    assert.equal(listeners, 1, "Remount must remove the previous message listener");
    screen.clearHomeTrailerLayers();
    assert.equal(screen.homeActiveTrailerLayers.size, 0);
    assert.equal(mounted, null);
    assert.equal(listeners, 0);
  } finally {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
    globalThis.setTimeout = savedSetTimeout;
    globalThis.clearTimeout = savedClearTimeout;
  }
}
platform("vidaa");
{
  const expanded = { classList: classes("is-expanded") };
  const screen = {
    ...createHomeScreenMethods15(),
    layoutMode: "modern",
    expandedPosterNode: expanded,
    container: {
      querySelector() {
        throw Error("Horizontal collapse must not read computed dimensions");
      }
    }
  };
  assert.deepEqual(screen.getExpandedPosterScrollAdjustments(expanded, {}, "right"), {
    horizontal: 0,
    vertical: 0
  });
}
// All VIDAA layouts defer background renders throughout held navigation, even
// between animations. They resume when input and scrolling have settled.
for (const layoutMode of ["modern", "classic", "grid"]) {
  const screen = {
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods04(),
    layoutMode,
    hasUserInteractedSinceHomePaint: true,
    isVidaaHomeLoadingBusy: () => true
  };
  assert.equal(screen.shouldDeferHomeRenderForInput(), true);
  screen.isVidaaHomeLoadingBusy = () => false;
  assert.equal(screen.shouldDeferHomeRenderForInput(), false);
}
console.log(
  "Home focus checks passed: bounded media tracking on every runtime, restored media reconciliation, preview cleanup cancellation, retained collapse transitions and VIDAA render deferral."
);
