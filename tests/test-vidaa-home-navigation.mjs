import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { createHomeScreenMethods02 } =
  await import("../js/ui/screens/home/homeScreenMethods-02-restore-modern-focus-state.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { createHomeScreenMethods15 } =
  await import("../js/ui/screens/home/homeScreenMethods-15-schedule-focused-poster-flow.js");
const { createHomeScreenMethods16 } =
  await import("../js/ui/screens/home/homeScreenMethods-16-get-modern-main-aligned-scroll-target.js");
const { createHomeScreenMethods17 } =
  await import("../js/ui/screens/home/homeScreenMethods-17-end-modern-vertical-fast-scroll.js");
const { createHomeScreenMethods19 } =
  await import("../js/ui/screens/home/homeScreenMethods-19-handle-home-dpad.js");

let now = 0;
Date.now = () => now;
let frameId = 0;
const frames = new Map();
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
globalThis.requestAnimationFrame = (callback) => {
  const id = ++frameId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.matchMedia = () => ({ matches: false });

function frame(time) {
  now = time;
  const callbacks = [...frames];
  for (const [id, callback] of callbacks) {
    if (frames.delete(id)) callback(time);
  }
}

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}

function scroller() {
  return {
    isConnected: true,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 2400,
    clientWidth: 800,
    scrollHeight: 3000,
    clientHeight: 700
  };
}

const methods02 = createHomeScreenMethods02();
const methods03 = createHomeScreenMethods03();
const methods15 = createHomeScreenMethods15();
const methods16 = createHomeScreenMethods16();
const methods17 = createHomeScreenMethods17();
const methods19 = createHomeScreenMethods19();

// Ordinary Home scrolls, including the spring entry point, use a short tween.
{
  const track = scroller();
  const home = { ...methods02 };
  home.animateSpringScroll(track, "x", 300);
  assert.equal(track.scrollLeft, 0, "Changing focus must not jump to the target");
  frame(70);
  assert.ok(track.scrollLeft > 0 && track.scrollLeft < 300);
  frame(140);
  assert.equal(track.scrollLeft, 300);
  assert.equal(home.scrollAnimations.get(track).x, null);
  home.animateScroll(track, "x", 0, 0);
  assert.equal(track.scrollLeft, 0, "Explicit instant restores retain their behavior");
}

// Several arrows before a frame must measure and follow only the latest card.
// A reversal back to the current position must stop the old movement too.
{
  now = 200;
  const track = scroller();
  const first = { isConnected: true, value: 300 };
  const second = { isConnected: true, value: 600 };
  let measurements = 0;
  const home = {
    ...methods02,
    ...methods17,
    layoutMode: "modern",
    shouldUseImmediateFocusScroll: () => true,
    shouldUseImmediateHorizontalScrollForNode: () => true,
    getModernTrackAlignedScrollTarget(target) {
      measurements++;
      return { container: track, value: target.value };
    }
  };
  home.ensureTrackHorizontalVisibility(first, "right");
  home.ensureTrackHorizontalVisibility(second, "right");
  assert.equal(measurements, 0);
  assert.equal(frames.size, 1);
  frame(200);
  assert.equal(measurements, 1);
  assert.equal(track.scrollLeft, 0);
  assert.equal(home.modernCameraFollowLastHorizontalContainer, track);
  home.ensureTrackHorizontalVisibility({ isConnected: true, value: 0 }, "left");
  frame(200);
  frame(400);
  assert.equal(track.scrollLeft, 0, "A stale target must not scroll after reversing");
  assert.equal(frames.size, 0);
}

// Held RIGHT keeps following each card with motion between focus changes.
{
  now = 500;
  const track = scroller();
  const home = {
    ...methods02,
    ...methods03,
    ...methods17,
    layoutMode: "modern",
    getModernTrackAlignedScrollTarget: (target) => ({ container: track, value: target.value })
  };
  home.ensureTrackHorizontalVisibility({ isConnected: true, value: 228 }, "right");
  frame(500);
  frame(540);
  const firstPosition = track.scrollLeft;
  assert.ok(firstPosition > 0 && firstPosition < 228);
  home.ensureTrackHorizontalVisibility({ isConnected: true, value: 456 }, "right");
  assert.equal(track.scrollLeft, firstPosition, "Retargeting must not snap the scroll position");
  frame(580);
  assert.ok(
    home.shouldSuspendModernViewportFocusSync(),
    "Card navigation must not resync focus during camera motion"
  );
  frame(620);
  assert.ok(track.scrollLeft > firstPosition && track.scrollLeft < 456);
  frame(720);
  assert.equal(track.scrollLeft, 456);
}

// A horizontal key following a vertical key must keep its pending row scroll.
{
  now = 800;
  const viewport = scroller();
  const previousRow = {};
  const nextRow = {};
  const previous = { isConnected: true, row: previousRow };
  const target = { isConnected: true, row: nextRow };
  let verticalMeasurements = 0;
  const home = {
    ...methods02,
    ...methods17,
    layoutMode: "modern",
    getMainFocusAnchor: (node) => node.row,
    getModernMainAlignedScrollTarget() {
      verticalMeasurements++;
      return { container: viewport, value: 500 };
    }
  };
  home.ensureMainVerticalVisibility(target, "down", previous);
  const pending = home._mainVertRaf;
  home.ensureMainVerticalVisibility({ isConnected: true, row: nextRow }, "right", target);
  assert.equal(home._mainVertRaf, pending);
  frame(800);
  assert.equal(verticalMeasurements, 1);
  assert.equal(viewport.scrollTop, 0);
  frame(940);
  assert.equal(viewport.scrollTop, 500);
  home.ensureMainVerticalVisibility(target, "down", previous);
  home.cancelModernCameraFollow({ stopAnimations: true });
  assert.equal(home._mainVertRaf, null);
  assert.equal(frames.size, 0, "Leaving Home or opening the sidebar cancels queued scroll work");
}

// Same-row horizontal alignment needs no rectangle reads on any runtime.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  platform(name);
  const row = {};
  const viewport = {
    getBoundingClientRect() {
      assert.fail("Horizontal focus must not read vertical geometry");
    }
  };
  const home = {
    ...methods16,
    container: { querySelector: () => viewport, contains: () => true },
    getMainFocusAnchor: () => row
  };
  assert.equal(home.getModernMainAlignedScrollTarget({}, "right", {}), null);
}
platform("vidaa");

// DOWN then RIGHT before the first frame must stay on the newly focused row.
// The scroll starter, as well as the running animation, owns viewport follow.
{
  now = 1000;
  const viewport = scroller();
  const track = scroller();
  const previousRow = {};
  const nextRow = {};
  const card = (row, rowIndex, column) => ({
    isConnected: true,
    row,
    dataset: { navRow: String(rowIndex), navCol: String(column) },
    classList: { contains: () => false }
  });
  const previous = card(previousRow, 0, 0);
  const next = card(nextRow, 1, 0);
  const nextRight = card(nextRow, 1, 1);
  let focused = previous;
  const home = {
    ...methods02,
    ...methods03,
    ...methods17,
    ...methods19,
    layoutMode: "modern",
    navModel: { rows: [[previous], [next, nextRight]], sidebar: [] },
    getCurrentFocusedNode: () => focused,
    isMainNode: () => true,
    isSidebarNode: () => false,
    isNodeWithinMainViewport: (node) => node.row === previousRow,
    syncMainFocusToViewport() {
      assert.fail("A pending VIDAA camera move must keep focus on its destination row");
    },
    resolvePreferredNodeForRow: (row) => row[0],
    getMainFocusAnchor: (node) => node.row,
    getNodeRowKey: () => "catalog",
    getModernTrackAlignedScrollTarget: (node) => ({
      container: track,
      value: Number(node.dataset.navCol) * 300
    }),
    getModernMainAlignedScrollTarget: () => ({ container: viewport, value: 500 }),
    focusNode(current, target, direction) {
      if (!target || current === target) return false;
      focused = target;
      this.ensureTrackHorizontalVisibility(target, direction);
      this.ensureMainVerticalVisibility(target, direction, current);
      return true;
    }
  };
  assert.equal(home.handleHomeDpad({ keyCode: 40, preventDefault() {} }), true);
  assert.equal(focused, next);
  assert.equal(home.shouldSuspendModernViewportFocusSync(), true);
  const verticalStarter = home._mainVertRaf;
  assert.equal(home.handleHomeDpad({ keyCode: 39, preventDefault() {} }), true);
  assert.equal(focused, nextRight);
  assert.equal(home._mainVertRaf, verticalStarter);
  assert.equal(viewport.scrollTop, 0);
  frame(1000);
  frame(1140);
  assert.equal(viewport.scrollTop, 500);
  assert.equal(track.scrollLeft, 300);
  assert.equal(frames.size, 0);
}

// Rejected repeats and rapid taps skip geometry. Active scrolling also avoids
// a visibility read and keeps ownership of its destination focus.
{
  const current = { dataset: { navRow: "0", navCol: "0" }, classList: { contains: () => false } };
  const target = {};
  let geometryReads = 0;
  let focusMoves = 0;
  const home = {
    ...methods19,
    layoutMode: "modern",
    navModel: { rows: [[current, target]], sidebar: [] },
    getCurrentFocusedNode: () => current,
    isMainNode: () => true,
    isSidebarNode: () => false,
    isNodeWithinMainViewport() {
      geometryReads++;
      return false;
    },
    syncMainFocusToViewport() {
      assert.fail("Active scrolling must preserve the navigation focus");
    },
    shouldSuspendModernViewportFocusSync: () => true,
    getDirectionalRepeatThrottleMs: () => 80,
    getNodeRowKey: () => "catalog",
    focusNode() {
      focusMoves++;
      return true;
    },
    lastDirectionalKeyAtByDirection: { right: Date.now() },
    lastHomeDirectionalInputDirection: "right"
  };
  assert.equal(home.handleHomeDpad({ keyCode: 39, repeat: true, preventDefault() {} }), true);
  assert.equal(geometryReads, 0);
  assert.equal(focusMoves, 0);
  assert.equal(home.handleHomeDpad({ keyCode: 39, repeat: false, preventDefault() {} }), true);
  assert.equal(focusMoves, 0, "Rapid taps obey the same cadence as held arrows");
  now += 80;
  assert.equal(home.handleHomeDpad({ keyCode: 39, repeat: false, preventDefault() {} }), true);
  assert.equal(geometryReads, 0, "Active scrolling already owns viewport alignment");
  assert.equal(focusMoves, 1);
}

// Other platforms retain their spring and constrained instant paths, while
// pending frame work also protects the destination focus before motion starts.
for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  const track = scroller();
  const calls = [];
  const home = {
    ...methods02,
    ...methods03,
    ...methods17,
    layoutMode: "modern",
    isLegacyTvRuntime: () => true,
    isPerformanceConstrained: () => true,
    getModernTrackAlignedScrollTarget: () => ({ container: track, value: 300 }),
    animateSpringScroll(...args) {
      calls.push(args);
    }
  };
  assert.equal(home.getScrollDuration(160), 0, `${name} retains legacy duration`);
  home._mainVertRaf = 101;
  home._trackHorizRaf = 102;
  assert.equal(
    home.shouldSuspendModernViewportFocusSync(),
    true,
    `${name} protects focus while a scroll frame is pending`
  );
  home._mainVertRaf = null;
  home._trackHorizRaf = null;
  home.ensureTrackHorizontalVisibility({ isConnected: true }, "right");
  assert.equal(track.scrollLeft, 300, `${name} retains constrained instant scroll`);
  assert.equal(frames.size, 0);
  home.animateScroll(track, "x", 600, 150, { mode: "spring" });
  assert.equal(calls.length, 1, `${name} retains its spring entry point`);

  const viewport = scroller();
  const row = {};
  const card = { isConnected: true, row };
  home.getMainFocusAnchor = (node) => node?.row;
  home.getModernMainAlignedScrollTarget = () => {
    assert.fail(`${name}: cancelled frame must not measure or move a stale target`);
  };
  home.modernCameraFollowLastVerticalContainer = viewport;
  home.ensureMainVerticalVisibility(card, "down", { row: {} });
  const starter = home._mainVertRaf;
  home.ensureMainVerticalVisibility({ isConnected: true, row }, "right", card);
  assert.equal(
    home._mainVertRaf,
    starter,
    `${name}: horizontal input retains its pending row move`
  );
  home.cancelModernCameraFollow({ stopAnimations: true });
  assert.equal(home._mainVertRaf, null);
  assert.equal(frames.size, 0, `${name}: cleanup cancels queued geometry and scrolling`);
}
platform("vidaa");
assert.equal(methods03.getScrollDuration.call({ isLegacyTvRuntime: () => true }, 160), 140);
console.log(
  "VIDAA Home navigation passed: animated focus, held arrows, reversal, geometry and platform isolation."
);
