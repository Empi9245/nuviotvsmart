import assert from "node:assert/strict";
import { FocusEngine } from "../js/ui/navigation/focusEngine.js";
import { Router } from "../js/ui/navigation/routerState.js";
import { Platform } from "../js/platform/index.js";

let now = 1000;
Date.now = () => now;
globalThis.document = {
  contains: (target) => target.isConnected !== false,
  body: { classList: { contains: () => false } }
};
const target = { isConnected: true, tagName: "DIV" };
const downs = [];
const ups = [];
Router.getCurrentScreen = () => ({
  onKeyDown(event) {
    downs.push(event);
  },
  onKeyUp(event) {
    ups.push(event);
  }
});

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}

function engine() {
  return {
    ...FocusEngine,
    activeKeyDownStartedAt: new Map(),
    activeBackKeyIdentities: new Set()
  };
}

function remoteEvent(keyCode, repeat = false, extra = {}) {
  const calls = [];
  return {
    keyCode,
    repeat,
    target,
    calls,
    preventDefault() {
      calls.push("prevent");
    },
    stopPropagation() {
      calls.push("stop");
    },
    stopImmediatePropagation() {
      calls.push("stopImmediate");
    },
    ...extra
  };
}

platform("vidaa");
for (const code of [37, 38, 39, 40]) {
  const focus = engine();
  now = 1000;
  const first = remoteEvent(code);
  focus.handleKey(first);
  assert.equal(downs.at(-1).repeat, false, `First ${code} press must move normally`);
  assert.deepEqual(first.calls, ["prevent", "stop", "stopImmediate"]);
  now = 1040;
  focus.handleKey(remoteEvent(code, false));
  assert.equal(
    downs.at(-1).repeat,
    true,
    `Repeated ${code} keydowns must be inferred without native repeat`
  );
  now = 1100;
  focus.handleKey(remoteEvent(code, true));
  assert.equal(downs.at(-1).repeat, true);
  now = 1300;
  const release = remoteEvent(code);
  focus.handleKeyUp(release);
  assert.equal(ups.at(-1).keyDownDurationMs, 300, "Hold timing must start on the first keydown");
  assert.deepEqual(release.calls, ["prevent", "stop", "stopImmediate"]);
  assert.equal(focus.activeKeyDownStartedAt.has(`code:${code}`), false);
  focus.handleKey(remoteEvent(code));
  assert.equal(downs.at(-1).repeat, false, "A released key begins a new normal press");
}

// Different representations of RIGHT share the normalized key cycle.
{
  const focus = engine();
  focus.handleKey(remoteEvent(39));
  focus.handleKey(remoteEvent(0, false, { keyName: "DpadRight" }));
  assert.equal(downs.at(-1).repeat, true);
  focus.handleKeyUp(remoteEvent(0, false, { key: "ArrowRight" }));
  focus.handleKey(remoteEvent(39, true));
  assert.equal(
    downs.at(-1).repeat,
    false,
    "The first directional event starts a normal cycle even with a stale native flag"
  );
}

// Each direction has its own cycle; changing direction responds immediately.
{
  const focus = engine();
  focus.handleKey(remoteEvent(39));
  focus.handleKey(remoteEvent(37));
  assert.equal(downs.at(-1).repeat, false);
  focus.handleKey(remoteEvent(37));
  assert.equal(downs.at(-1).repeat, true);
  focus.handleKey(remoteEvent(39));
  assert.equal(downs.at(-1).repeat, true);
}

// VIDAA keyup still releases a cycle when navigation detaches the old target.
{
  const focus = engine();
  focus.handleKey(remoteEvent(39));
  focus.handleKeyUp(remoteEvent(39, false, { target: { isConnected: false } }));
  focus.handleKey(remoteEvent(39));
  assert.equal(downs.at(-1).repeat, false);
}

// Enter repeat suppression and its held duration keep their previous semantics.
{
  const focus = engine();
  const start = downs.length;
  now = 2000;
  focus.handleKey(remoteEvent(13));
  now = 2050;
  focus.handleKey(remoteEvent(13, false));
  focus.handleKey(remoteEvent(13, true));
  assert.equal(downs.length, start + 1, "Holding Enter must not trigger additional actions");
  now = 2300;
  focus.handleKeyUp(remoteEvent(13));
  assert.equal(ups.at(-1).keyDownDurationMs, 300);
  focus.handleKey(remoteEvent(13, true));
  assert.equal(downs.length, start + 1, "An initial native Enter repeat keeps its suppression");
}

// Other platforms keep the native repeat flag and existing hold timing exactly.
for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  const focus = engine();
  now = 3000;
  const first = remoteEvent(39);
  focus.handleKey(first);
  now = 3050;
  const second = remoteEvent(39, false);
  focus.handleKey(second);
  assert.equal(downs.at(-1).repeat, false, `${name} retains native non-repeat events`);
  now = 3100;
  focus.handleKey(remoteEvent(39, true));
  assert.equal(downs.at(-1).repeat, true, `${name} retains native repeat events`);
  now = 3300;
  focus.handleKeyUp(remoteEvent(39));
  assert.equal(
    ups.at(-1).keyDownDurationMs,
    250,
    `${name} retains its existing timestamp behavior`
  );
  assert.deepEqual(first.calls, []);
  assert.deepEqual(second.calls, []);
  const beforeEnter = downs.length;
  focus.handleKey(remoteEvent(13));
  focus.handleKey(remoteEvent(13));
  assert.equal(downs.length, beforeEnter + 2, `${name} retains existing Enter routing`);
}

console.log(
  "VIDAA remote repeat checks passed: held directions, keyup release, Enter and platform isolation."
);
