import assert from "node:assert/strict";

const {
  normalizeAudioDelayLanguage,
  clampStreamAudioDelayMs,
  readStreamAudioDelayHints,
  resolveStreamAudioDelayMs,
  resolveStreamSubtitleOffsetMs
} = await import("../js/core/player/streamAudioDelay.js");

let checks = 0;

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

await check("language normalization matches the Android contract", () => {
  assert.equal(normalizeAudioDelayLanguage("it"), "it");
  assert.equal(normalizeAudioDelayLanguage("ita"), "it");
  assert.equal(normalizeAudioDelayLanguage("Italian"), "it");
  assert.equal(normalizeAudioDelayLanguage("es"), "es");
  assert.equal(normalizeAudioDelayLanguage("spa"), "es");
  // es-419 must never collapse into es (PR #4027).
  assert.equal(normalizeAudioDelayLanguage("es-419"), "es-419");
  assert.equal(normalizeAudioDelayLanguage("es_419"), "es-419");
  assert.equal(normalizeAudioDelayLanguage(""), "");
});

await check("delay hints clamp to the Android +-60 s range", () => {
  assert.equal(clampStreamAudioDelayMs(1250), 1250);
  assert.equal(clampStreamAudioDelayMs(-400), -400);
  assert.equal(clampStreamAudioDelayMs(120000), 60000);
  assert.equal(clampStreamAudioDelayMs(-90000), -60000);
  assert.equal(clampStreamAudioDelayMs("abc"), 0);
  const hints = readStreamAudioDelayHints({ audioDelayMs: "2500", audioDelayLanguage: "ITA" });
  assert.equal(hints.audioDelayMs, 2500);
  assert.equal(hints.audioDelayLanguage, "it");
  assert.equal(readStreamAudioDelayHints({}), null);
  assert.equal(readStreamAudioDelayHints(null), null);
  assert.equal(readStreamAudioDelayHints({ audioDelayMs: "late" }), null);
});

await check("stream delay applies per language only with audioDelayLanguage", () => {
  const scoped = { audioDelayMs: 1250, audioDelayLanguage: "it" };
  assert.equal(resolveStreamAudioDelayMs(scoped, "it"), 1250);
  assert.equal(resolveStreamAudioDelayMs(scoped, "ita"), 1250);
  assert.equal(resolveStreamAudioDelayMs(scoped, "en"), 0);
  assert.equal(resolveStreamAudioDelayMs(scoped, ""), 0);
  // Without the language hint the delay applies to every track (#3781).
  assert.equal(resolveStreamAudioDelayMs({ audioDelayMs: -400 }, "en"), -400);
  assert.equal(resolveStreamAudioDelayMs({ audioDelayMs: 0 }, "it"), 0);
  assert.equal(resolveStreamAudioDelayMs(null, "it"), 0);
});

await check("subtitle offset only shifts embedded subs in the scoped language", () => {
  const scoped = { audioDelayMs: 1250, audioDelayLanguage: "it" };
  assert.equal(resolveStreamSubtitleOffsetMs(scoped, "it"), 1250);
  assert.equal(resolveStreamSubtitleOffsetMs(scoped, "en"), 0);
  // Addon/external subtitles are never shifted (#4027).
  assert.equal(resolveStreamSubtitleOffsetMs(scoped, "it", { embedded: false }), 0);
  // Without the language hint the offset follows the stream delay.
  assert.equal(resolveStreamSubtitleOffsetMs({ audioDelayMs: -400 }, "en"), -400);
});

await check("plugin results keep their behaviorHints alongside request headers", async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(String(key)) ?? null,
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: (key) => storage.delete(String(key))
  };
  globalThis.__NUVIO_PLATFORM__ = "vidaa";
  globalThis.Worker = class {};
  const { resultToStream } = await import("../js/core/player/pluginManager.js");
  const mapped = resultToStream(
    {
      url: "https://provider.example/master.m3u8",
      name: "DualSync",
      title: "1080p",
      headers: { Referer: "https://provider.example/" },
      behaviorHints: { audioDelayMs: 75, audioDelayLanguage: "it", bingeGroup: "keep-me" }
    },
    { name: "DualSync" }
  );
  assert.equal(mapped.behaviorHints.audioDelayMs, 75);
  assert.equal(mapped.behaviorHints.audioDelayLanguage, "it");
  assert.equal(mapped.behaviorHints.bingeGroup, "keep-me");
  assert.deepEqual(mapped.behaviorHints.proxyHeaders.request, {
    Referer: "https://provider.example/"
  });
  assert.equal(resolveStreamAudioDelayMs(mapped.behaviorHints, "it"), 75);
  assert.equal(resolveStreamAudioDelayMs(mapped.behaviorHints, "en"), 0);
});

console.log(`Stream audio delay contract: ${checks} checks passed`);
