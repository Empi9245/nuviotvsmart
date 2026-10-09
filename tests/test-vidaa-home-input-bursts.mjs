import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const runtimeClasses = new Set();
globalThis.document = {
  body: { classList: { contains: (name) => runtimeClasses.has(name) } },
  documentElement: { classList: { contains: (name) => runtimeClasses.has(name) } }
};

const { Platform } = await import("../js/platform/index.js");
const { LayoutPreferences } = await import("../js/data/local/layoutPreferences.js");
const { createHomeScreenMethods03 } =
  await import("../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js");
const { createHomeScreenMethods19 } =
  await import("../js/ui/screens/home/homeScreenMethods-19-handle-home-dpad.js");
const { createHomeScreenMethods28 } =
  await import("../js/ui/screens/home/homeScreenMethods-28-on-key-down.js");

let now = 0;
let fastHorizontalNavigationEnabled = false;
const originalNow = Date.now;
const originalGetPreferences = LayoutPreferences.get;
Date.now = () => now;
LayoutPreferences.get = () => ({ fastHorizontalNavigationEnabled });

const directions = new Map([
  [37, "left"],
  [38, "up"],
  [39, "right"],
  [40, "down"]
]);
const deltas = new Map([
  [37, [0, -1]],
  [38, [-1, 0]],
  [39, [0, 1]],
  [40, [1, 0]]
]);
function key(keyCode, repeat = false) {
  return {
    keyCode,
    repeat,
    prevented: 0,
    preventDefault() {
      this.prevented++;
    }
  };
}

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}

// Keep the real Home key handlers and cadence policy. The fixture replaces
// rendering, scrolling and preview work with observable side effects so excess
// keys cannot quietly spend their budget before the navigation gate runs.
function home({ constrained = false, legacy = false, immediateHorizontal = false } = {}) {
  const counts = {
    focusLookup: 0,
    fallbackLookup: 0,
    visibility: 0,
    focusMoves: 0,
    enterCancel: 0,
    holdCancel: 0,
    posterCancel: 0,
    pillQuery: 0,
    pillToggle: 0,
    pillAutoCollapse: 0,
    fastScrollStart: 0,
    fastScrollEnd: 0,
    fastScrollKeepalive: 0,
    heroSchedule: 0,
    posterSchedule: 0
  };
  const rows = Array.from({ length: 32 }, (_, row) =>
    Array.from({ length: 48 }, (_, col) => ({
      dataset: { navRow: String(row), navCol: String(col) },
      classList: { contains: () => false }
    }))
  );
  let focused = rows[16][24];
  const pill = {
    classList: {
      toggle() {
        counts.pillToggle++;
      },
      remove() {
        counts.pillToggle++;
      }
    }
  };
  const owner = {
    ...createHomeScreenMethods03(),
    ...createHomeScreenMethods19(),
    ...createHomeScreenMethods28(),
    layoutMode: "modern",
    layoutPrefs: { modernSidebar: true },
    sidebarExpanded: false,
    navModel: { rows, sidebar: [] },
    container: {
      querySelector(selector) {
        if (selector === ".modern-sidebar-shell" || selector === ".modern-sidebar-pill") {
          counts.pillQuery++;
          return selector === ".modern-sidebar-pill" ? pill : null;
        }
        counts.fallbackLookup++;
        return focused;
      }
    },
    isPerformanceConstrained: () => constrained,
    isLegacyTvRuntime: () => legacy,
    markUserInteractionSinceHomePaint() {},
    getCurrentFocusedNode() {
      counts.focusLookup++;
      return focused;
    },
    isHomeHoldTarget: () => false,
    cancelPendingContinueWatchingEnter() {
      counts.enterCancel++;
    },
    cancelPendingContinueWatchingHold() {
      counts.holdCancel++;
    },
    cancelFocusedPosterFlow() {
      counts.posterCancel++;
    },
    cancelModernSidebarPillAutoCollapse() {
      counts.pillAutoCollapse++;
    },
    scheduleModernSidebarPillAutoCollapse() {
      counts.pillAutoCollapse++;
    },
    isMainNode: () => true,
    isSidebarNode: () => false,
    isNodeWithinMainViewport() {
      counts.visibility++;
      return true;
    },
    shouldSuspendModernViewportFocusSync: () => false,
    syncMainFocusToViewport() {
      assert.fail("Visible cards must keep their navigation focus");
    },
    startModernVerticalFastScroll() {
      counts.fastScrollStart++;
      return false;
    },
    armModernVerticalFastScrollEndTimer() {
      counts.fastScrollKeepalive++;
    },
    endModernVerticalFastScroll() {
      counts.fastScrollEnd++;
      this.modernVerticalFastScrollState = null;
    },
    getNodeRowKey: () => "catalog",
    resolvePreferredNodeForRow: (row, col) => row[col] || row[0],
    shouldUseImmediateHorizontalScrollForNode: () => immediateHorizontal,
    scheduleModernHeroUpdate() {
      counts.heroSchedule++;
    },
    scheduleFocusedPosterFlow() {
      counts.posterSchedule++;
    },
    focusNode(current, target) {
      if (!target || target === current) return false;
      counts.focusMoves++;
      focused = target;
      return true;
    }
  };
  return { owner, counts, focused: () => focused };
}

try {
  for (const name of ["vidaa", "webos", "tizen", "browser"]) {
    platform(name);
    for (const constrained of [false, true]) {
      for (const [code, direction] of directions) {
        for (const mode of ["native-repeat", "repeat-without-flag", "rapid-taps"]) {
          const { owner, counts, focused } = home({ constrained });
          const interval = owner.getDirectionalRepeatThrottleMs(direction);
          let accepted = 0;
          for (let index = 0; index < 100; index++) {
            now = index * 8;
            const event = key(code, mode === "native-repeat");
            const before = { ...counts };
            owner.onKeyDown(event);
            if (counts.focusMoves !== before.focusMoves) {
              accepted++;
            } else {
              assert.deepEqual(
                counts,
                before,
                `${name} ${mode} ${direction}: rejected input must skip focus, pill and flow work`
              );
            }
            assert.equal(
              event.prevented,
              1,
              "Every navigation event must consume the arrow default"
            );
            assert.equal(
              owner.lastHomeInputAt,
              now,
              "Rejected arrows must also renew the navigation quiet window"
            );
            if (mode === "rapid-taps") owner.onKeyUp(key(code));
          }
          const expected = Math.floor(792 / interval) + 1;
          assert.equal(
            accepted,
            expected,
            `${name} ${mode} ${direction}: focus work must stay within cadence`
          );
          assert.equal(
            counts.enterCancel,
            expected,
            "Only accepted input may cancel pending Enter work"
          );
          assert.equal(
            counts.holdCancel,
            expected,
            "Only accepted input may cancel pending hold work"
          );
          assert.equal(counts.posterCancel, expected, "Only accepted input may cancel poster work");
          assert.equal(
            counts.visibility,
            expected,
            "Geometry checks must stay within the accepted input budget"
          );
          assert.equal(
            counts.focusLookup,
            expected * 2 + (mode === "rapid-taps" && (code === 37 || code === 39) ? 100 : 0)
          );
          assert.equal(counts.fallbackLookup, 0);
          assert.equal(counts.pillToggle, code === 38 || code === 40 ? expected : 0);
          const [rowDelta, colDelta] = deltas.get(code);
          assert.equal(Number(focused().dataset.navRow), 16 + rowDelta * expected);
          assert.equal(Number(focused().dataset.navCol), 24 + colDelta * expected);
          const complete = { ...counts };
          await Promise.resolve();
          assert.deepEqual(
            counts,
            complete,
            "The released burst must not replay a queued navigation backlog"
          );
        }
      }
    }

    // The first event remains immediate even when the firmware supplies a
    // stale native repeat flag, and every turn has its own immediate response.
    {
      const { owner, counts } = home();
      now = 0;
      owner.onKeyDown(key(39, true));
      assert.equal(
        counts.focusMoves,
        1,
        `${name}: first repeat-marked arrow must be accepted at timestamp zero`
      );
      now = 1;
      owner.onKeyDown(key(39));
      assert.equal(counts.focusMoves, 1);
      for (const code of [37, 40, 38, 39]) owner.onKeyDown(key(code, true));
      assert.equal(
        counts.focusMoves,
        5,
        `${name}: reversing or changing axis must respond immediately`
      );
    }

    // Separate normal presses keep their full response. Releasing a key does
    // not let a rapid tap reopen its accepted-work budget.
    for (const [code, direction] of directions) {
      const { owner, counts } = home();
      const interval = owner.getDirectionalRepeatThrottleMs(direction);
      now = 0;
      owner.onKeyDown(key(code));
      owner.onKeyUp(key(code));
      now = interval - 1;
      owner.onKeyDown(key(code));
      assert.equal(counts.focusMoves, 1, `${name}: keyup must not bypass ${direction} cadence`);
      now = interval;
      owner.onKeyDown(key(code));
      assert.equal(counts.focusMoves, 2, `${name}: the exact cadence boundary must reopen input`);
      now = 500;
      owner.onKeyDown(key(code));
      assert.equal(counts.focusMoves, 3, `${name}: ordinary presses must remain immediate`);
      now = 100;
      owner.onKeyDown(key(code));
      assert.equal(counts.focusMoves, 4, `${name}: a backwards clock must recover immediately`);
      now = 101;
      owner.onKeyDown(key(code));
      assert.equal(counts.focusMoves, 4, `${name}: cadence must resume after a backwards clock`);
      assert.equal(owner.lastHomeInputAt, 101);
    }

    // The optional fast-horizontal setting remains fast on capable hardware;
    // constrained and legacy hardware still bound the full Home workload.
    fastHorizontalNavigationEnabled = true;
    for (const options of [{}, { constrained: true }, { legacy: true }]) {
      const { owner, counts } = home(options);
      const interval = owner.getDirectionalRepeatThrottleMs("right");
      assert.equal(interval, options.constrained || options.legacy ? 120 : 48);
      now = 0;
      owner.onKeyDown(key(39));
      now = interval - 1;
      owner.onKeyDown(key(39));
      assert.equal(counts.focusMoves, 1);
      now = interval;
      owner.onKeyDown(key(39));
      assert.equal(counts.focusMoves, 2);
    }
    fastHorizontalNavigationEnabled = false;
  }

  // A keyup still completes the correct fast-scroll direction without wiping
  // the input gate. It also preserves the horizontal release preview behavior.
  platform("vidaa");
  {
    const { owner } = home();
    now = 0;
    owner.onKeyDown(key(39));
    assert.equal(
      owner.isHomeNavigationSettling(),
      false,
      "An ordinary first press must keep its normal preview behavior"
    );
    now = 8;
    owner.onKeyDown(key(39));
    assert.equal(
      owner.isHomeNavigationSettling(),
      true,
      "Even rejected rapid input must defer work until navigation settles"
    );
    now = 257;
    assert.equal(
      owner.isHomeNavigationSettling(),
      true,
      "The quiet window must follow the most recent rejected arrow"
    );
    now = 258;
    assert.equal(
      owner.isHomeNavigationSettling(),
      false,
      "Deferred work may resume after the full quiet window"
    );
    now = 400;
    owner.onKeyDown(key(39));
    assert.equal(
      owner.isHomeNavigationSettling(),
      false,
      "A normal press after the quiet window must remain immediate"
    );
  }

  // Rejected held arrows still keep the matching vertical camera alive. The
  // renewal spends no DOM or focus work, and unrelated directions cannot keep
  // an old vertical movement alive. Cover both real screen entry points.
  for (const entryPoint of ["onKeyDown", "handleHomeDpad"]) {
    for (const [code, direction] of directions) {
      for (const activeDirection of [-1, 1]) {
        const { owner, counts } = home();
        now = 1000;
        owner[entryPoint](key(code));
        owner.modernVerticalFastScrollState = { direction: activeDirection };
        now = 1008;
        const before = { ...counts };
        const event = key(code, true);
        owner[entryPoint](event);
        const matching =
          (direction === "up" ? -1 : direction === "down" ? 1 : 0) === activeDirection;
        assert.deepEqual(
          counts,
          {
            ...before,
            fastScrollKeepalive: before.fastScrollKeepalive + (matching ? 1 : 0)
          },
          `${entryPoint}: only rejected input matching the active vertical hold may renew its timer`
        );
        assert.equal(event.prevented, 1);
        assert.equal(owner.lastHomeInputAt, 1008);
      }
    }
  }

  {
    const { owner, counts } = home({ immediateHorizontal: true });
    now = 1000;
    owner.onKeyDown(key(40));
    owner.modernVerticalFastScrollState = { direction: 1 };
    owner.onKeyUp(key(38));
    assert.equal(
      counts.fastScrollEnd,
      0,
      "Releasing the opposite direction must not finish the active hold"
    );
    owner.onKeyUp(key(40));
    assert.equal(counts.fastScrollEnd, 1);
    now = 1008;
    owner.onKeyDown(key(40));
    assert.equal(counts.focusMoves, 1, "Landing a vertical hold must preserve rapid-tap cadence");
    owner.onKeyUp(key(39));
    assert.equal(counts.heroSchedule, 1);
    assert.equal(counts.posterSchedule, 1);
  }
} finally {
  Date.now = originalNow;
  LayoutPreferences.get = originalGetPreferences;
}

console.log(
  "Home input burst checks passed: bounded native holds and rapid taps in four directions, immediate turns, zero/backwards time, cadence boundaries, release behavior and TV/browser policies."
);
