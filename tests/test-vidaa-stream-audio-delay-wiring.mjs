// Wiring contract for the stream audio delay (the dual-element counterpart of
// the PR #4027 subtitle offset port): every engagement point must route
// through the effective-delay getters, the engine must only run while the
// scoped audio can be played by the dual element, and the delay is never
// persisted. Read-level assertions keep the application points uniform and
// make a half-wiring fail loudly.
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

const methods75 = read("js/ui/screens/player/playerScreenMethods-75-apply-stream-audio-delay.js");

await check("methods-75 resolves the effective delay through the Android contract", () => {
  assert.match(
    methods75,
    /import \{[^}]*resolveStreamAudioDelayMs[^}]*\} from "\.\.\/\.\.\/\.\.\/core\/player\/streamAudioDelay\.js"/
  );
  assert.match(
    methods75,
    /import \{[^}]*createStreamAudioDelayEngine[^}]*\} from "\.\.\/\.\.\/\.\.\/core\/player\/streamAudioDelayEngine\.js"/
  );
  assert.match(
    methods75,
    /resolveStreamAudioDelayMs\(this\.getStreamAudioDelayHints\(\), this\.getSelectedAudioDelayLanguage\(\)/
  );
  for (const getter of [
    "getSelectedAudioDelayTrack",
    "getSelectedAudioDelayLanguage",
    "getEffectiveStreamAudioDelayMs",
    "resolveStreamAudioDelayAudioSource",
    "attachStreamAudioDelayAudioSource",
    "syncStreamAudioDelayEngine",
    "teardownStreamAudioDelayEngine",
    "bindStreamAudioDelayEngineLifecycle"
  ]) {
    assert.match(methods75, new RegExp(`\\b${getter}\\(`), `missing ${getter}`);
  }
});

await check("the engine only engages for a non-zero scoped delay with a resolvable source", () => {
  // Delay 0 (out-of-scope track, e.g. the original audio) must tear down.
  assert.match(
    methods75,
    /if \(!delayMs \|\| !source \|\| !video\) \{[\s\S]{0,80}teardownStreamAudioDelayEngine/
  );
  // Sources: the hls.js audio rendition first, then any track URL.
  assert.match(methods75, /return \{ kind: "hls", url, track \}/);
  assert.match(methods75, /return url \? \{ kind: "file", url, track: selected \} : null/);
  // An unloadable source aborts instead of half-engaging.
  assert.match(methods75, /if \(!disposeSource\) \{[\s\S]{0,120}return false/);
});

await check("the dual element silences the video audio and restores the mute state", () => {
  assert.match(methods75, /previousVideoMuted: Boolean\(video\.muted\)/);
  assert.match(methods75, /video\.muted = true/);
  assert.match(methods75, /if \(state\.video\) state\.video\.muted = state\.previousVideoMuted/);
});

await check("the stream delay is never persisted and never touches user preferences", () => {
  assert.doesNotMatch(methods75, /PreferencesStore|localStorage|persist/i);
});

const engine = read("js/core/player/streamAudioDelayEngine.js");

await check("the engine applies the contract's signed convention", () => {
  // Positive delay → scoped audio plays LATER: target = video - delay.
  assert.match(engine, /return safeVideoTime - clampStreamAudioDelayMs\(delayMs\) \/ 1000/);
  assert.match(engine, /import \{ clampStreamAudioDelayMs \} from "\.\/streamAudioDelay\.js"/);
});

const mount = read("js/ui/screens/player/playerScreenMethods-01-mount.js");

await check("mount binds the engine lifecycle after the video events", () => {
  assert.match(
    mount,
    /this\.bindVideoEvents\(\);[\s\S]{0,80}this\.bindStreamAudioDelayEngineLifecycle\(\);/
  );
});

const playByUrl = read("js/ui/screens/player/playerScreenMethods-34-play-stream-by-url.js");

await check("resetSourceTrackState tears the engine down with the old source", () => {
  assert.match(playByUrl, /this\.teardownStreamAudioDelayEngine\(\);/);
});

const methods61 = read("js/ui/screens/player/playerScreenMethods-61-apply-audio-track.js");

await check("audio track changes re-resolve the engine scope", () => {
  assert.match(methods61, /this\.renderAudioDialog\(\);\s*this\.syncStreamAudioDelayEngine\(\);/);
});

const playerScreen = read("js/ui/screens/player/playerScreen.js");

await check("playerScreen registers methods-75", () => {
  assert.match(
    playerScreen,
    /import \{ createPlayerScreenMethods75 \} from "\.\/playerScreenMethods-75-apply-stream-audio-delay\.js"/
  );
  assert.match(playerScreen, /\.\.\.createPlayerScreenMethods75\(\),/);
});

console.log(`Stream audio delay wiring: ${checks} checks passed`);
