import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key)
};
globalThis.__NUVIO_ENV__ = { TMDB_API_KEY: "test-tmdb-key" };

const { TmdbSettingsStore, normalizeTmdbLanguageCode } =
  await import("../js/data/local/tmdbSettingsStore.js");
const { TmdbMetadataService, selectBestLocalizedLogoPath, selectBestLocalizedImagePath } =
  await import("../js/core/tmdb/tmdbMetadataService.js");
const { fetchTmdbJson } = await import("../js/core/tmdb/tmdbTransport.js");
const { TmdbService } = await import("../js/core/tmdb/tmdbService.js");
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { Platform } = await import("../js/platform/index.js");
const originalFetch = globalThis.fetch;
const originalServiceFetch = PluginServiceClient.fetch;
const originalPlatform = Platform.current;
const apiUrl = "https://api.themoviedb.org/3/movie/99";

const italianDetails = {
  id: 99,
  title: "Titolo italiano",
  original_title: "English title",
  original_language: "en",
  overview: "Descrizione italiana del film.",
  poster_path: "/english-poster.jpg",
  backdrop_path: "/english-backdrop.jpg",
  images: {
    logos: [
      { file_path: "/english-logo.png", iso_639_1: "en", vote_average: 10 },
      { file_path: "/italian-logo.png", iso_639_1: "it", vote_average: 1 }
    ],
    posters: [
      { file_path: "/english-poster.jpg", iso_639_1: "en" },
      { file_path: "/italian-poster.jpg", iso_639_1: "it" }
    ],
    backdrops: [
      { file_path: "/english-backdrop.jpg", iso_639_1: "en" },
      { file_path: "/italian-backdrop.jpg", iso_639_1: "it" }
    ]
  },
  videos: {
    results: [{ site: "YouTube", key: "italian-trailer", type: "Trailer", iso_639_1: "it" }]
  }
};

try {
  TmdbSettingsStore.replaceForProfile(
    "1",
    { enabled: true, language: "IT_it" },
    { silentSync: true }
  );
  assert.equal(TmdbSettingsStore.get().language, "it-IT");
  assert.equal(normalizeTmdbLanguageCode(" it_IT "), "it-IT");

  for (const platform of ["webos", "tizen"]) {
    Platform.current = { name: platform };
    const requests = [];
    globalThis.fetch = async () => {
      throw new Error("Direct TV fetch unavailable");
    };
    PluginServiceClient.fetch = async (request) => {
      requests.push(request);
      const url = new URL(request.url);
      assert.equal(url.searchParams.get("language"), "it-IT");
      assert.ok(url.searchParams.get("include_image_language").split(",").includes("it"));
      assert.equal(request.timeoutMs, 10000);
      return { ok: true, status: 200, body: JSON.stringify(italianDetails) };
    };
    const result = await TmdbMetadataService.fetchEnrichment({ tmdbId: 99, contentType: "movie" });
    assert.equal(result.localizedTitle, "Titolo italiano");
    assert.equal(result.description, italianDetails.overview);
    assert.ok(result.logo.endsWith("/italian-logo.png"));
    assert.ok(result.poster.endsWith("/italian-poster.jpg"));
    assert.ok(result.backdrop.endsWith("/italian-backdrop.jpg"));
    assert.equal(requests.length, 1);
  }

  // Italian region variants should rank consistently whether stored as it or it-IT.
  const regionalLogos = [
    { file_path: "/generic.png", iso_639_1: "it" },
    { file_path: "/italy.png", iso_639_1: "it", iso_3166_1: "IT" }
  ];
  assert.equal(selectBestLocalizedLogoPath(regionalLogos, "it"), "/italy.png");
  assert.equal(
    selectBestLocalizedLogoPath([{ file_path: "/german.png", iso_639_1: "de" }], "it"),
    null
  );
  assert.equal(
    selectBestLocalizedImagePath([{ file_path: "/german.jpg", iso_639_1: "de" }], "it"),
    null
  );

  Platform.current = { name: "vidaa" };
  PluginServiceClient.fetch = async () => {
    throw new Error("VIDAA must use direct metadata fetch");
  };
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/videos")) throw new Error("Trailer provider unavailable");
    assert.equal(parsed.searchParams.get("language"), "it-IT");
    return { ok: true, json: async () => ({ ...italianDetails, videos: { results: [] } }) };
  };
  const withoutTrailer = await TmdbMetadataService.fetchEnrichment({
    tmdbId: 99,
    contentType: "movie"
  });
  assert.equal(withoutTrailer.description, italianDetails.overview);
  assert.deepEqual(withoutTrailer.trailers, []);

  // Standalone lookups must request the preferred language, including English.
  for (const language of ["it-IT", "en-US"]) {
    const trailerRequests = [];
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      trailerRequests.push(parsed);
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              site: "YouTube",
              key: "localized-trailer",
              type: "Trailer",
              iso_639_1: language.slice(0, 2)
            }
          ]
        })
      };
    };
    const trailers = await TmdbMetadataService.fetchTrailerCandidates({
      tmdbId: 99,
      contentType: "movie",
      language
    });
    assert.equal(trailers[0].ytId, "localized-trailer");
    assert.equal(trailerRequests.length, 1);
    assert.equal(trailerRequests[0].searchParams.get("language"), language);
  }

  Platform.current = { name: "webos" };
  let directRequests = 0;
  globalThis.fetch = async () => {
    directRequests++;
    return { ok: true, json: async () => ({ fallback: true }) };
  };
  PluginServiceClient.fetch = async () => {
    throw new Error("Service unavailable");
  };
  assert.deepEqual(await fetchTmdbJson(apiUrl), { fallback: true });
  PluginServiceClient.fetch = async () => ({ ok: true, status: 200, body: "{", truncated: true });
  assert.deepEqual(await fetchTmdbJson(apiUrl), { fallback: true });
  assert.equal(directRequests, 2);
  PluginServiceClient.fetch = async () => ({ ok: false, status: 401 });
  assert.equal(await fetchTmdbJson(apiUrl), null);
  assert.equal(directRequests, 2);

  // ID lookup and metadata use the same TV transport.
  PluginServiceClient.fetch = async (request) => {
    assert.ok(new URL(request.url).pathname.endsWith("/find/tt0000099"));
    return { ok: true, status: 200, body: JSON.stringify({ movie_results: [{ id: 99 }] }) };
  };
  assert.equal(await TmdbService.ensureTmdbId("tt0000099", "movie"), "99");
  assert.equal(directRequests, 2);

  Platform.current = { name: "browser" };
  let cancelled = false;
  globalThis.fetch = async (_url, options) => {
    options.signal.addEventListener("abort", () => {
      cancelled = true;
    });
    return new Promise(() => {});
  };
  await assert.rejects(fetchTmdbJson(apiUrl, { timeoutMs: 10 }), /timed out/);
  assert.equal(cancelled, true);

  const controller = new AbortController();
  const pending = fetchTmdbJson(apiUrl, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
  globalThis.fetch = async () => {
    throw new Error("Aborted request should not start");
  };
  await assert.rejects(fetchTmdbJson(apiUrl, { signal: controller.signal }), /aborted/);
} finally {
  globalThis.fetch = originalFetch;
  PluginServiceClient.fetch = originalServiceFetch;
  Platform.current = originalPlatform;
}

console.log(
  "TMDB checks passed: Italian text/artwork, TV transport, optional trailer failure, fallback, timeout and cancellation."
);
