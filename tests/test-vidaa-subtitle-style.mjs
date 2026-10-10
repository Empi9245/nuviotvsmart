import assert from "node:assert/strict";

globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, documentElement: {} };
const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { Platform } = await import("../js/platform/index.js");

function cssStyle() {
  const values = new Map();
  return {
    setProperty: (key, value) => values.set(key, value),
    removeProperty: (key) => values.delete(key),
    getPropertyValue: (key) => values.get(key) || ""
  };
}
const root = { style: cssStyle() };
const video = { style: cssStyle() };
Object.assign(PlayerController, { video, playbackEngine: "native", avplayActive: false });
const counts = { cues: 0, trackRefresh: 0, persisted: 0 };
const ui = {
  ...PlayerScreen,
  uiRefs: { root },
  subtitleDelayMs: 0,
  subtitleStyleSettings: {
    fontSize: 120,
    textColor: "#FFFFFF",
    textOpacity: 100,
    outlineColor: "#000000",
    outlineEnabled: true,
    backgroundColor: "#00000000",
    verticalOffset: 0
  },
  getSubtitleStyleControls: () =>
    [
      "backgroundColor",
      "fontSize",
      "textColor",
      "textOpacity",
      "bold",
      "outlineColor",
      "outlineEnabled",
      "delay",
      "verticalOffset"
    ].map((id) => ({ id })),
  schedulePersistPlayerPresentationSettings() {
    counts.persisted++;
  },
  persistSubtitleDelayPreference() {},
  renderSubtitleStyleControlInPlace: () => true,
  refreshSubtitleCueStyles() {
    counts.cues++;
  },
  refreshSubtitleTrackRendering() {
    counts.trackRefresh++;
  },
  renderBitmapSubtitleAtCurrentTime() {},
  isAssAddonSubtitleActive: () => false
};

assert.equal(ui.adjustSubtitleStyleControl("backgroundColor", 1), true);
assert.equal(
  root.style.getPropertyValue("--player-subtitle-background"),
  "rgba(179, 179, 179, 0.5)"
);
assert.equal(
  video.style.getPropertyValue("--player-subtitle-background"),
  "rgba(179, 179, 179, 0.5)"
);
assert.equal(counts.cues, 0, "Gray background must not rescan native subtitle cues");
assert.equal(
  counts.trackRefresh,
  0,
  "Gray background must not toggle native modes or create track events"
);
for (const id of ["fontSize", "textColor", "textOpacity", "bold", "outlineColor", "outlineEnabled"])
  ui.adjustSubtitleStyleControl(id, 1);
assert.equal(counts.cues, 0);
assert.equal(counts.trackRefresh, 0);
for (let index = 0; index < 50; index++)
  ui.adjustSubtitleStyleControl("backgroundColor", index % 2 ? -1 : 1, { isRepeat: true });
assert.equal(counts.cues, 0, "Repeated appearance edits remain CSS-only");
assert.equal(counts.trackRefresh, 0);
ui.adjustSubtitleStyleControl("delay", 1);
assert.equal(counts.cues, 1, "Native timing must still update when delay changes");
assert.equal(counts.trackRefresh, 1);
ui.adjustSubtitleStyleControl("verticalOffset", 1);
assert.equal(counts.cues, 2, "Native position must still update when offset changes");
assert.equal(counts.trackRefresh, 2);
globalThis.__NUVIO_PLATFORM__ = "tizen";
Platform.current = null;
ui.adjustSubtitleStyleControl("backgroundColor", 1);
assert.equal(counts.cues, 3, "Tizen native rendering keeps its existing refresh contract");
assert.equal(counts.trackRefresh, 3);
console.log(
  "PASS gray background and 57 appearance edits avoid native cue scans/mode switches; delay, offset and Tizen refresh remain active"
);
