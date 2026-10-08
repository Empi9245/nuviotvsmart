import assert from "node:assert/strict";
import { createTextInputHarness, TestEvent } from "./helpers/vidaaTextInputHarness.mjs";
import { Platform } from "../js/platform/index.js";
import { FocusEngine } from "../js/ui/navigation/focusEngine.js";
import { Router } from "../js/ui/navigation/routerState.js";
import { NuvioDialog } from "../js/ui/components/nuvioDialog.js";
import {
  isVidaaNavigationBusy,
  resetVidaaNavigationActivity
} from "../js/ui/navigation/vidaaNavigationActivity.js";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}
function engine() {
  return {
    ...FocusEngine,
    lastBackHandledAt: 0,
    activeKeyDownStartedAt: new Map(),
    activeBackKeyIdentities: new Set(),
    nativeTextKeyIdentities: new Set()
  };
}

platform("vidaa");
for (const options of [
  { type: "text" },
  { type: "url" },
  { type: "search" },
  { type: "email" },
  { type: "password" },
  { tagName: "TEXTAREA" },
  { tagName: "DIV", contentEditable: "true", isContentEditable: true }
]) {
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node(options.tagName || "INPUT", options);
  const page = h.node("DIV");
  let downs = 0,
    ups = 0,
    backs = 0,
    localEnters = 0;
  Router.getCurrentScreen = () => ({
    onKeyDown() {
      downs++;
    },
    onKeyUp() {
      ups++;
    }
  });
  Router.back = () => {
    backs++;
  };
  Router.consumeRouteReturnBackGuard = () => false;
  input.addEventListener("keydown", () => {
    localEnters++;
  });
  const focus = engine();
  document.addEventListener("keydown", (event) => focus.handleKey(event), true);
  document.addEventListener("keyup", (event) => focus.handleKeyUp(event), true);
  input.focus();
  assert.equal(Platform.isNativeTextInputEditingActive(), true);
  resetVidaaNavigationActivity();
  h.dispatch(h.key(13, input), input);
  h.dispatch(new TestEvent("keyup", { keyCode: 13 }), input);
  for (const code of [13, 37, 39, 8, 46, 35, 36]) {
    const down = h.dispatch(h.key(code, page), page);
    assert.equal(down.defaultPrevented, false, `Native default is retained for ${code}`);
    h.dispatch(new TestEvent("keyup", { keyCode: code }), page);
  }
  for (const event of [
    { key: "Enter" },
    { keyName: "OK" },
    { keyCode: 23 },
    { key: "ArrowLeft" },
    { key: "Backspace" },
    { keyCode: 229, isComposing: true }
  ]) {
    const down = h.dispatch(h.key(0, page, event), page);
    assert.equal(down.defaultPrevented, false);
  }
  assert.equal(backs, 0, "Backspace targeted at the outer surface must not navigate");
  assert.equal(downs, 0, "Editing keys never reach any screen handler");
  assert.equal(ups, 0, "Editing keyup never reaches a UI action");
  assert.equal(localEnters, 0, "Local submit listeners cannot intercept native OK");
  assert.equal(isVidaaNavigationBusy(), false, "Caret keys do not mark UI navigation busy");
  input.blur();
  assert.equal(h.timers.size, 0);
  assert.equal(
    Platform.isNativeTextInputEditingActive({ target: input }),
    false,
    "A stale target cannot trap focus after focusout"
  );
  const right = h.dispatch(h.key(39, page), page);
  assert.equal(right.defaultPrevented, true);
  assert.equal(downs, 1, "D-pad returns immediately to the UI");
  focus.handleKeyUp(h.key(39, page));
  const back = h.dispatch(h.key(8, page), page);
  assert.equal(back.defaultPrevented, true);
  assert.equal(backs, 1, "Back outside the editor navigates normally");
}

// Commit and cancellation release editing even if the firmware keeps activeElement.
{
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node("INPUT", { classes: ["focusable", "focused"] });
  input.focus();
  input.value = "committed";
  h.native("change", input);
  assert.equal(Platform.isNativeTextInputEditingActive(), false);
  assert.equal(h.timers.size, 0);
  assert.equal(document.activeElement, document.body);
  assert.equal(
    Platform.handleTextInputKey(h.key(13)),
    true,
    "OK reopens the visually focused field"
  );
  assert.equal(document.activeElement, input);
  const cancel = h.key(27);
  assert.equal(Platform.handleTextInputKey(cancel), true);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(Platform.isNativeTextInputEditingActive(), false);
  input.focus();
  // Reproduce firmware focusout without changing activeElement.
  h.native("focusout", input);
  assert.equal(
    Platform.isBackEvent(h.key(8, input)),
    true,
    "Back works after a keyboard dismissal with stale DOM focus"
  );
  assert.equal(Platform.shouldPreserveTextInputKey(h.key(39, input)), false);
  const nativeBack = Object.create({ keyCode: 8, target: input });
  assert.equal(
    Platform.isBackEvent(nativeBack),
    true,
    "Native event properties can live on the prototype"
  );
}

// Keyup from the keyboard cannot become a button action after the field loses focus.
{
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node();
  const button = h.node("BUTTON");
  let releases = 0;
  Router.getCurrentScreen = () => ({
    onKeyUp() {
      releases++;
    }
  });
  const focus = engine();
  for (const code of [13, 8]) {
    input.focus();
    focus.handleKey(h.key(code));
    button.focus();
    const up = h.key(code, button);
    focus.handleKeyUp(up);
    assert.equal(up.defaultPrevented, false);
  }
  assert.equal(releases, 0);
  assert.equal(focus.nativeTextKeyIdentities.size, 0);
}

// The window-level modal focus trap runs before the document-level FocusEngine.
{
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node("TEXTAREA");
  input.focus();
  let actions = 0;
  const dialog = new NuvioDialog({
    title: "Edit",
    buttons: [
      {
        label: "Save",
        onAction() {
          actions++;
        }
      }
    ]
  });
  for (const code of [13, 37, 38, 39, 40, 8]) {
    const event = h.key(code);
    dialog._onKey(event);
    assert.equal(event.defaultPrevented, false);
    dialog._onKeyUp(h.key(code));
  }
  assert.equal(actions, 0);
  const escape = h.key(27);
  dialog._onKey(escape);
  assert.equal(dialog._destroyed, false, "First Back closes editing, leaving the modal open");
}

// Non-editable controls and other platforms keep their existing routing.
for (const name of ["vidaa", "tizen", "webos", "browser"]) {
  platform(name);
  const h = createTextInputHarness();
  h.attachGlobals();
  const focus = engine();
  let downs = 0;
  Router.getCurrentScreen = () => ({
    onKeyDown() {
      downs++;
    }
  });
  const input = h.node();
  input.focus();
  if (name !== "vidaa") {
    assert.equal(Platform.handleTextInputKey(h.key(13)), false);
    focus.handleKey(h.key(13));
    assert.equal(downs, 1, `${name} still forwards its Enter to the screen`);
  } else {
    for (const options of [
      { type: "checkbox" },
      { type: "range" },
      { readOnly: true },
      { disabled: true }
    ]) {
      const control = h.node("INPUT", options);
      control.focus();
      assert.equal(Platform.isNativeTextInputEditingActive(), false);
      assert.equal(Platform.handleTextInputKey(h.key(13)), false);
    }
  }
}
console.log(
  "VIDAA text input routing passed: native defaults, Back, commit/focusout, D-pad, modals and platform isolation."
);
