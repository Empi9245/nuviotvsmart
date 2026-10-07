import { Platform } from "../../platform/index.js";

export const VIDAA_NAVIGATION_SETTLE_MS = 250;
const HELD_KEY_EXPIRY_MS = 1000;
const heldDirections = new Set();
let lastInputAt = Number.NEGATIVE_INFINITY;

function isDirection(keyCode) {
  return keyCode >= 37 && keyCode <= 40;
}

export function noteVidaaNavigationKeyDown(keyCode) {
  if (!Platform.isVidaa() || !isDirection(keyCode)) return;
  heldDirections.add(keyCode);
  lastInputAt = Date.now();
}

export function noteVidaaNavigationKeyUp(keyCode) {
  if (!Platform.isVidaa() || !heldDirections.delete(keyCode)) return;
  lastInputAt = Date.now();
}

export function isVidaaNavigationBusy({ quietMs = VIDAA_NAVIGATION_SETTLE_MS } = {}) {
  if (!Platform.isVidaa()) return false;
  const elapsed = Date.now() - lastInputAt;
  // A missed keyup (for example when the TV opens its own overlay) must not
  // leave artwork and metadata paused forever. Real holds renew on each repeat.
  return elapsed < quietMs || (heldDirections.size > 0 && elapsed < HELD_KEY_EXPIRY_MS);
}

export function resetVidaaNavigationActivity() {
  heldDirections.clear();
  lastInputAt = Number.NEGATIVE_INFINITY;
}
