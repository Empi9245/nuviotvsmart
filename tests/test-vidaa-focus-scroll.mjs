import assert from "node:assert/strict";
import {
  animateVidaaFocusScroll,
  VIDAA_FOCUS_SCROLL_DURATION_MS
} from "../js/ui/navigation/vidaaFocusScroll.js";
import { ScreenUtils } from "../js/ui/navigation/screen.js";

let now = 0;
let nextId = 0;
let reducedMotion = false;
const frames = new Map();
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.matchMedia = () => ({ matches: reducedMotion });

function frameAt(time) {
  now = time;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}

function scroller() {
  let geometryReads = 0;
  const node = { scrollLeft: 0, scrollTop: 0, isConnected: true };
  for (const [name, value] of Object.entries({
    scrollWidth: 8000,
    clientWidth: 1000,
    scrollHeight: 6000,
    clientHeight: 1000
  })) {
    Object.defineProperty(node, name, {
      get() {
        geometryReads += 1;
        return value;
      }
    });
  }
  return { node, reads: () => geometryReads };
}

// A press produces intermediate frames. Remote repeats reuse that animation
// and its velocity, rather than snapping, stacking, or restarting from rest.
{
  const owner = {};
  const { node, reads } = scroller();
  animateVidaaFocusScroll(owner, node, "x", 300);
  assert.equal(node.scrollLeft, 0);
  assert.equal(frames.size, 1);
  assert.equal(reads(), 2);
  frameAt(50);
  assert.ok(node.scrollLeft > 0 && node.scrollLeft < 300);
  const position = node.scrollLeft;
  const state = owner.vidaaFocusScrollAnimations.get(node).x;
  const velocity = state.velocity;
  const pendingFrame = owner.scrollAnimations.get(node).x;
  animateVidaaFocusScroll(owner, node, "x", 600);
  assert.equal(node.scrollLeft, position, "Retargeting must not move the rendered position");
  assert.equal(
    owner.scrollAnimations.get(node).x,
    pendingFrame,
    "Held input keeps one animation loop"
  );
  assert.equal(
    owner.vidaaFocusScrollAnimations.get(node).x.initialVelocity,
    velocity,
    "Held input retains velocity"
  );
  assert.equal(frames.size, 1);
  frameAt(51);
  assert.ok(
    Math.abs(node.scrollLeft - position - velocity) < 0.2,
    "Motion continues at the previous velocity"
  );
  const geometryAfterRetarget = reads();
  frameAt(100);
  assert.ok(node.scrollLeft > position && node.scrollLeft < 600);
  frameAt(50 + VIDAA_FOCUS_SCROLL_DURATION_MS);
  assert.equal(node.scrollLeft, 600);
  assert.equal(frames.size, 0);
  assert.equal(reads(), geometryAfterRetarget, "Animation frames must not read layout");
}

// Simulate a long held RIGHT: every target is followed monotonically, velocity
// remains continuous, there is never more than one queued frame, and release
// settles at the last target without replaying earlier key presses.
{
  now = 1000;
  const owner = {};
  const { node } = scroller();
  let lastPosition = 0;
  for (let index = 1; index <= 18; index += 1) {
    const target = index * 250;
    const start = now;
    animateVidaaFocusScroll(owner, node, "x", target);
    assert.equal(node.scrollLeft, lastPosition);
    for (let elapsed = 16; elapsed <= 80; elapsed += 16) {
      frameAt(start + elapsed);
      assert.equal(frames.size, 1);
      assert.ok(node.scrollLeft >= lastPosition && node.scrollLeft <= target);
      lastPosition = node.scrollLeft;
    }
  }
  frameAt(now + VIDAA_FOCUS_SCROLL_DURATION_MS);
  assert.equal(node.scrollLeft, 4500);
  assert.equal(frames.size, 0);
}

// Low frame rates do not stretch a simulated spring; the next delayed frame
// finishes the bounded animation using elapsed wall-clock time.
{
  now = 3000;
  const { node } = scroller();
  animateVidaaFocusScroll({}, node, "y", 550);
  frameAt(3400);
  assert.equal(node.scrollTop, 550);
  assert.equal(frames.size, 0);
}

// Reversal, exact-position cancellation, clipping and independent axes.
{
  now = 4000;
  const owner = {};
  const { node } = scroller();
  animateVidaaFocusScroll(owner, node, "x", 1000);
  animateVidaaFocusScroll(owner, node, "y", 600);
  assert.equal(frames.size, 2);
  frameAt(4050);
  const shown = node.scrollLeft;
  animateVidaaFocusScroll(owner, node, "x", 0);
  assert.equal(node.scrollLeft, shown);
  frameAt(4080);
  assert.ok(node.scrollLeft < shown);
  frameAt(4200);
  assert.equal(node.scrollLeft, 0);
  assert.equal(node.scrollTop, 600);
  animateVidaaFocusScroll(owner, node, "x", 1000);
  animateVidaaFocusScroll(owner, node, "x", 0);
  assert.equal(
    frames.size,
    0,
    "A reversal to the currently rendered position must stop pending motion"
  );
  animateVidaaFocusScroll(owner, node, "x", 9000, { duration: 0 });
  assert.equal(node.scrollLeft, 7000);
  animateVidaaFocusScroll(owner, node, "y", -500, { duration: 0 });
  assert.equal(node.scrollTop, 0);
}

// Reduced motion and detached elements cancel pending work, including a
// previous spring, before returning from an otherwise redundant request.
{
  now = 5000;
  const owner = {};
  const { node } = scroller();
  const spring = requestAnimationFrame(() => assert.fail("Stale spring must be cancelled"));
  owner.springScrollAnimations = new WeakMap([[node, { x: { raf: spring } }]]);
  animateVidaaFocusScroll(owner, node, "x", 0);
  assert.equal(frames.size, 0);
  assert.equal(owner.springScrollAnimations.get(node).x, null);
  animateVidaaFocusScroll(owner, node, "x", 500);
  reducedMotion = true;
  animateVidaaFocusScroll(owner, node, "x", 800);
  assert.equal(node.scrollLeft, 800);
  assert.equal(frames.size, 0);
  reducedMotion = false;
  animateVidaaFocusScroll(owner, node, "x", 1000);
  node.isConnected = false;
  frameAt(5030);
  assert.equal(node.scrollLeft, 800);
  assert.equal(frames.size, 0);
}

// Generic directional navigation measures each visible candidate once only
// on VIDAA, while preserving the existing selection and other-platform path.
function focusNode(x, y, focused = false) {
  const classes = new Set(focused ? ["focused"] : []);
  return {
    reads: 0,
    dataset: {},
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      this.reads += 1;
      return { left: x, top: y, width: 100, height: 100 };
    }
  };
}
globalThis.document = { body: { classList: { contains: () => false } } };
for (const platform of ["vidaa", "tizen", "webos", "browser"]) {
  globalThis.__NUVIO_PLATFORM__ = platform;
  const nodes = [focusNode(0, 0, true), focusNode(130, 0), focusNode(0, 130), focusNode(130, 130)];
  const container = {
    querySelectorAll: () => nodes,
    querySelector: () => nodes.find((node) => node.classList.contains("focused"))
  };
  ScreenUtils.moveFocusDirectional(container, "right");
  assert.equal(
    nodes[1].classList.contains("focused"),
    true,
    `${platform}: focus chooses the same right neighbor`
  );
  assert.ok(
    nodes.every((node) => node.reads === (platform === "vidaa" ? 1 : 2)),
    `${platform}: geometry optimization is VIDAA-only`
  );
  frames.clear();
}

// Search and Details must use the continuous helper only for VIDAA, including
// when their callers request spring camera following or invoke it directly.
const { Platform } = await import("../js/platform/index.js");
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createSearchScreenMethods04 } =
  await import("../js/ui/screens/search/searchScreenMethods-04-open-sidebar.js");
const { createMetaDetailsScreenMethods17 } =
  await import("../js/ui/screens/detail/metaDetailsScreenMethods-17-capture-detail-focus.js");
for (const methods of [createSearchScreenMethods04(), createMetaDetailsScreenMethods17()]) {
  for (const platform of ["vidaa", "tizen", "webos", "browser"]) {
    globalThis.__NUVIO_PLATFORM__ = platform;
    Platform.current = null;
    now = 7000;
    const { node } = scroller();
    const owner = { ...methods, isLegacyTvRuntime: () => false };
    owner.animateScroll(node, "x", 500, 280, { mode: "spring" });
    assert.equal(node.scrollLeft, 0);
    if (platform === "vidaa") {
      assert.ok(
        owner.vidaaFocusScrollAnimations?.get(node)?.x,
        "VIDAA uses a continuous focus animation"
      );
      frameAt(7140);
      assert.equal(node.scrollLeft, 500);
    } else {
      assert.equal(
        owner.vidaaFocusScrollAnimations,
        undefined,
        `${platform} does not enter the VIDAA helper`
      );
      assert.ok(
        owner.springScrollAnimations?.get(node)?.x?.raf,
        `${platform} keeps the previous spring`
      );
    }
    frames.clear();
    owner.animateSpringScroll(node, "y", 600);
    if (platform === "vidaa") {
      frameAt(now + 140);
      assert.equal(node.scrollTop, 600);
    } else {
      assert.equal(owner.vidaaFocusScrollAnimations, undefined);
      assert.ok(owner.springScrollAnimations?.get(node)?.y?.raf);
    }
    frames.clear();
  }
}

console.log("VIDAA continuous focus scrolling and geometry regressions passed.");
