import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldPreserveVidaaTextInputKey } from "../js/platform/vidaa/vidaaKeyboard.js";
import { Platform } from "../js/platform/index.js";

const input = { tagName: "INPUT", type: "text" };
const textarea = { tagName: "TEXTAREA" };
const checkbox = { tagName: "INPUT", type: "checkbox" };
const editable = { tagName: "DIV", isContentEditable: true };
const div = { tagName: "DIV" };

function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}

globalThis.document = { activeElement: null };

for (const code of [13, 37, 39]) {
  assert.equal(
    shouldPreserveVidaaTextInputKey({ keyCode: code, target: input }, { activeElement: null }),
    true,
    `VIDAA text input key ${code} must remain native`
  );
}
assert.equal(
  shouldPreserveVidaaTextInputKey({ keyCode: 38, target: input }, { activeElement: null }),
  false,
  "Up/down remain available to Nuvio focus navigation"
);
assert.equal(
  shouldPreserveVidaaTextInputKey({ keyCode: 13, target: checkbox }, { activeElement: null }),
  false,
  "Non-text inputs keep app activation"
);
assert.equal(
  shouldPreserveVidaaTextInputKey({ keyCode: 13, target: div }, { activeElement: textarea }),
  true,
  "Firmware events targeting an outer surface still preserve the active editor"
);

assert.equal(
  shouldPreserveVidaaTextInputKey({ keyCode: 37, target: editable }, { activeElement: null }),
  true,
  "contentEditable fields use the same VIDAA native editing policy"
);

platform("vidaa");
document.activeElement = input;
for (const code of [13, 37, 39]) {
  assert.equal(
    Platform.shouldPreserveTextInputKey({ keyCode: code, target: input }),
    true,
    `Platform must delegate VIDAA text key ${code} to the native editor`
  );
}
assert.equal(
  Platform.shouldPreserveTextInputKey({ keyCode: 40, target: input }),
  false,
  "VIDAA up/down stay available to the app focus graph"
);
assert.equal(
  Platform.isBackEvent({ keyCode: 8, target: input }),
  false,
  "VIDAA keyCode 8 inside an input is Backspace, not route Back"
);
document.activeElement = null;
assert.equal(
  Platform.isBackEvent({ keyCode: 8, target: div }),
  true,
  "VIDAA keyCode 8 outside an editor remains route Back"
);
for (const name of ["tizen", "webos", "browser"]) {
  platform(name);
  document.activeElement = input;
  assert.equal(
    Platform.shouldPreserveTextInputKey({ keyCode: 13, target: input }),
    false,
    `${name} retains its existing input routing`
  );
}
platform("vidaa");
document.activeElement = null;

const guardedFiles = [
  "../js/ui/screens/account/serverConnectionScreen.js",
  "../js/ui/screens/account/syncCodeScreen.js",
  "../js/ui/screens/search/searchScreenMethods-05-ensure-header-visible.js",
  "../js/ui/screens/search/searchScreenMethods-06-activate-action-node.js",
  "../js/ui/screens/plugin/pluginsScreenMethods-01-mount.js",
  "../js/ui/screens/plugin/pluginsScreenMethods-04-refresh-repository.js",
  "../js/ui/screens/plugin/sharedPluginScreen.js",
  "../js/ui/screens/account/authQrSignInScreenMethods-02-bind-controls.js",
  "../js/ui/screens/settings/settingsScreenMethods-14-activate-focused.js"
];

for (const relativePath of guardedFiles) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  assert.match(
    source,
    /Platform\.shouldPreserveTextInputKey\(event\)/,
    `${relativePath} must use the centralized native text-input policy`
  );
}

const focusEngineSource = await readFile(
  new URL("../js/ui/navigation/focusEngine.js", import.meta.url),
  "utf8"
);
assert.match(
  focusEngineSource,
  /Platform\.shouldPreserveTextInputKey\(normalizedEvent\)/,
  "The global focus engine must use the Platform text-input policy"
);

const settingsSource = await readFile(
  new URL("../js/ui/screens/settings/settingsScreenMethods-14-activate-focused.js", import.meta.url),
  "utf8"
);
assert.match(
  settingsSource,
  /this\.textDialog && Platform\.shouldPreserveTextInputKey\(event\)/,
  "Settings text dialogs must preserve VIDAA-owned editor keys before dialog navigation"
);

const sharedAddonSource = await readFile(
  new URL("../js/ui/screens/plugin/sharedPluginScreen.js", import.meta.url),
  "utf8"
);
assert.match(
  sharedAddonSource,
  /Platform\.shouldPreserveTextInputKey\(event\)/,
  "Addon URL editing must use the centralized VIDAA input policy"
);
assert.match(sharedAddonSource, /inputFocused && code === 13/);
assert.match(sharedAddonSource, /inputFocused && \(code === 37 \|\| code === 39\)/);
assert.match(
  sharedAddonSource,
  /inputFocused && \(code === 38 \|\| code === 40\)[\s\S]{0,120}document\.activeElement\?\.blur/,
  "Up/down must be able to leave the Addon URL field after native editing"
);

const pluginMountSource = await readFile(
  new URL("../js/ui/screens/plugin/pluginsScreenMethods-01-mount.js", import.meta.url),
  "utf8"
);
assert.match(
  pluginMountSource,
  /isNativeTextInputEditingActive\(event = null\)[\s\S]{0,300}Platform\.shouldPreserveTextInputKey\(event\)/,
  "Plugins must include VIDAA through the platform text-input policy before the legacy Tizen/webOS fallback"
);

console.log("VIDAA native text-input routing regressions passed.");
