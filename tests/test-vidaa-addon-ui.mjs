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

console.log("VIDAA shared Addons visual-system regressions passed.");
