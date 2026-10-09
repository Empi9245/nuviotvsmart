const FRAME_CAPACITY = 1800;
const INPUT_CAPACITY = 240;
const FRAME_BUDGET_60_MS = 1000 / 60;
const FRAME_BUDGET_30_MS = 1000 / 30;
const FRAME_TOLERANCE_MS = 1;

function numericRing(capacity) {
  const values = new Array(capacity);
  let cursor = 0;
  let count = 0;
  return {
    push(value) {
      values[cursor] = value;
      cursor = (cursor + 1) % capacity;
      count = Math.min(count + 1, capacity);
    },
    clear() {
      values.fill(undefined);
      cursor = 0;
      count = 0;
    },
    read() {
      return values.slice(0, count);
    }
  };
}

function distribution(values) {
  const sorted = values.sort((a, b) => a - b);
  const percentile = (fraction) =>
    sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
  return {
    samples: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.length ? sorted[sorted.length - 1] : null
  };
}

// Only numeric timings are retained in memory. No event, DOM node, route,
// content, URL or attribution is captured, persisted or sent anywhere.
export function createVidaaFrameDiagnostics(root = globalThis, options = {}) {
  const frameCapacity = Math.max(
    1,
    Math.min(FRAME_CAPACITY, Number(options.frameCapacity) || FRAME_CAPACITY)
  );
  const inputCapacity = Math.max(
    1,
    Math.min(INPUT_CAPACITY, Number(options.inputCapacity) || INPUT_CAPACITY)
  );
  const frameRing = numericRing(Math.floor(frameCapacity));
  const inputRing = numericRing(Math.floor(inputCapacity));
  const subscribers = new Set();
  const documentRef = root.document;
  let enabled = false;
  let active = false;
  let paused = false;
  let pageHidden = false;
  let rafId = null;
  let observer = null;
  let epoch = 0;
  let previousFrame = null;
  let pendingInput = null;
  let lastNotification = null;
  let totalFrames = 0;
  let totalInputs = 0;
  let longTaskSupported = null;
  let longTaskCount = 0;
  let longTaskDuration = 0;
  let longTaskMax = 0;

  const now = () =>
    typeof root.performance?.now === "function" ? root.performance.now() : Date.now();
  const available = () =>
    enabled &&
    typeof root.requestAnimationFrame === "function" &&
    typeof root.cancelAnimationFrame === "function";
  const hidden = () =>
    pageHidden ||
    documentRef?.visibilityState === "hidden" ||
    documentRef?.hidden === true ||
    documentRef?.webkitHidden === true;
  const notify = () => {
    subscribers.forEach((listener) => {
      try {
        listener();
      } catch (_) {}
    });
  };

  function disconnectObserver() {
    try {
      observer?.disconnect();
    } catch (_) {}
    observer = null;
  }

  function observeLongTasks() {
    const Observer = root.PerformanceObserver;
    longTaskSupported = false;
    if (typeof Observer !== "function") return;
    if (
      Array.isArray(Observer.supportedEntryTypes) &&
      !Observer.supportedEntryTypes.includes("longtask")
    )
      return;
    const observerEpoch = epoch;
    const observedAfter = now();
    try {
      observer = new Observer((list) => {
        if (!active || paused || observerEpoch !== epoch) return;
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration);
          // Ignore queued entries from before reset/resume, without requesting
          // a historical buffer or reading long-task attribution.
          if (Number.isFinite(entry.startTime) && entry.startTime < observedAfter) continue;
          if (!Number.isFinite(duration) || duration <= 0) continue;
          longTaskCount += 1;
          longTaskDuration += duration;
          longTaskMax = Math.max(longTaskMax, duration);
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
      longTaskSupported = true;
    } catch (_) {
      disconnectObserver();
    }
  }

  function scheduleFrame() {
    if (!active || paused || rafId !== null) return;
    const frameEpoch = epoch;
    rafId = root.requestAnimationFrame((timestamp) => {
      if (!active || paused || frameEpoch !== epoch) return;
      rafId = null;
      const frameTime = Number.isFinite(timestamp) ? timestamp : now();
      if (previousFrame !== null && frameTime > previousFrame) {
        frameRing.push(frameTime - previousFrame);
        totalFrames += 1;
      }
      previousFrame = frameTime;
      if (pendingInput !== null) {
        const delay = now() - pendingInput;
        if (Number.isFinite(delay) && delay >= 0) {
          inputRing.push(delay);
          totalInputs += 1;
        }
        pendingInput = null;
      }
      // Updating the visible debug panel is bounded to once per second. When
      // it is closed there are no subscribers and no formatting/sorting work.
      if (subscribers.size && (lastNotification === null || frameTime - lastNotification >= 1000)) {
        lastNotification = frameTime;
        notify();
      }
      scheduleFrame();
    });
  }

  function suspendSampling() {
    epoch += 1;
    if (rafId !== null) root.cancelAnimationFrame(rafId);
    rafId = null;
    previousFrame = null;
    pendingInput = null;
    lastNotification = null;
    disconnectObserver();
  }

  function syncVisibility() {
    if (!active) return;
    const nextPaused = hidden();
    if (paused === nextPaused) return;
    paused = nextPaused;
    suspendSampling();
    if (!paused) {
      observeLongTasks();
      scheduleFrame();
    }
    notify();
  }

  function onPageHide() {
    pageHidden = true;
    syncVisibility();
  }

  function onPageShow() {
    pageHidden = false;
    syncVisibility();
  }

  function onInput() {
    // One sample for the first key/pointer input before the next rAF callback.
    // This is an opportunity to paint, not measured display/presentation time.
    if (active && !paused && pendingInput === null) pendingInput = now();
  }

  function stop() {
    active = false;
    paused = false;
    pageHidden = false;
    suspendSampling();
    documentRef?.removeEventListener?.("visibilitychange", syncVisibility);
    documentRef?.removeEventListener?.("webkitvisibilitychange", syncVisibility);
    documentRef?.removeEventListener?.("keydown", onInput, true);
    documentRef?.removeEventListener?.("pointerdown", onInput, true);
    documentRef?.removeEventListener?.("nuvio:beforeExitApp", stop);
    root.removeEventListener?.("pagehide", onPageHide);
    root.removeEventListener?.("pageshow", onPageShow);
    root.removeEventListener?.("beforeunload", stop);
    notify();
  }

  return {
    initialize({ enabled: nextEnabled = false } = {}) {
      if (!nextEnabled && active) stop();
      enabled = nextEnabled === true;
    },
    start() {
      if (!available()) return false;
      if (active) return true;
      active = true;
      paused = hidden();
      documentRef?.addEventListener?.("visibilitychange", syncVisibility);
      documentRef?.addEventListener?.("webkitvisibilitychange", syncVisibility);
      documentRef?.addEventListener?.("keydown", onInput, true);
      documentRef?.addEventListener?.("pointerdown", onInput, true);
      documentRef?.addEventListener?.("nuvio:beforeExitApp", stop);
      root.addEventListener?.("pagehide", onPageHide);
      root.addEventListener?.("pageshow", onPageShow);
      root.addEventListener?.("beforeunload", stop);
      if (!paused) {
        observeLongTasks();
        scheduleFrame();
      }
      notify();
      return true;
    },
    stop,
    reset() {
      suspendSampling();
      frameRing.clear();
      inputRing.clear();
      totalFrames = 0;
      totalInputs = 0;
      longTaskCount = 0;
      longTaskDuration = 0;
      longTaskMax = 0;
      if (active && !paused) {
        observeLongTasks();
        scheduleFrame();
      }
      notify();
    },
    getSnapshot() {
      const frameValues = frameRing.read();
      const overBudget60 = frameValues.filter(
        (gap) => gap > FRAME_BUDGET_60_MS + FRAME_TOLERANCE_MS
      ).length;
      const overBudget30 = frameValues.filter(
        (gap) => gap > FRAME_BUDGET_30_MS + FRAME_TOLERANCE_MS
      ).length;
      return {
        available: available(),
        active,
        paused,
        frameCapacity: Math.floor(frameCapacity),
        frameBudget60Ms: FRAME_BUDGET_60_MS,
        frameBudget30Ms: FRAME_BUDGET_30_MS,
        toleranceMs: FRAME_TOLERANCE_MS,
        frames: { ...distribution(frameValues), total: totalFrames, overBudget60, overBudget30 },
        inputs: { ...distribution(inputRing.read()), total: totalInputs },
        longTasks: {
          supported: longTaskSupported,
          count: longTaskCount,
          durationMs: longTaskDuration,
          maxMs: longTaskMax
        }
      };
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    }
  };
}

export const VidaaFrameDiagnostics = createVidaaFrameDiagnostics();
