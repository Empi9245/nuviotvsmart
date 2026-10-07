import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";

const { Platform } = await import("../js/platform/index.js");
const { resetTvRuntimePerformanceProfile } = await import("../js/platform/tvRuntimePerformance.js");
const { setLegacySidebarExpanded } =
  await import("../js/ui/components/sidebarNavigationHelpers-03-render-root-sidebar.js");
const { setModernSidebarExpanded } =
  await import("../js/ui/components/sidebarNavigationHelpers-04-set-modern-sidebar-expanded.js");

let nextId = 0;
let layoutReads = 0;
const frames = new Map();
const timers = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.setTimeout = (callback, delay) => {
  const id = ++nextId;
  timers.set(id, { callback, delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);

function classList(initial = []) {
  const classes = new Set(initial);
  return {
    contains: (name) => classes.has(name),
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle(name, enabled) {
      if (enabled) classes.add(name);
      else classes.delete(name);
    }
  };
}

function node(initial = []) {
  return {
    classList: classList(initial),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    get offsetWidth() {
      layoutReads += 1;
      return 100;
    }
  };
}

function sidebarSurface(modern = false) {
  const sidebar = node();
  const panel = node();
  const pill = node();
  sidebar.querySelector = (selector) => {
    if (selector === ".modern-sidebar-panel") return panel;
    if (selector === ".modern-sidebar-pill") return pill;
    return null;
  };
  const container = {
    classList: classList(),
    matches: () => true,
    querySelectorAll: () => [],
    querySelector(selector) {
      if (modern && selector === ".modern-sidebar-shell") return sidebar;
      if (!modern && [".home-sidebar", ".root-sidebar-legacy"].includes(selector)) return sidebar;
      return null;
    }
  };
  return { container, sidebar, panel, pill };
}

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  resetTvRuntimePerformanceProfile();
  frames.clear();
  timers.clear();
  layoutReads = 0;
}

function flushFrames() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
}

function flushTimers() {
  const callbacks = [...timers.values()];
  timers.clear();
  callbacks.forEach(({ callback }) => callback());
}

platform("vidaa");
{
  const { container, sidebar } = sidebarSurface();
  for (let i = 0; i < 20; i += 1) setLegacySidebarExpanded(container, false);
  assert.equal(layoutReads, 0, "Repeated card focus must not force sidebar layout");
  assert.equal(frames.size, 0, "Repeated collapsed state must not refit sidebar labels");
  assert.equal(timers.size, 0);

  setLegacySidebarExpanded(container, true);
  assert.equal(sidebar.classList.contains("expanded"), true);
  assert.equal(sidebar.classList.contains("content-expanded"), true);
  assert.equal(container.classList.contains("has-expanded-sidebar"), true);
  assert.equal(frames.size, 1, "Measure labels once after a real expansion");
  flushFrames();
  for (let i = 0; i < 20; i += 1) setLegacySidebarExpanded(container, true);
  assert.equal(frames.size, 0);

  setLegacySidebarExpanded(container, false);
  flushFrames();
  assert.equal(sidebar.classList.contains("expanded"), false);
  assert.equal(container.classList.contains("has-expanded-sidebar"), false);
  for (let i = 0; i < 20; i += 1) setLegacySidebarExpanded(container, false);
  assert.equal(frames.size, 0);
  assert.equal(layoutReads, 0);
  assert.equal(timers.size, 0);
}

platform("vidaa");
{
  const { container, sidebar, panel, pill } = sidebarSurface(true);
  for (let i = 0; i < 20; i += 1) setModernSidebarExpanded(container, false);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);

  setModernSidebarExpanded(container, true);
  const openTimer = sidebar._modernOpenTimer;
  assert.equal(sidebar.classList.contains("expanded"), true);
  assert.equal(panel.attributes["aria-hidden"], "false");
  assert.equal(pill.attributes["aria-expanded"], "true");
  assert.equal(timers.get(openTimer).delay, 120);
  flushFrames();
  setModernSidebarExpanded(container, true);
  assert.equal(
    sidebar._modernOpenTimer,
    openTimer,
    "Repeated state must not restart the transition"
  );
  assert.equal(frames.size, 0);

  setModernSidebarExpanded(container, false);
  assert.equal(timers.has(openTimer), false, "Closing must cancel pending opening cleanup");
  assert.equal(sidebar.classList.contains("expanded"), false);
  assert.equal(sidebar.classList.contains("collapsing"), true);
  assert.equal(pill.attributes["aria-expanded"], "false");
  const closeTimer = sidebar._modernCloseEndTimer;
  assert.equal(timers.get(closeTimer).delay, 120);
  setModernSidebarExpanded(container, false);
  assert.equal(sidebar._modernCloseEndTimer, closeTimer);

  setModernSidebarExpanded(container, true);
  assert.equal(
    timers.has(closeTimer),
    false,
    "A quick reopen must cancel pending collapse cleanup"
  );
  flushFrames();
  flushTimers();
  assert.equal(sidebar.classList.contains("expanded"), true);
  assert.equal(sidebar.classList.contains("panel-visible"), true);
  assert.equal(sidebar.classList.contains("opening"), false);
  assert.equal(panel.attributes["aria-hidden"], "false");

  setModernSidebarExpanded(container, false);
  flushTimers();
  assert.equal(sidebar.classList.contains("panel-visible"), false);
  assert.equal(sidebar.classList.contains("collapsing"), false);
  assert.equal(panel.attributes["aria-hidden"], "true");
  assert.equal(layoutReads, 0);
}

for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  const legacy = sidebarSurface();
  setLegacySidebarExpanded(legacy.container, false);
  assert.equal(layoutReads, 1, `${name}: preserve existing legacy transition path`);
  assert.equal(frames.size, 2);
  flushFrames();
  setLegacySidebarExpanded(legacy.container, true);
  assert.equal(layoutReads, 2);
  assert.equal(timers.get(legacy.sidebar._legacyOpenTimer).delay, 350);

  frames.clear();
  timers.clear();
  const modern = sidebarSurface(true);
  setModernSidebarExpanded(modern.container, true);
  assert.equal(modern.sidebar.classList.contains("expanded"), false);
  assert.equal(timers.get(modern.sidebar._modernOpenTimer).delay, 365);
  flushFrames();
  assert.equal(modern.sidebar.classList.contains("expanded"), true);
  setModernSidebarExpanded(modern.container, false);
  assert.equal(timers.get(modern.sidebar._modernCloseStartTimer).delay, 70);
  assert.equal(timers.get(modern.sidebar._modernCloseEndTimer).delay, 430);
}

console.log(
  "VIDAA sidebar checks passed: repeated focus, transition reversal, accessibility, and unchanged Tizen/webOS paths."
);
