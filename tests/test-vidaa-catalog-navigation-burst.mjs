import assert from "node:assert/strict";
import { allowDpadRepeat, resetDpadRepeat } from "../js/ui/navigation/dpadRepeatThrottle.js";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.HTMLElement = class {};
let constrained = false;
const runtimeClasses = { contains: (name) => constrained && name === "performance-constrained" };
globalThis.document = {
  body: { classList: runtimeClasses },
  documentElement: { classList: runtimeClasses }
};

const { createCatalogSeeAllScreenMethods01 } =
  await import("../js/ui/screens/catalog/catalogSeeAllScreenMethods-01-get-route-state-key.js");
const { createCatalogSeeAllScreenMethods02 } =
  await import("../js/ui/screens/catalog/catalogSeeAllScreenMethods-02-handle-grid-dpad.js");
const { createCatalogSeeAllScreenMethods03 } =
  await import("../js/ui/screens/catalog/catalogSeeAllScreenMethods-03-on-key-down.js");

let now = 0;
Date.now = () => now;
const burstOptions = { throttleRapidPresses: true };
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

// Rate-limit the accepted work, not just native repeats. A zero timestamp is
// valid; keyup between every press must not reopen the same-direction budget.
for (const keyCode of [37, 38, 39, 40]) {
  for (const repeat of [false, true]) {
    const owner = {};
    let accepted = 0;
    for (let index = 0; index < 100; index++) {
      now = index * 8;
      const event = key(keyCode, repeat);
      if (allowDpadRepeat(owner, event, burstOptions)) accepted++;
      else assert.equal(event.prevented, 1, "Rejected input must consume the arrow default");
    }
    const interval = keyCode === 37 || keyCode === 39 ? 80 : 112;
    assert.equal(accepted, Math.floor(792 / interval) + 1);
  }
}

// The first key and each direction change remain immediate, including a
// vertical turn. Independent screens and ordinary press cadence retain input.
{
  const owner = {};
  now = 0;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
  now = 8;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), false);
  assert.equal(allowDpadRepeat(owner, key(37), burstOptions), true);
  assert.equal(allowDpadRepeat(owner, key(40), burstOptions), true);
  assert.equal(allowDpadRepeat({}, key(40), burstOptions), true);
  now = 200;
  assert.equal(allowDpadRepeat(owner, key(40), burstOptions), true);
  resetDpadRepeat(owner);
  assert.equal(allowDpadRepeat(owner, key(40), burstOptions), true);
}

// Callers that did not opt into burst filtering keep every separate tap and
// their first repeat. Direction changes no longer share the prior key's gate.
{
  const owner = {};
  now = 0;
  for (let index = 0; index < 100; index++) {
    assert.equal(allowDpadRepeat(owner, key(39)), true);
  }
  assert.equal(allowDpadRepeat(owner, key(39, true)), true);
  now = 8;
  assert.equal(allowDpadRepeat(owner, key(39, true)), false);
  assert.equal(allowDpadRepeat(owner, key(37, true)), true);
  assert.equal(allowDpadRepeat(owner, key(13, true)), true);
}

// Constrained hardware receives the existing wider interval for both bursts
// and holds, and time moving backwards cannot permanently lock navigation.
{
  const owner = {};
  constrained = true;
  now = 1000;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
  now = 1080;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), false);
  now = 1120;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
  now = 500;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
  constrained = false;
}

function catalog() {
  const counts = { focusQueries: 0, focusScans: 0, focusCalls: 0, geometryReads: 0 };
  const shell = Object.assign(new HTMLElement(), {
    scrollTop: 0,
    style: { scrollBehavior: "" },
    scrollTo({ top }) {
      this.scrollTop = top;
    }
  });
  for (const [name, value] of Object.entries({
    scrollHeight: 9000,
    clientHeight: 500,
    offsetHeight: 500
  })) {
    Object.defineProperty(shell, name, {
      get() {
        counts.geometryReads++;
        return value;
      }
    });
  }
  const rows = Array.from({ length: 24 }, (_, row) =>
    Array.from({ length: 24 }, (_, col) => {
      const classes = new Set(row === 0 && col === 0 ? ["focused"] : []);
      const card = Object.assign(new HTMLElement(), {
        dataset: {
          navRow: String(row),
          navCol: String(col),
          itemIndex: String(row * 24 + col),
          focusKey: `${row}:${col}`
        },
        classList: {
          contains: (name) => classes.has(name),
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name)
        },
        focus() {
          counts.focusCalls++;
        }
      });
      for (const [name, value] of Object.entries({
        offsetTop: row * 350 + 70,
        offsetHeight: 300
      })) {
        Object.defineProperty(card, name, {
          get() {
            counts.geometryReads++;
            return value;
          }
        });
      }
      return card;
    })
  );
  const cards = rows.flat();
  const focused = () => cards.find((card) => card.classList.contains("focused"));
  const container = {
    querySelector(selector) {
      if (selector === ".seeall-shell") return shell;
      counts.focusQueries++;
      return focused();
    },
    querySelectorAll() {
      counts.focusScans++;
      return cards.filter((card) => card.classList.contains("focused"));
    }
  };
  return {
    owner: {
      ...createCatalogSeeAllScreenMethods01(),
      ...createCatalogSeeAllScreenMethods02(),
      ...createCatalogSeeAllScreenMethods03(),
      navModel: { rows },
      container,
      isPosterHoldTarget: () => false,
      shouldAutoLoadMore: () => false,
      maybeExpandRenderedItems: () => false
    },
    counts,
    focused,
    rows
  };
}

// Exercise the real catalog handler and focus work. One hundred separate taps
// run only ten focus transitions and twenty queries; excess keys never reach
// geometry, refocusing, pagination, or a deferred queue.
{
  const { owner, counts, focused } = catalog();
  for (let index = 0; index < 100; index++) {
    now = index * 8;
    await owner.onKeyDown(key(39));
    owner.onKeyUp(key(39));
  }
  assert.equal(focused().dataset.navCol, "10");
  assert.equal(counts.focusCalls, 10);
  assert.equal(counts.focusScans, 10);
  assert.equal(counts.focusQueries, 20);
  const completed = { ...counts };
  await Promise.resolve();
  assert.deepEqual(counts, completed, "Released bursts must not replay a navigation backlog");
  now = 793;
  await owner.onKeyDown(key(37));
  assert.equal(focused().dataset.navCol, "9", "Reversal responds immediately");
  now = 1000;
  await owner.onKeyDown(key(37));
  assert.equal(focused().dataset.navCol, "8", "Ordinary presses remain immediate");
}

// Held input has the same bounded work vertically; Enter stays outside the
// gate. Holding against a row edge must never refocus the current card.
{
  const { owner, counts, focused, rows } = catalog();
  for (let index = 0; index < 100; index++) {
    now = index * 8;
    await owner.onKeyDown(key(40, index > 0));
  }
  assert.equal(focused().dataset.navRow, "8");
  assert.equal(counts.focusCalls, 8);
  assert.equal(counts.focusQueries, 16);
  owner.focusNode(rows[8][23]);
  const before = { ...counts };
  now = 1000;
  await owner.onKeyDown(key(39));
  assert.equal(counts.focusCalls, before.focusCalls);
  assert.equal(counts.focusScans, before.focusScans);
  assert.equal(counts.geometryReads, before.geometryReads);
  let enterStarted = 0;
  owner.isPosterHoldTarget = () => true;
  owner.hasPendingPosterHold = () => false;
  owner.startPendingPosterHold = () => {
    enterStarted++;
  };
  await owner.onKeyDown(key(13));
  assert.equal(enterStarted, 1);
}

// Catalog cleanup releases the gate before hiding the screen, so a remount or
// restored route cannot inherit a blocked first key from its prior lifecycle.
{
  const owner = {
    ...createCatalogSeeAllScreenMethods03(),
    cancelPendingPosterHold() {},
    container: null
  };
  now = 2000;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
  now = 2008;
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), false);
  owner.cleanup();
  assert.equal(allowDpadRepeat(owner, key(39), burstOptions), true);
}

console.log(
  "Catalog navigation burst checks passed: bounded tap/hold work, immediate turns, zero-time cadence, edge no-ops, Enter and lifecycle reset."
);
