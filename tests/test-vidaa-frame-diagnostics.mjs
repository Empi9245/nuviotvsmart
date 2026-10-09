import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createVidaaFrameDiagnostics } from "../js/core/diagnostics/vidaaFrameDiagnostics.js";

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },
    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },
    emit(name, event = {}) {
      for (const handler of [...(listeners.get(name) || [])]) handler(event);
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0);
    }
  };
}

function harness({ observer = "supported", frameCapacity = 4, inputCapacity = 2 } = {}) {
  let time = 0;
  let sequence = 0;
  const frames = new Map();
  const observers = [];
  const document = {
    ...eventSurface(),
    visibilityState: "visible",
    hidden: false,
    webkitHidden: false
  };
  const root = {
    ...eventSurface(),
    document,
    performance: { now: () => time },
    requestAnimationFrame(callback) {
      const id = sequence++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    }
  };
  if (observer !== "missing") {
    root.PerformanceObserver = class {
      static supportedEntryTypes = observer === "unsupported" ? ["resource"] : ["longtask"];
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observers.push(this);
      }
      observe(options) {
        assert.deepEqual(options, { entryTypes: ["longtask"] });
        if (observer === "throws") throw new Error("Unsupported observer on this TV");
      }
      disconnect() {
        this.disconnected = true;
      }
      deliver(entries) {
        this.callback({ getEntries: () => entries });
      }
    };
  }
  const diagnostics = createVidaaFrameDiagnostics(root, { frameCapacity, inputCapacity });
  const frame = (timestamp) => {
    time = timestamp;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(timestamp);
  };
  return {
    root,
    document,
    frames,
    observers,
    diagnostics,
    frame,
    setTime(value) {
      time = value;
    },
    enable() {
      diagnostics.initialize({ enabled: true });
    }
  };
}

// Default OFF and non-VIDAA configuration cannot schedule background work.
{
  const h = harness();
  assert.equal(h.diagnostics.start(), false);
  h.diagnostics.initialize({ enabled: false });
  h.diagnostics.reset();
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
  h.enable();
  assert.equal(h.frames.size, 0, "Enabling availability must not start capture");
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
  assert.equal(h.diagnostics.getSnapshot().active, false);
}

// Ring eviction and percentiles reflect recent gaps, with a 1 ms scheduling
// tolerance so normal ~60 Hz timer noise is not reported as missed budget.
{
  const h = harness();
  h.enable();
  assert.equal(h.diagnostics.start(), true);
  h.diagnostics.start();
  assert.equal(h.frames.size, 1);
  assert.equal(h.observers.length, 1);
  let time = 0;
  h.frame(time);
  for (const gap of [1000 / 60, 17.2, 1000 / 30, 34.6, 100]) {
    time += gap;
    h.frame(time);
  }
  const result = h.diagnostics.getSnapshot();
  assert.equal(result.frames.samples, 4);
  assert.equal(result.frames.total, 5);
  assert.ok(Math.abs(result.frames.p50Ms - 1000 / 30) < 0.001);
  assert.equal(result.frames.p95Ms, 100);
  assert.equal(result.frames.p99Ms, 100);
  assert.equal(result.frames.overBudget60, 3);
  assert.equal(result.frames.overBudget30, 2);
  assert.equal(result.toleranceMs, 1);
  h.diagnostics.reset();
  h.frame(1000);
  for (let i = 1; i <= 60; i += 1) h.frame(1000 + i * 17.2);
  assert.equal(h.diagnostics.getSnapshot().frames.overBudget60, 0);
  h.diagnostics.stop();
}

// Input samples record numeric input-to-next-callback opportunities only.
// Multiple inputs before one callback are coalesced; raw keys/targets and
// long-task attribution must never be inspected or retained.
{
  const h = harness();
  h.enable();
  h.diagnostics.start();
  h.frame(0);
  const privateEvent = {
    get key() {
      throw new Error("Do not read input details");
    },
    get target() {
      throw new Error("Do not retain DOM/content");
    }
  };
  for (const [inputTime, frameTime] of [
    [5, 16],
    [20, 32],
    [33, 48]
  ]) {
    h.setTime(inputTime);
    h.document.emit("keydown", privateEvent);
    h.setTime(inputTime + 1);
    h.document.emit("keydown", privateEvent);
    h.frame(frameTime);
  }
  let result = h.diagnostics.getSnapshot();
  assert.equal(result.inputs.samples, 2);
  assert.equal(result.inputs.total, 3);
  assert.equal(result.inputs.p50Ms, 12);
  assert.equal(result.inputs.p95Ms, 15);
  h.observers[0].deliver([
    {
      startTime: 30,
      duration: 76,
      get name() {
        throw new Error("Do not inspect task names");
      },
      get attribution() {
        throw new Error("Do not inspect attribution/URLs");
      }
    },
    { duration: NaN }
  ]);
  result = h.diagnostics.getSnapshot();
  assert.equal(result.longTasks.count, 1);
  assert.equal(result.longTasks.maxMs, 76);
  assert.equal(result.longTasks.durationMs, 76);
  assert.deepEqual(Object.keys(result.inputs).sort(), [
    "maxMs",
    "p50Ms",
    "p95Ms",
    "p99Ms",
    "samples",
    "total"
  ]);
  h.diagnostics.stop();
}

// Hidden time and bfcache/pagehide never become a giant frame gap. Late
// callbacks from a disconnected run cannot restart sampling or add results.
{
  const h = harness();
  h.enable();
  h.diagnostics.start();
  h.frame(0);
  h.frame(16);
  h.setTime(18);
  h.document.emit("keydown");
  const oldFrame = [...h.frames.values()][0];
  const oldObserver = h.observers[0];
  h.document.hidden = true;
  h.document.visibilityState = "hidden";
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 0);
  assert.equal(oldObserver.disconnected, true);
  assert.equal(h.diagnostics.getSnapshot().paused, true);
  oldFrame(5000);
  oldObserver.deliver([{ startTime: 100, duration: 5000 }]);
  assert.equal(h.diagnostics.getSnapshot().longTasks.count, 0);
  assert.equal(h.frames.size, 0);
  h.setTime(6000);
  h.document.hidden = false;
  h.document.visibilityState = "visible";
  h.document.emit("visibilitychange");
  h.frame(6000);
  h.frame(6016);
  assert.equal(h.diagnostics.getSnapshot().frames.maxMs, 16);
  assert.equal(h.diagnostics.getSnapshot().inputs.samples, 0);
  h.root.emit("pagehide");
  assert.equal(h.frames.size, 0);
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 0, "Visible document does not undo pagehide");
  h.root.emit("pageshow");
  h.frame(10000);
  h.frame(10016);
  assert.equal(h.diagnostics.getSnapshot().frames.maxMs, 16);
  h.document.webkitHidden = true;
  h.document.emit("webkitvisibilitychange");
  assert.equal(h.frames.size, 0);
  h.document.webkitHidden = false;
  h.document.emit("webkitvisibilitychange");
  assert.equal(h.frames.size, 1);
  h.document.emit("nuvio:beforeExitApp");
  assert.equal(h.diagnostics.getSnapshot().active, false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
}

// Reset starts a new timing baseline and discards pending callbacks/tasks.
// Stop removes every capture listener/observer/RAF while preserving results.
{
  const h = harness();
  h.enable();
  h.diagnostics.start();
  h.frame(0);
  h.frame(20);
  const oldFrame = [...h.frames.values()][0];
  const oldObserver = h.observers[0];
  h.diagnostics.reset();
  oldFrame(100);
  oldObserver.deliver([{ startTime: 100, duration: 70 }]);
  assert.equal(h.frames.size, 1);
  h.frame(200);
  assert.equal(h.diagnostics.getSnapshot().frames.samples, 0);
  h.frame(216);
  h.root.emit("beforeunload");
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
  assert.equal(h.observers.at(-1).disconnected, true);
  assert.equal(h.diagnostics.getSnapshot().frames.p50Ms, 16);
  h.diagnostics.reset();
  assert.equal(h.diagnostics.getSnapshot().frames.samples, 0);
  assert.equal(h.frames.size, 0);
  h.diagnostics.start();
  h.diagnostics.initialize({ enabled: false });
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
}

// Starting/resetting while the app is already hidden waits for foreground;
// stopping in the background removes the resume listeners as well.
{
  const h = harness();
  h.document.hidden = true;
  h.document.visibilityState = "hidden";
  h.enable();
  assert.equal(h.diagnostics.start(), true);
  assert.equal(h.diagnostics.getSnapshot().paused, true);
  h.diagnostics.reset();
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers.length, 0);
  h.diagnostics.stop();
  h.document.hidden = false;
  h.document.visibilityState = "visible";
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
}

// A visible debug-panel subscriber receives at most one metrics update per
// second, without adding another timer/RAF stream.
{
  const h = harness();
  h.enable();
  let notifications = 0;
  const unsubscribe = h.diagnostics.subscribe(() => {
    notifications += 1;
  });
  h.diagnostics.start();
  h.frame(0);
  const initial = notifications;
  for (let i = 1; i < 60; i += 1) h.frame(i * (1000 / 60));
  assert.equal(notifications, initial);
  h.frame(1000);
  assert.equal(notifications, initial + 1);
  assert.equal(h.frames.size, 1);
  unsubscribe();
  h.diagnostics.stop();
}

for (const observer of ["missing", "unsupported", "throws"]) {
  const h = harness({ observer });
  h.enable();
  h.diagnostics.start();
  h.frame(0);
  h.frame(16);
  assert.equal(h.diagnostics.getSnapshot().frames.samples, 1);
  assert.equal(h.diagnostics.getSnapshot().longTasks.supported, false);
  h.diagnostics.stop();
}

{
  const h = harness();
  delete h.root.requestAnimationFrame;
  h.enable();
  assert.equal(h.diagnostics.start(), false);
  assert.equal(h.root.listenerCount() + h.document.listenerCount(), 0);
}

// Execute the real debug-screen methods with only platform/navigation stubs.
// Every new command must be reachable with the TV's D-pad and Enter, and
// other platforms keep their existing console controls.
{
  const source = await readFile(
    new URL("../js/ui/screens/debug/consoleDebugScreen.js", import.meta.url),
    "utf8"
  );
  const h = harness();
  h.enable();
  let platform = "vidaa";
  const context = {
    I18n: { t: (_key, _params, options) => options.fallback },
    VidaaFrameDiagnostics: h.diagnostics,
    Platform: { isVidaa: () => platform === "vidaa", isBackEvent: () => false },
    Router: {},
    ScreenUtils: {},
    PluginServiceClient: {},
    getConsoleDebugEvents: () => [],
    subscribeToConsoleDebugEvents: () => () => {}
  };
  vm.runInNewContext(
    source
      .replace(/^import[\s\S]*?;\r?\n/gm, "")
      .replace("export const ConsoleDebugScreen", "globalThis.screen"),
    context
  );
  const screen = context.screen;
  assert.match(screen.renderFrameDiagnostics(), /data-focus-key="frame-capture"/);
  assert.match(screen.renderFrameDiagnostics(), /data-focus-key="frame-reset"/);
  assert.match(screen.renderFrameDiagnostics(), /non misurano i fotogrammi/);
  screen.updateFrameDiagnostics = () => {};
  screen.applyFocus = () => {};
  const actions = {
    back: "back",
    "frame-capture": "toggle-frame-diagnostics",
    "frame-reset": "reset-frame-diagnostics",
    log: "log"
  };
  screen.container = {
    querySelector(selector) {
      if (selector === ".focusable.focused")
        return { dataset: { action: actions[screen.focusKey] } };
      if (selector.includes("toggle-frame-diagnostics")) return platform === "vidaa" ? {} : null;
      return null;
    }
  };
  screen.getLogList = () => ({ scrollTop: 0 });
  const key = (keyCode) => screen.onKeyDown({ keyCode, preventDefault() {} });
  screen.focusKey = "back";
  await key(40);
  assert.equal(screen.focusKey, "frame-capture");
  await key(13);
  assert.equal(h.diagnostics.getSnapshot().active, true);
  h.frame(0);
  h.frame(20);
  await key(39);
  assert.equal(screen.focusKey, "frame-reset");
  await key(13);
  assert.equal(h.diagnostics.getSnapshot().frames.samples, 0);
  await key(40);
  assert.equal(screen.focusKey, "log");
  await key(38);
  assert.equal(screen.focusKey, "frame-reset");
  await key(38);
  assert.equal(screen.focusKey, "frame-capture");
  await key(13);
  assert.equal(h.diagnostics.getSnapshot().active, false);
  platform = "webos";
  assert.equal(screen.renderFrameDiagnostics(), "");
  screen.focusKey = "back";
  await key(40);
  assert.equal(screen.focusKey, "log");
}

console.log("VIDAA local frame diagnostics: OFF/lifecycle/bounded metrics/remote controls passed");
