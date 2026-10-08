import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { history: {} };
const { Platform } = await import("../js/platform/index.js");
const { resetTvRuntimePerformanceProfile } = await import("../js/platform/tvRuntimePerformance.js");
const { createRouterMethods01 } =
  await import("../js/ui/navigation/routerMethods-01-get-route-state-key.js");
const { createRouterMethods02 } =
  await import("../js/ui/navigation/routerMethods-02-complete-route-return-back-guard.js");
const { createRouterMethods03 } = await import("../js/ui/navigation/routerMethods-03-back.js");
const { createHomeScreenMethods20 } =
  await import("../js/ui/screens/home/homeScreenMethods-20-mount.js");
const { createHomeScreenMethods30 } =
  await import("../js/ui/screens/home/homeScreenMethods-30-cleanup.js");
const { ProfileManager, watchProgressRepository, getHomeCatalogRowKeys } =
  await import("../js/ui/screens/home/homeScreenContext.js");
const { isVidaaNavigationBusy, noteVidaaNavigationKeyDown, resetVidaaNavigationActivity } =
  await import("../js/ui/navigation/vidaaNavigationActivity.js");

let nextId = 0;
const timers = new Map();
const frames = new Map();
globalThis.setTimeout = (callback) => {
  const id = ++nextId;
  timers.set(id, callback);
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  resetTvRuntimePerformanceProfile();
  resetVidaaNavigationActivity();
}

function surface() {
  const counts = { appends: 0, clears: 0, renders: 0, refreshes: 0, focus: 0 };
  const classes = new Set();
  const rows = [
    { homeCatalogKey: "demo:movie:popular", result: { data: { items: [{ id: "tt1" }] } } }
  ];
  const style = {
    display: "block",
    removeProperty(name) {
      delete this[name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())];
    }
  };
  const container = {
    style,
    isConnected: true,
    childNodes: [{}],
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    querySelector: () => null,
    querySelectorAll: () => getHomeCatalogRowKeys(rows).map((rowKey) => ({ dataset: { rowKey } })),
    replaceChildren() {
      counts.clears++;
      this.childNodes = [];
    }
  };
  globalThis.document = { getElementById: () => container };
  const parked = {
    style,
    classList: container.classList,
    appendChild() {
      counts.appends++;
    }
  };
  const focusState = {
    layoutMode: "modern",
    rowKey: "demo",
    itemIndex: 4,
    mainScrollTop: 700,
    trackStates: { demo: 900 }
  };
  const owner = {
    ...createHomeScreenMethods20(),
    ...createHomeScreenMethods30(),
    container,
    rows,
    hasLoadedOnce: true,
    homeLoadToken: 1,
    loadedProfileId: String(ProfileManager.getActiveProfileId() || ""),
    loadedWatchProgressSourceKey: watchProgressRepository.getContinueWatchingSourceKey(),
    layoutMode: "modern",
    renderedLayoutMode: "modern",
    homeVidaaParkedCards: new Map([[parked, { content: {}, styles: [] }]]),
    homeVidaaActiveCards: new Set([{}]),
    homeVidaaCardWindowBaseSize: 1,
    homeVidaaCardWindowTimer: setTimeout(() => assert.fail("Hidden Home maintenance ran")),
    homeVidaaCardWindowRaf: requestAnimationFrame(() => assert.fail("Hidden Home geometry ran")),
    pendingBackFocusState: focusState,
    clearStoredReturnFocusState() {
      this.pendingBackFocusState = null;
    },
    readStoredReturnFocusState: () => focusState,
    sortAndFilterRows: (value) => value,
    render() {
      counts.renders++;
    },
    restoreFocusState(value) {
      assert.equal(value, focusState);
      counts.focus++;
      return true;
    },
    refreshHomeAfterRouteReturn() {
      counts.refreshes++;
      return new Promise(() => {});
    },
    buildSyncSensitiveHomeSignature: () => "signature",
    loadData: () => new Promise(() => {}),
    getInitialFocusSelector: () => ".focusable"
  };
  for (const name of [
    "ensureDelegatedEventsBound",
    "ensureAddonManifestSubscriptions",
    "cancelModernSidebarPillAutoCollapse",
    "destroyHomeHoldDialog",
    "unlockHomeHoldFocus",
    "cancelPendingContinueWatchingEnter",
    "cancelPendingContinueWatchingHold",
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
    "teardownContinueWatchingProgressiveRendering",
    "scheduleModernSidebarPillAutoCollapse",
    "bindHomeViewportEvents",
    "setupContinueWatchingProgressiveRendering",
    "setupModernTrackScrollPagination",
    "syncFocusedCollectionCardState",
    "startHeroRotation",
    "ensureHomeTruncationObservers",
    "scheduleHomeTruncationUpdate",
    "scheduleHomeLazyImageHydration",
    "scheduleReturnFocusRestore",
    "ensureStartupSyncSubscription",
    "scheduleInitialHomeLoadTimeout"
  ])
    owner[name] = () => {};
  return { owner, counts, container, parked, focusState };
}

// Call the actual cleanup/mount lifecycle: Back must reuse the bounded Home,
// not restore hundreds of detached trees and parse the catalog again.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  platform(name);
  const state = surface();
  state.owner.cleanup();
  const tv = name !== "browser";
  assert.equal(state.owner.homeDomPreserved, tv, `${name}: retained TV Home policy`);
  assert.equal(state.counts.clears, tv ? 0 : 1);
  assert.equal(state.counts.appends, 0, `${name}: no detached subtree restoration on exit`);
  assert.equal(state.container.style.display, "none");
  if (name === "vidaa") {
    assert.equal(state.owner.homeVidaaParkedCards.size, 1);
    assert.equal(state.owner.homeVidaaActiveCards.size, 1);
    assert.equal(state.owner.homeVidaaCardWindowTimer, 0);
    assert.equal(state.owner.homeVidaaCardWindowRaf, 0);
  }
  const oldRows = state.owner.rows;
  const oldChildren = state.container.childNodes;
  await state.owner.mount(
    {},
    { isBackNavigation: true, previousRoute: "detail", restoredState: state.focusState }
  );
  assert.equal(state.counts.renders, tv ? 0 : 1, `${name}: no catalog repaint on preserved Back`);
  assert.equal(state.counts.focus, tv ? 1 : 0);
  assert.equal(state.counts.refreshes, 1, "Background refresh must not block mounting");
  if (tv) {
    assert.equal(state.container.childNodes, oldChildren);
    assert.equal(state.owner.rows, oldRows);
    assert.equal(state.container.style.visibility, undefined);
    assert.equal(state.container.style.pointerEvents, undefined);
  }
}

platform("vidaa");
const cold = surface();
cold.owner.hasLoadedOnce = false;
cold.owner.cleanup();
assert.equal(cold.counts.appends, 0, "Cold teardown drops fragments without mounting them");
assert.equal(cold.counts.clears, 1);
assert.equal(cold.owner.homeVidaaParkedCards.size, 0);
assert.equal(cold.owner.homeVidaaActiveCards, null);

// Preserved data must still repaint when its catalog sequence/layout changes.
for (const changed of ["order", "layout", "profile"]) {
  const state = surface();
  state.owner.cleanup();
  if (changed === "order") state.owner.sortAndFilterRows = () => [];
  if (changed === "layout") state.owner.renderedLayoutMode = "classic";
  if (changed === "profile") state.owner.loadedProfileId = "different-profile";
  await state.owner.mount(
    {},
    { isBackNavigation: true, previousRoute: "settings", restoredState: state.focusState }
  );
  assert.equal(state.counts.renders, 1, `${changed}: invalidate retained rendering`);
}

const mounts = [];
const router = {
  ...createRouterMethods01(),
  ...createRouterMethods02(),
  ...createRouterMethods03(),
  routes: Object.fromEntries(
    ["home", "detail", "settings"].map((name) => [
      name,
      {
        mount: async () => mounts.push({ name, busy: isVidaaNavigationBusy() }),
        cleanup() {}
      }
    ])
  ),
  current: "home",
  currentParams: {},
  stack: [],
  routeReturnBackGuardNavigationId: 0
};
noteVidaaNavigationKeyDown(39);
assert.equal(isVidaaNavigationBusy(), true);
await router.navigate("detail");
assert.deepEqual(
  mounts.at(-1),
  { name: "detail", busy: false },
  "OK cancels the previous route's held-arrow wait before mount"
);
noteVidaaNavigationKeyDown(40);
await router.back({ skipHistory: true });
assert.deepEqual(
  mounts.at(-1),
  { name: "home", busy: false },
  "Stack Back cancels a missed keyup without waiting 1000 ms"
);
router.current = "settings";
router.stack = [];
noteVidaaNavigationKeyDown(38);
await router.back({ skipHistory: true });
assert.equal(mounts.at(-1).busy, false, "Fallback Home Back also clears navigation activity");
router.current = "detail";
router.historyInitialized = true;
window.history.back = () =>
  assert.equal(
    isVidaaNavigationBusy(),
    false,
    "History Back clears activity before the asynchronous return"
  );
noteVidaaNavigationKeyDown(37);
await router.back();
resetVidaaNavigationActivity();
console.log(
  "VIDAA route transitions passed: preserved Home, bounded teardown, immediate held-key reset, focus restore and TV/browser isolation."
);
