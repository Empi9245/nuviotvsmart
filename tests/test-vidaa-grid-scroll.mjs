import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";

const { Platform } = await import("../js/platform/index.js");
const { createLibraryScreenMethods01 } =
  await import("../js/ui/screens/library/libraryScreenMethods-01-clear-closing-picker.js");
const { createDiscoverScreenMethods04 } =
  await import("../js/ui/screens/search/discoverScreenMethods-04-restore-focused-card.js");

let now = 0;
let nextId = 0;
let rectReads = 0;
const frames = new Map();
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.matchMedia = () => ({ matches: false });
globalThis.HTMLElement = class {};

function classList() {
  const classes = new Set();
  return {
    contains: (name) => classes.has(name),
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name))
  };
}

function surface(initialTop = 0) {
  const scroller = new HTMLElement();
  Object.assign(scroller, {
    scrollTop: initialTop,
    clientHeight: 500,
    scrollHeight: 2000,
    isConnected: true,
    style: {},
    nativeScrolls: 0,
    scrollTo({ top }) {
      this.scrollTop = top;
      this.nativeScrolls += 1;
    },
    getBoundingClientRect() {
      rectReads += 1;
      return { top: 100, bottom: 600, height: 500 };
    }
  });
  const cards = [];
  const container = {
    querySelectorAll: () => cards.filter((item) => item.classList.contains("focused")),
    querySelector: () => cards.find((item) => item.classList.contains("focused"))
  };
  const card = (itemTop, height = 180, row = 1) => {
    const target = new HTMLElement();
    Object.assign(target, {
      dataset: {
        navRow: String(row),
        navCol: "0",
        itemIndex: "3",
        itemId: "test",
        action: "openDetail"
      },
      classList: classList(),
      nativeScrolls: 0,
      offsetTop: itemTop,
      offsetHeight: height,
      focus() {},
      matches: (selector) => selector === ".library-grid-card",
      closest: (selector) => (selector === ".library-main" ? scroller : null),
      scrollIntoView() {
        this.nativeScrolls += 1;
      },
      getBoundingClientRect() {
        rectReads += 1;
        return {
          top: 100 + itemTop - scroller.scrollTop,
          bottom: 100 + itemTop + height - scroller.scrollTop,
          height
        };
      }
    });
    cards.push(target);
    return target;
  };
  return { scroller, container, card };
}

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  now = 0;
  rectReads = 0;
  frames.clear();
}

function step(time) {
  now = time;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(now));
}

function libraryOwner(container) {
  return {
    ...createLibraryScreenMethods01(),
    container,
    layoutPrefs: { modernSidebar: true },
    isSidebarNode: () => false,
    controller: { setFocusedPosterKey() {} }
  };
}

function discoverOwner(container, scroller) {
  return {
    ...createDiscoverScreenMethods04(),
    container,
    layoutPrefs: { modernSidebar: true },
    getContentScroller: () => scroller,
    shouldAutoLoadMore: () => false
  };
}

platform("vidaa");
{
  const { scroller, container, card } = surface(50);
  const owner = libraryOwner(container);
  const first = card(650);
  owner.setFocusedNode(first);
  assert.equal(first.nativeScrolls, 0, "VIDAA grid focus owns the main scroll container");
  assert.equal(scroller.scrollTop, 50, "Focus responds immediately while scroll animates");
  assert.equal(frames.size, 1);
  const readsAfterFocus = rectReads;
  step(70);
  assert.equal(scroller.scrollTop, 200);
  assert.equal(
    rectReads,
    readsAfterFocus,
    "The animation must not measure card geometry each frame"
  );

  const pendingFrame = [...frames.keys()][0];
  const second = card(1000);
  owner.setFocusedNode(second);
  assert.equal(frames.size, 1);
  assert.equal([...frames.keys()][0], pendingFrame, "A new row retargets the existing animation");
  step(210);
  assert.equal(scroller.scrollTop, 700, "Reveal the focused card with a 20px gutter");
  assert.equal(frames.size, 0);
}

platform("vidaa");
{
  const { scroller, container, card } = surface(600);
  const owner = discoverOwner(container, scroller);
  owner.focusNode(card(200, 240, 0));
  assert.equal(owner.savedScrollTop, 0, "The first row still returns to the filters at the top");
  assert.equal(scroller.scrollTop, 600);
  step(140);
  assert.equal(scroller.scrollTop, 0);
  const second = card(760, 240, 2);
  second.offsetTop = 12; // Its offset parent can be the nested grid.
  owner.focusNode(second);
  assert.equal(
    owner.savedScrollTop,
    520,
    "Resolve nested-grid geometry relative to the main viewport"
  );
  const readsAfterFocus = rectReads;
  step(280);
  assert.equal(scroller.scrollTop, 520);
  assert.equal(rectReads, readsAfterFocus);
  assert.equal(scroller.nativeScrolls, 0);

  const third = card(1300, 240, 3);
  owner.focusNode(third);
  const pendingFrame = [...frames.keys()][0];
  owner.startDiscoverVerticalFastScroll(1);
  assert.equal(
    frames.has(pendingFrame),
    false,
    "Held scrolling cancels the pending focus animation"
  );
  assert.equal(frames.size, 1, "The fast-scroll loop is the only active writer");
  owner.endDiscoverVerticalFastScroll({ land: false });
  assert.equal(frames.size, 0);
}

for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  const library = surface(50);
  const target = library.card(650);
  libraryOwner(library.container).setFocusedNode(target);
  assert.equal(target.nativeScrolls, 1, `${name}: keep native library scrollIntoView`);
  assert.equal(frames.size, 0);

  const discover = surface(0);
  const owner = discoverOwner(discover.container, discover.scroller);
  owner.focusNode(discover.card(760, 240, 2));
  assert.equal(discover.scroller.scrollTop, 520, `${name}: keep instant Discover focus scrolling`);
  assert.equal(frames.size, 0);
}

console.log(
  "VIDAA grid checks passed: smooth focus, retargeting, nested geometry, held-scroll handoff, and unchanged Tizen/webOS paths."
);
