import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {};
const { Platform } = await import("../js/platform/index.js");
const { resetTvRuntimePerformanceProfile } = await import("../js/platform/tvRuntimePerformance.js");
const { createHomeScreenMethods01 } =
  await import("../js/ui/screens/home/homeScreenMethods-01-get-route-state-key.js");
const { createHomeScreenMethods02 } =
  await import("../js/ui/screens/home/homeScreenMethods-02-restore-modern-focus-state.js");
const { createHomeScreenMethods17 } =
  await import("../js/ui/screens/home/homeScreenMethods-17-end-modern-vertical-fast-scroll.js");
let id = 0;
const frames = new Map();
const timers = new Map();
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (key) => frames.delete(key);
globalThis.setTimeout = (callback) => {
  timers.set(++id, callback);
  return id;
};
globalThis.clearTimeout = (key) => timers.delete(key);

for (const platform of ["vidaa", "tizen", "webos", "browser"]) {
  for (const layoutMode of ["modern", "classic", "grid"]) {
    globalThis.__NUVIO_PLATFORM__ = platform;
    Platform.current = null;
    resetTvRuntimePerformanceProfile();
    frames.clear();
    timers.clear();
    const viewport = {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 400,
      getBoundingClientRect: () => ({ top: 0, bottom: 400 })
    };
    const track = {
      dataset: { trackRowKey: "row" },
      scrollLeft: 0,
      scrollWidth: 4000,
      clientWidth: 800,
      getBoundingClientRect: () => ({ left: 0, right: 800 })
    };
    const target = {
      isConnected: true,
      closest: () => track,
      getBoundingClientRect: () => ({
        top: 1200 - viewport.scrollTop,
        bottom: 1440 - viewport.scrollTop,
        height: 240,
        left: 1200 - track.scrollLeft,
        right: 1380 - track.scrollLeft,
        width: 180
      })
    };
    const state = {
      layoutMode,
      rowKey: "row",
      itemIndex: 0,
      mainScrollTop: 100,
      trackStates: { row: 200 }
    };
    const screen = {
      ...createHomeScreenMethods01(),
      ...createHomeScreenMethods02(),
      ...createHomeScreenMethods17(),
      layoutMode,
      isRestoringFocusFromBack: true,
      container: { querySelector: () => viewport },
      getHomeViewport: () => viewport,
      getNavigationTrackNodes: () => [track],
      getNavigationRowNodes: () => [target],
      getRowFocusInset: () => 24,
      getTrackEdgePadding: () => 32,
      setFocusedNode(node, options) {
        this.focused = node;
        this.focusOptions = options;
      },
      syncFocusedCollectionCardState() {},
      rememberMainRowFocus() {},
      scheduleModernHeroUpdate() {},
      scheduleFocusedPosterFlow() {},
      homeViewportFocusSyncTimer: setTimeout(() => assert.fail("Old viewport timer ran")),
      homeViewportScrollFrame: requestAnimationFrame(() => assert.fail("Old viewport frame ran")),
      _trackHorizRaf: requestAnimationFrame(() => assert.fail("Old scroll starter ran")),
      _mainVertRaf: requestAnimationFrame(() => assert.fail("Old vertical starter ran"))
    };
    assert.equal(screen.restoreFocusState(state), true);
    assert.equal(screen.focused, target);
    if (platform === "vidaa") {
      assert.equal(frames.size, 0, `${layoutMode}: return cancels stale scroll frames`);
      assert.equal(timers.size, 0, `${layoutMode}: return cancels stale viewport sync`);
      const rect = target.getBoundingClientRect();
      assert.ok(
        rect.top >= 24 && rect.bottom <= 376,
        `${layoutMode}: focused row visible immediately`
      );
      assert.ok(
        rect.left >= 32 && rect.right <= 776,
        `${layoutMode}: focused poster visible immediately`
      );
      assert.equal(screen.focusOptions.suppressDelegatedFocus, true);
      const top = viewport.scrollTop;
      const left = track.scrollLeft;
      assert.equal(
        screen.applyReturnFocusStateNow(state),
        true,
        "Late restoration uses the same settled viewport"
      );
      assert.equal(
        viewport.scrollTop,
        top,
        "Late restoration must not reveal the captured intermediate position"
      );
      assert.equal(track.scrollLeft, left);
      // A settled return must retain the saved scroll exactly, without realignment.
      const settled = { ...state, mainScrollTop: top, trackStates: { row: left } };
      screen.restoreFocusState(settled);
      assert.equal(viewport.scrollTop, top);
      assert.equal(track.scrollLeft, left);
    } else {
      assert.equal(viewport.scrollTop, 100, `${platform}: original saved vertical position`);
      assert.equal(track.scrollLeft, 200, `${platform}: original saved horizontal position`);
      assert.equal(screen.focusOptions.suppressDelegatedFocus, false);
      assert.equal(frames.size, 3, `${platform}: unchanged scroll lifecycle`);
      assert.equal(timers.size, 1);
    }
  }
}
console.log(
  "VIDAA return focus passed: interrupted scroll, immediate visibility, cancelled stale work, late restore and all layouts/platforms."
);
