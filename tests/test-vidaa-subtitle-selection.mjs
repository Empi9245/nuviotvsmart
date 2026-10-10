import assert from "node:assert/strict";
import { getAddonSubtitleIdentity } from "../js/core/player/subtitleSelectionIdentity.js";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.location = { search: "" };
globalThis.document = { getElementById: () => null, documentElement: {} };

const { PlayerScreen } = await import("../js/ui/screens/player/playerScreen.js");
const { PlayerController } = await import("../js/core/player/playerController.js");

const subtitles = [
  {
    id: "eng",
    lang: "eng",
    addonName: "OpenSubtitles",
    url: "https://subtitles.example/first.vtt"
  },
  {
    id: "eng",
    lang: "eng",
    addonName: "OpenSubtitles",
    url: "https://subtitles.example/second.vtt"
  },
  { id: "eng", lang: "ita", addonName: "Another addon", url: "https://subtitles.example/first.vtt" }
];

function screen(items = subtitles, selected = items[1]) {
  const ui = {
    ...PlayerScreen,
    subtitles: items,
    selectedAddonSubtitleId: selected?.id || null,
    selectedAddonSubtitleIdentity: getAddonSubtitleIdentity(selected),
    selectedSubtitleTrackIndex: -1,
    selectedEmbeddedSubtitleTrackIndex: -1,
    selectedManifestSubtitleTrackId: null,
    manifestSubtitleTracks: [],
    embeddedSubtitleTracks: [],
    subtitleDialogVisible: false,
    getTextTracks: () => [],
    resolveBuiltInSubtitleBoundary: () => 0,
    dedupeBuiltInSubtitleTracks: (tracks) => tracks,
    shouldUseEmbeddedSubtitleTracks: () => false,
    isCurrentSourceAdaptiveManifest: () => false,
    getStartupPreferredSubtitleLanguageTargets: () => []
  };
  ui.invalidateTrackDialogCaches();
  return ui;
}

const ui = screen();
const selectedEntries = ui.getSubtitleEntries("addons").filter((entry) => entry.selected);
assert.equal(
  selectedEntries.length,
  1,
  "Shared addon ids must select only one subtitle URL/provider"
);
assert.equal(selectedEntries[0].track.url, subtitles[1].url);
assert.equal(
  ui.getSelectedAddonSubtitle(),
  subtitles[1],
  "Timing must use the selected URL, not the first matching addon id"
);

const options = ui.collectSubtitleOptionItems();
assert.equal(options.filter((option) => option.selected).length, 1);
assert.equal(
  new Set(options.map((option) => option.id)).size,
  options.length,
  "Focus ids must identify the full subtitle"
);
assert.equal(ui.getSubtitleLanguageRailItems().filter((language) => language.selected).length, 1);
const markup = options
  .map((option, index) => ui.renderSubtitleOptionItemMarkup(option, index, option.id))
  .join("");
assert.equal(
  (markup.match(/&#10003;/g) || []).length,
  1,
  "The dialog must render exactly one checkmark"
);

const reordered = screen([subtitles[2], subtitles[1], subtitles[0]]);
assert.equal(
  reordered.getSelectedAddonSubtitle(),
  subtitles[1],
  "Discovery reordering must retain the exact selection"
);

const providers = [subtitles[0], { ...subtitles[0], addonName: "Another addon" }];
const differentProvider = screen(providers, providers[1]);
assert.equal(
  differentProvider.getSubtitleEntries("addons").filter((entry) => entry.selected).length,
  1
);
assert.equal(
  differentProvider.getSelectedAddonSubtitle(),
  providers[1],
  "A shared URL must still resolve the chosen provider"
);

const duplicate = screen([subtitles[0], { ...subtitles[0] }], subtitles[0]);
assert.equal(
  duplicate.getSubtitleEntries("addons").length,
  1,
  "Duplicate responses must produce one selectable row"
);

const legacy = screen();
legacy.selectedAddonSubtitleIdentity = null;
assert.equal(
  legacy.getSelectedAddonSubtitle(),
  null,
  "A legacy shared id must not silently choose an arbitrary subtitle"
);
assert.equal(legacy.getSubtitleEntries("addons").filter((entry) => entry.selected).length, 0);
legacy.subtitles = [subtitles[1]];
assert.equal(
  legacy.getSelectedAddonSubtitle(),
  subtitles[1],
  "Unique legacy ids remain compatible"
);

ui.setSelectedAddonSubtitle(subtitles[2], 2);
ui.invalidateTrackDialogCaches();
assert.equal(
  ui.selectedAddonSubtitleId,
  subtitles[2].id,
  "Keep the addon protocol id for existing backends"
);
assert.equal(ui.getSelectedAddonSubtitle(), subtitles[2]);
ui.requestedSubtitleEntry = { fallbackAddonSubtitle: true, track: subtitles[0] };
assert.equal(
  ui.getSelectedAddonSubtitle(),
  subtitles[2],
  "An unconfirmed request must not change the committed identity"
);

const firstTrackKey = ui.getActiveSubtitleSelectionKey();
ui.setSelectedAddonSubtitle(subtitles[0]);
assert.notEqual(
  ui.getActiveSubtitleSelectionKey(),
  firstTrackKey,
  "Timing reset keys must distinguish tracks sharing an addon id"
);
assert.notEqual(
  ui.getSubtitleAutoSyncTrackKey(subtitles[0]),
  ui.getSubtitleAutoSyncTrackKey(providers[1])
);
ui.setSelectedAddonSubtitle(null);
assert.equal(ui.getSelectedAddonSubtitle(), null);
assert.equal(ui.selectedAddonSubtitleIdentity, null);

const hidden = screen([], null);
hidden.externalTrackNodes = [];
hidden.selectedSubtitleTrackIndex = 0;
hidden.getTextTracks = () => [{ mode: "hidden" }, { mode: "disabled" }];
hidden.getAudioTracks = () => [];
hidden.syncTrackState();
assert.equal(
  hidden.selectedSubtitleTrackIndex,
  -1,
  "A loading/hidden native track must not be shown as selected"
);
hidden.getTextTracks = () => [{ mode: "hidden" }, { mode: "showing" }];
hidden.syncTrackState();
assert.equal(hidden.selectedSubtitleTrackIndex, 1);
hidden.selectedSubtitleTrackIndex = 0;
hidden.pendingNativeSubtitleSelection = { isCurrent: () => true };
hidden.syncTrackState();
assert.equal(
  hidden.selectedSubtitleTrackIndex,
  0,
  "A partial readback must not commit a pending target"
);
hidden.selectedSubtitleTrackIndex = -1;
hidden.syncTrackState();
assert.equal(
  hidden.selectedSubtitleTrackIndex,
  -1,
  "A pending first selection must preserve OFF until full confirmation"
);
hidden.pendingNativeSubtitleSelection = null;
hidden.getTextTracks = () => [{ mode: "hidden" }, { mode: "disabled" }];
hidden.syncTrackState();
assert.equal(
  hidden.selectedSubtitleTrackIndex,
  -1,
  "A failed pending selection with no output must clear its checkmark"
);

const refreshUi = screen([], null);
const refreshTracks = [{ mode: "showing" }, { mode: "disabled" }];
let queuedRefresh;
globalThis.requestAnimationFrame = (callback) => {
  queuedRefresh = callback;
};
PlayerController.video = { src: "fixture-video" };
PlayerController.playRequestToken = 1;
Object.assign(refreshUi, {
  externalTrackNodes: [],
  playerMountToken: 1,
  subtitleSelectionToken: 1,
  selectedSubtitleTrackIndex: 0,
  getTextTracks: () => refreshTracks,
  getSubtitleCueTrackList: () => refreshTracks,
  getAudioTracks: () => []
});
refreshUi.refreshSubtitleTrackRendering();
assert.equal(refreshTracks[0].mode, "hidden");
refreshUi.syncTrackState();
assert.equal(
  refreshUi.selectedSubtitleTrackIndex,
  0,
  "A current queued style refresh must preserve the committed selection"
);
queuedRefresh();
assert.equal(refreshTracks[0].mode, "showing");
refreshUi.refreshSubtitleTrackRendering();
PlayerController.video.src = "replaced-video";
refreshUi.syncTrackState();
assert.equal(
  refreshUi.selectedSubtitleTrackIndex,
  -1,
  "A replaced source must retire the queued refresh selection"
);
queuedRefresh();
assert.equal(
  refreshTracks[0].mode,
  "hidden",
  "A stale queued refresh must not re-enable its old track"
);

console.log("Subtitle selection identity tests passed");
