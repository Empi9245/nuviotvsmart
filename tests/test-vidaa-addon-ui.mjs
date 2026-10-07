import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const screen = await readFile(
  new URL("../js/ui/screens/plugin/sharedPluginScreen.js", import.meta.url),
  "utf8"
);
const styles = await readFile(new URL("../css/components-28.css", import.meta.url), "utf8");

assert.match(
  screen,
  /class="addons-shell addons-route-shell"/,
  "Shared Addons must mount inside the same themed shell as upstream Addons"
);
assert.match(screen, /addons-install-card addons-shared-card/);
assert.match(screen, /addons-installed-card/);
assert.match(screen, /addons-action-btn addons-remove-btn focusable/);
assert.match(screen, /addons-shared-utility-row/);
assert.match(screen, /addons-feedback/);
assert.match(
  styles,
  /\.addons-shared-card[\s\S]*border:\s*1px solid var\(--addons-border\)/,
  "Shared Addons cards must use the Nuvio Addons surface tokens"
);
assert.match(styles, /\.addons-install-primary/);
assert.match(styles, /\.addons-shared-utility-btn/);
assert.match(
  screen,
  /id="shared-addon-url"[\s\S]{0,220}type="url"/,
  "Shared Addons must keep a native URL input for VIDAA keyboard editing"
);
assert.match(
  screen,
  /Platform\.shouldPreserveTextInputKey\(event\)/,
  "Shared Addons must route VIDAA-owned editor keys through Platform"
);
assert.match(
  screen,
  /inputFocused && \(code === 38 \|\| code === 40\)[\s\S]{0,120}document\.activeElement\?\.blur/,
  "Up/down must leave the Addon URL editor and return D-pad control to the UI"
);

console.log("VIDAA shared Addons visual and input regressions passed.");
