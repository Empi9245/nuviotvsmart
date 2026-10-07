import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyWebPlaybackHeaders,
  createWebPlaybackHeaderDiagnosticSnapshot,
  getStandaloneWebPlaybackCompatibility
} from "../js/core/player/webPlaybackHeaders.js";

function names(result) {
  return {
    forwardable: Object.keys(result.forwardableHeaders),
    restricted: result.restrictedHeaderNames
  };
}

// 1. Authorization can be forwarded by browser request APIs.
assert.deepEqual(names(classifyWebPlaybackHeaders({ Authorization: "Bearer example" })), {
  forwardable: ["Authorization"],
  restricted: []
});

// 2. Cookie is controlled by the browser.
assert.deepEqual(names(classifyWebPlaybackHeaders({ Cookie: "session=abc" })), {
  forwardable: [],
  restricted: ["Cookie"]
});

// 3. Referer is intentionally treated as browser-controlled for VIDAA playback.
assert.deepEqual(names(classifyWebPlaybackHeaders({ Referer: "https://example.com" })), {
  forwardable: [],
  restricted: ["Referer"]
});

// 4. Custom headers are not rejected by a rigid whitelist.
assert.deepEqual(names(classifyWebPlaybackHeaders({ "X-Custom-Header": "123", Accept: "video/*" })), {
  forwardable: ["X-Custom-Header", "Accept"],
  restricted: []
});

for (const restrictedName of [
  "User-Agent",
  "Origin",
  "Host",
  "Content-Length",
  "Accept-Encoding",
  "Connection",
  "Sec-Fetch-Site",
  "Range"
]) {
  assert.deepEqual(
    classifyWebPlaybackHeaders({ [restrictedName]: "blocked-value" }).restrictedHeaderNames,
    [restrictedName],
    `${restrictedName} must be browser-restricted`
  );
}

// 5. Mixed declarations preserve safe headers and classify restricted names.
const mixed = classifyWebPlaybackHeaders({
  Authorization: "Bearer mixed-secret",
  Cookie: "session=mixed-cookie",
  Referer: "https://example.com/private",
  "X-Test": "mixed-value"
});
assert.deepEqual(Object.keys(mixed.forwardableHeaders), ["Authorization", "X-Test"]);
assert.deepEqual(mixed.restrictedHeaderNames, ["Cookie", "Referer"]);

// 6. Restricted headers alone never block a web-ready stream before playback.
const directAttempt = getStandaloneWebPlaybackCompatibility({ Cookie: "session=abc" }, false);
assert.equal(directAttempt.compatible, true);
assert.equal(directAttempt.standaloneCompatibility, "direct playback attempt allowed");

// 7. notWebReady + a browser-restricted requirement is unsupported standalone.
const unsupported = getStandaloneWebPlaybackCompatibility({ Cookie: "session=abc" }, true);
assert.equal(unsupported.compatible, false);
assert.equal(unsupported.standaloneCompatibility, "unsupported standalone web stream");

// 8. Diagnostics expose names only, never request-header values.
const diagnostic = createWebPlaybackHeaderDiagnosticSnapshot(
  {
    Authorization: "Bearer super-secret",
    Cookie: "session=top-secret",
    "X-Test": "api-key-value"
  },
  { notWebReady: true, playbackEngine: "hls.js" }
);
assert.deepEqual(diagnostic.declaredHeaderNames, ["Authorization", "Cookie", "X-Test"]);
assert.deepEqual(diagnostic.forwardedHeaderNames, ["Authorization", "X-Test"]);
assert.deepEqual(diagnostic.restrictedHeaderNames, ["Cookie"]);
const diagnosticText = JSON.stringify(diagnostic);
for (const secret of ["Bearer super-secret", "session=top-secret", "api-key-value"]) {
  assert.equal(diagnosticText.includes(secret), false, "Diagnostics must never contain header values");
}

// Guard the existing shared hls.js path: both loaders receive normalized headers.
const hlsSource = await readFile(
  new URL("../js/core/player/playerControllerMethods-13-resolve-remote-media-source-type.js", import.meta.url),
  "utf8"
);
assert.match(hlsSource, /const forwardedHeaders = this\.normalizePlaybackHeaders\(requestHeaders\)/);
assert.match(hlsSource, /xhrSetup:/);
assert.match(hlsSource, /fetchSetup:/);

// VIDAA may prefer hls.js only when browser-safe HLS headers actually need forwarding.
const playSource = await readFile(
  new URL("../js/core/player/playerControllerMethods-18-play.js", import.meta.url),
  "utf8"
);
assert.match(playSource, /vidaaHlsNeedsBrowserHeaderForwarding/);
assert.match(playSource, /preferredEngine = "hls\.js"/);
assert.doesNotMatch(playSource, /VidaaPlaybackProxy/);

// The standalone incompatibility path is explicit and happens before controller playback.
const screenSource = await readFile(
  new URL("../js/ui/screens/player/playerScreenMethods-18-start-player-controller-playback.js", import.meta.url),
  "utf8"
);
assert.match(screenSource, /reason: "vidaa-standalone-incompatible"/);

const compatibilitySource = await readFile(
  new URL("../js/ui/screens/player/playerScreenMethods-17-get-web-header-restricted-stream-message.js", import.meta.url),
  "utf8"
);
assert.match(compatibilitySource, /if \(!Environment\.isVidaa\(\)\)/);
assert.match(compatibilitySource, /player_error_web_headers_unsupported/);
assert.match(compatibilitySource, /player_error_vidaa_standalone_unsupported/);

console.log("VIDAA playback header checks passed.");
