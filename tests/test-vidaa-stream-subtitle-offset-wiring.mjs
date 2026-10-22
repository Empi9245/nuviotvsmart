// Wiring contract for the PR #4027 subtitle offset port: every point that
// applies the subtitle delay must route through the effective-delay getters
// (user delay + stream source offset for embedded tracks in the scoped
// language), while addon/external subtitles and persistence keep the plain
// user delay. Read-level assertions keep the application points uniform and
// make a half-port fail loudly.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

let checks = 0;

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

const methods74 = read("js/ui/screens/player/playerScreenMethods-74-stream-subtitle-delay.js");

await check("methods-74 exposes one effective-delay surface built on the Android contract", () => {
  assert.match(
    methods74,
    /import \{[^}]*resolveEffectiveSubtitleDelayMs[^}]*\} from "\.\.\/\.\.\/\.\.\/core\/player\/streamAudioDelay\.js"/
  );
  for (const getter of [
    "getStreamAudioDelayHints",
    "getActiveSubtitleDelayContext",
    "getSubtitleDelayMsForContext",
    "getActiveSubtitleDelayMs",
    "getEmbeddedSubtitleDelayMs",
    "getAssSubtitleDelayMs",
    "getSubtitleCueDelayMsForTrack"
  ]) {
    assert.match(methods74, new RegExp(`\\b${getter}\\(`), `missing ${getter}`);
  }
  // Addon/external subtitles are never shifted.
  assert.match(methods74, /selectedAddonSubtitleId[\s\S]{0,120}embedded: false/);
});

const methods43 = read("js/ui/screens/player/playerScreenMethods-43-get-ass-subtitle-container.js");

await check("ASS renderer captures its source context and applies the effective delay", () => {
  assert.match(
    methods43,
    /this\.assSubtitleDelayContext = delayContext \|\| \{ embedded: false, language: "" \}/
  );
  assert.match(methods43, /renderer\.setDelay\(this\.getAssSubtitleDelayMs\(\)\)/);
  assert.doesNotMatch(methods43, /renderer\.setDelay\(this\.subtitleDelayMs\)/);
});

await check("ASS delay re-application points all use the effective delay", () => {
  for (const file of [
    "js/ui/screens/player/playerScreenMethods-53-render-subtitle-style-control-in-place.js",
    "js/ui/screens/player/playerScreenMethods-57-render-subtitle-delay-overlay.js",
    "js/ui/screens/player/playerScreenMethods-58-capture-subtitle-auto-sync-time.js"
  ]) {
    const source = read(file);
    assert.match(
      source,
      /assSubtitleRenderer\?\.setDelay\(this\.getAssSubtitleDelayMs\(\)\)/,
      file
    );
    assert.doesNotMatch(
      source,
      /assSubtitleRenderer\?\.setDelay\((this\.subtitleDelayMs|newDelayMs)\)/,
      file
    );
  }
});

await check("native cue timing, embedded windows and the HTML overlay use the scoped delay", () => {
  const cueStyles = read(
    "js/ui/screens/player/playerScreenMethods-26-copy-subtitle-cue-presentation.js"
  );
  assert.match(
    cueStyles,
    /applySubtitleCueDelay\(cue, snapshot, this\.getSubtitleCueDelayMsForTrack\(track\)\)/
  );
  assert.doesNotMatch(cueStyles, /applySubtitleCueDelay\(cue, snapshot, this\.subtitleDelayMs\)/);

  const webOsEmbedded = read(
    "js/ui/screens/player/playerScreenMethods-44-load-web-os-embedded-text-subtitle-window.js"
  );
  assert.match(webOsEmbedded, /delayContext: this\.getEmbeddedSubtitleDelayContext\(track\)/);
  assert.match(webOsEmbedded, /this\.getEmbeddedSubtitleDelayMs\(track\) \/ 1000/);

  const bitmap = read("js/ui/screens/player/playerScreenMethods-45-load-bitmap-subtitle-window.js");
  assert.match(bitmap, /this\.getEmbeddedSubtitleDelayMs\(track\) \/ 1000/);
  assert.match(bitmap, /const delaySeconds = this\.getActiveSubtitleDelayMs\(\) \/ 1000/);

  const vidaaAdapter = read("js/ui/screens/player/vidaaEmbeddedTextAdapter.js");
  assert.match(vidaaAdapter, /this\.getEmbeddedSubtitleDelayMs\(track\) \/ 1000/);
});

await check("addon ASS bodies and AVPlay external subtitles keep the plain user delay", () => {
  for (const file of [
    "js/ui/screens/player/playerScreenMethods-46-schedule-html-subtitle-overlay-render.js",
    "js/ui/screens/player/playerScreenMethods-55-apply-fallback-addon-subtitle.js"
  ]) {
    const source = read(file);
    const call = source.match(/applyAssSubtitleBody\(\{[^}]*\}\)/s);
    assert.ok(call, file);
    assert.doesNotMatch(call[0], /delayContext/, `${file} must not scope addon bodies`);
  }

  const avPlayExternal = read(
    "js/ui/screens/player/playerScreenMethods-24-open-next-episode-stream-picker.js"
  );
  assert.match(avPlayExternal, /setAvPlayExternalSubtitleDelay\?\.\(this\.subtitleDelayMs\)/);
});

await check("the stream offset is never persisted with the user's subtitle delay", () => {
  const options = read(
    "js/ui/screens/player/playerScreenMethods-56-render-subtitle-options-markup.js"
  );
  assert.match(options, /SubtitleDelayPreferencesStore\.set\(videoId, this\.subtitleDelayMs\)/);
  assert.doesNotMatch(
    options,
    /SubtitleDelayPreferencesStore\.set\(videoId, this\.get\w*SubtitleDelayMs/
  );
});

console.log(`Stream subtitle offset wiring: ${checks} checks passed`);
