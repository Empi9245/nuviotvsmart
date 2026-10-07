import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldPreserveVidaaTextInputKey } from "../js/platform/vidaa/vidaaKeyboard.js";

const input = { tagName: "INPUT", type: "text" };
const textarea = { tagName: "TEXTAREA" };
const checkbox = { tagName: "INPUT", type: "checkbox" };
const div = { tagName: "DIV" };

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

const guardedFiles = [
  "../js/ui/screens/account/serverConnectionScreen.js",
  "../js/ui/screens/account/syncCodeScreen.js",
  "../js/ui/screens/search/searchScreenMethods-05-ensure-header-visible.js",
  "../js/ui/screens/search/searchScreenMethods-06-activate-action-node.js",
  "../js/ui/screens/plugin/pluginsScreenMethods-04-refresh-repository.js",
  "../js/ui/screens/account/authQrSignInScreenMethods-02-bind-controls.js"
];

for (const relativePath of guardedFiles) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  assert.match(
    source,
    /shouldPreserveVidaaTextInputKey\(event\)/,
    `${relativePath} must preserve VIDAA native text-input keys`
  );
}

const focusEngineSource = await readFile(
  new URL("../js/ui/navigation/focusEngine.js", import.meta.url),
  "utf8"
);
assert.match(
  focusEngineSource,
  /shouldPreserveVidaaTextInputKey\(normalizedEvent\)/,
  "The global focus engine must use the shared VIDAA text-input rule"
);

const settingsSource = await readFile(
  new URL("../js/ui/screens/settings/settingsScreenMethods-14-activate-focused.js", import.meta.url),
  "utf8"
);
assert.match(
  settingsSource,
  /code === 13 && activeField[\s\S]{0,180}Platform\.isVidaa\(\)/,
  "Settings text dialogs must not submit a focused field on VIDAA OK"
);

const sharedAddonSource = await readFile(
  new URL("../js/ui/screens/plugin/sharedPluginScreen.js", import.meta.url),
  "utf8"
);
assert.match(sharedAddonSource, /inputFocused && code === 13/);
assert.match(sharedAddonSource, /inputFocused && \(code === 37 \|\| code === 39\)/);

console.log("VIDAA native text-input routing regressions passed.");
