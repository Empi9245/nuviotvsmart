import assert from "node:assert/strict";
import { createTextInputHarness } from "./helpers/vidaaTextInputHarness.mjs";
import { Platform } from "../js/platform/index.js";
import { FocusEngine } from "../js/ui/navigation/focusEngine.js";
import { Router } from "../js/ui/navigation/routerState.js";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
Platform.current = null;
const { SharedPluginScreen } = await import("../js/ui/screens/plugin/sharedPluginScreen.js");
const { PluginsScreen } = await import("../js/ui/screens/plugin/pluginsScreen.js");
const { SettingsScreen } = await import("../js/ui/screens/settings/settingsScreen.js");
const { SearchScreen } = await import("../js/ui/screens/search/searchScreen.js");
const { AuthQrSignInScreen } = await import("../js/ui/screens/account/authQrSignInScreen.js");
const { ServerConnectionScreen } =
  await import("../js/ui/screens/account/serverConnectionScreen.js");
const { SyncCodeScreen } = await import("../js/ui/screens/account/syncCodeScreen.js");
const { LibraryScreen } = await import("../js/ui/screens/library/libraryScreen.js");
const { ProfileSelectionScreen } = await import("../js/core/profile/profileSelectionScreen.js");

// Replay the actual Shared Addons and Plugins handlers and focus navigation.
for (const base of [SharedPluginScreen, PluginsScreen]) {
  const h = createTextInputHarness();
  h.attachGlobals();
  const plugin = base === PluginsScreen;
  const classes = plugin ? ["focusable", "plugins-focusable"] : ["focusable"];
  const input = h.node("INPUT", {
    type: "url",
    classes,
    dataset: { index: "0", action: "repository-input", focusKey: "add:input" }
  });
  const button = h.node("BUTTON", {
    classes,
    dataset: { index: "1", action: "install", focusKey: "add:submit" }
  });
  const actions = [];
  const screen = {
    ...base,
    container: h.container,
    addDraft: "",
    url: "",
    eventsBound: false,
    activateTarget: async (node) => actions.push([node.dataset.action, screen.addDraft]),
    activate: async (node) => actions.push([node.dataset.action, screen.url])
  };
  if (plugin) screen.bindEvents();
  else {
    input.addEventListener("input", (event) => {
      screen.url = event.target.value;
    });
    button.addEventListener("click", () => void screen.activate(button));
  }
  input.focus();
  input.classList.add("focused");
  input.classList.remove("focused");
  button.classList.add("focused");
  await screen.onKeyDown(h.key(13, input));
  assert.deepEqual(actions, [], "Native Enter must win over a stale visual Install focus");
  for (const code of [37, 39, 8]) {
    const event = h.key(code, document.body);
    await screen.onKeyDown(event);
    assert.equal(event.defaultPrevented, false, `Native Addon URL key ${code}`);
    assert.equal(document.activeElement, input);
  }
  input.classList.add("focused");
  button.classList.remove("focused");
  input.value = "https://addon.example/manifest.json";
  // Close before the first polling tick: capture must flush the draft first.
  await screen.onKeyDown(h.key(40, input));
  assert.equal(document.activeElement, button, "Down exits the URL editor and focuses its action");
  assert.equal(h.timers.size, 0);
  await screen.onKeyDown(h.key(13, button));
  assert.deepEqual(
    actions,
    [["install", "https://addon.example/manifest.json"]],
    "Install gets the final silent URL exactly once"
  );

  // A keyboard commit leaves the visual field focus usable for navigation.
  button.classList.remove("focused");
  input.classList.add("focused");
  input.focus();
  input.value = "https://second.example/manifest.json";
  h.native("change", input);
  await screen.onKeyDown(h.key(39, document.body));
  assert.equal(document.activeElement, button, "Right after commit returns to UI navigation");
  assert.equal(h.timers.size, 0);
}

// The actual Settings editor must preserve native Enter instead of submitting.
{
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node("INPUT", { dataset: { textDialogRole: "field" } });
  const button = h.node("BUTTON");
  const screen = {
    ...SettingsScreen,
    container: h.container,
    textDialog: { draft: "", multiline: false },
    dialogFocusIndex: 0,
    getTextDialogMaxFocusIndex: () => 2,
    applyFocus() {
      input.classList.remove("focused");
      button.classList.add("focused");
      button.focus();
    },
    submitTextDialog() {
      throw new Error("Native Enter submitted Settings");
    }
  };
  screen.bindTextDialogEvents();
  input.focus();
  for (const code of [13, 37, 39, 8]) await screen.onKeyDown(h.key(code));
  input.value = "silent settings value";
  await screen.onKeyDown(h.key(40));
  assert.equal(screen.textDialog.draft, "silent settings value");
  assert.equal(screen.dialogFocusIndex, 1);
  assert.equal(document.activeElement, button);
}

// All other editable screens share the same central policy, including inputs
// whose local handlers would otherwise navigate or submit on OK.
for (const [name, base] of [
  ["Search", SearchScreen],
  ["Login", AuthQrSignInScreen],
  ["Server connection", ServerConnectionScreen],
  ["Sync code", SyncCodeScreen],
  ["Library", LibraryScreen],
  ["Profile name", ProfileSelectionScreen]
]) {
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node("INPUT", {
    id: "searchInput",
    type: base === AuthQrSignInScreen ? "password" : "text"
  });
  const screen = { ...base, container: h.container, textDialog: true, mode: "input" };
  input.focus();
  for (const code of [13, 37, 39, 8]) {
    const event = h.key(code, document.body);
    await screen.onKeyDown(event);
    assert.equal(event.defaultPrevented, false, `Native key ${code} in ${name}`);
    assert.equal(document.activeElement, input);
  }
}

// Search's DOM Enter listener must also be protected, not just onKeyDown.
{
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node("INPUT", { id: "searchInput", type: "search" });
  const screen = {
    ...SearchScreen,
    container: h.container,
    cancelScheduledInputSearch() {},
    runSearchFromInput() {
      throw new Error("Native Enter submitted search");
    },
    scheduleSearchFromInput() {},
    focusNode() {}
  };
  screen.bindSearchInputEvents();
  input.focus();
  const focus = {
    ...FocusEngine,
    activeKeyDownStartedAt: new Map(),
    activeBackKeyIdentities: new Set(),
    nativeTextKeyIdentities: new Set()
  };
  Router.getCurrentScreen = () => screen;
  document.addEventListener("keydown", (event) => focus.handleKey(event), true);
  const enter = h.dispatch(h.key(13, input), input);
  assert.equal(enter.defaultPrevented, false);
  input.value = "silent search";
  h.poll();
  assert.equal(screen.query, "silent search");
}

// Tizen/webOS retain their existing native directional handling. Browser
// remains outside that contract; webOS's visibility event stays LG-only.
for (const [name, visible, expected] of [
  ["tizen", false, true],
  ["webos", true, true],
  ["webos", false, false],
  ["browser", true, false],
  ["vidaa", false, true]
]) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  const h = createTextInputHarness();
  h.attachGlobals();
  const input = h.node();
  input.focus();
  const screen = { ...PluginsScreen, container: h.container, keyboardVisible: visible };
  assert.equal(screen.isNativeTextInputEditingActive(), expected, `${name} native editor policy`);
  assert.equal(Platform.usesNativeTextInput(), name !== "browser");
}
console.log(
  "VIDAA Addon/UI input checks passed: final URL, real screen handlers, Settings, search, account, library and TV regression policies."
);
