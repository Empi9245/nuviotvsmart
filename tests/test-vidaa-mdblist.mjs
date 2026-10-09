import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { Platform } = await import("../js/platform/index.js");
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { MdbListSettingsStore } = await import("../js/data/local/mdbListSettingsStore.js");
const { mdbListRepository } = await import("../js/data/repository/mdbListRepository.js");
const { createMetaDetailsScreenMethods08 } =
  await import("../js/ui/screens/detail/metaDetailsScreenMethods-08-render-external-ratings-row.js");
const { hasMdbListRatings } =
  await import("../js/ui/screens/detail/metaDetailsScreenHelpers-04-detect-quality.js");
const { renderMdblistIntegrationDetail } =
  await import("../js/ui/screens/settings/settingsIntegrationDetailMdblist.js");

const originalFetch = globalThis.fetch;
const originalServiceFetch = PluginServiceClient.fetch;
const originalGetSettings = MdbListSettingsStore.get;
const originalSetSettings = MdbListSettingsStore.set;
const originalSetTimeout = globalThis.setTimeout;
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args.join(" "));
let settings = { enabled: true, apiKey: "fixture-key" };
MdbListSettingsStore.get = () => settings;
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status });
let checks = 0;
async function check(name, run) {
  await run();
  checks++;
  console.log(`✓ ${name}`);
}
function usePlatform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
}

try {
  await check(
    "VIDAA fetches every rating in one simple GET and shares the result with Home",
    async () => {
      let requests = 0;
      globalThis.fetch = async (url, options) => {
        requests++;
        const parsed = new URL(url);
        assert.equal(parsed.pathname, "/imdb/movie/tt0111161");
        assert.equal(parsed.searchParams.get("apikey"), settings.apiKey);
        assert.equal(parsed.searchParams.get("append_to_response"), "keyword");
        assert.equal(options.method, "GET");
        assert.equal(options.headers, undefined);
        assert.equal(options.body, undefined);
        assert.ok(options.signal);
        return response({
          ratings: [
            { source: "imdb", value: 9.3 },
            { source: "trakt", value: 91 },
            { source: "tmdb", value: 87 },
            { source: "letterboxd", value: 90, score: 90 },
            { source: "tomatoes", value: 91 },
            { source: "popcorn", value: 98 },
            { source: "metacritic", value: 82 },
            { source: "myanimelist", value: 8.5 }
          ],
          keywords: [{ name: "mdblist.certified-fresh" }, "certified-hot"]
        });
      };
      const [allRatings, imdbRating] = await Promise.all([
        mdbListRepository.getRatingsForMeta({ id: "tt0111161", type: "movie" }),
        mdbListRepository.getImdbRatingForItem("tt0111161")
      ]);
      assert.equal(requests, 1);
      assert.equal(imdbRating, 9.3);
      assert.equal(allRatings.ratings.mal, 8.5);
      assert.equal(allRatings.ratings.audience, 98);
      assert.equal(allRatings.ratings.tmdb, 87);
      assert.equal(allRatings.ratings.trakt, 91);
      assert.equal(allRatings.ratings.letterboxd, 4.5);
      assert.equal(allRatings.ratings.tomatoesCertified, true);
      assert.equal(allRatings.ratings.audienceCertified, true);
      assert.equal(allRatings.hasImdbRating, true);
      assert.equal(await mdbListRepository.getImdbRatingForItem("tt0111161"), 9.3);
      assert.equal(requests, 1);
      settings = { ...settings, showImdb: false, showAudience: false };
      assert.equal(await mdbListRepository.getImdbRatingForItem("tt0111161"), null);
      const filtered = await mdbListRepository.getRatingsForMeta({ id: "tt0111161" });
      assert.equal(filtered.ratings.imdb, null);
      assert.equal(filtered.ratings.audience, null);
      assert.equal(filtered.ratings.audienceCertified, false);
      assert.equal(filtered.hasImdbRating, false);
      assert.equal(requests, 1, "provider preferences filter the cached response immediately");
      settings = { enabled: true, apiKey: "fixture-key" };
    }
  );

  await check("TMDB and TVDB catalog IDs work without a separate TMDB API key", async () => {
    const paths = [];
    globalThis.fetch = async (url) => {
      paths.push(new URL(url).pathname);
      return response({ ratings: [{ source: "imdb", value: 8.4 }] });
    };
    const fixtures = [
      [{ id: "tmdb:series:1399", type: "series" }, "/tmdb/show/1399"],
      [{ id: "series:1400", type: "tv" }, "/tmdb/show/1400"],
      [{ id: "1401", type: "show" }, "/tmdb/show/1401"],
      [{ id: "custom-item", external_ids: { tmdb_id: 278 }, type: "movie" }, "/tmdb/movie/278"],
      [{ id: "tvdb:121361", type: "series" }, "/tvdb/show/121361"],
      [{ id: "custom-id", ids: { imdb: "tt0120737" }, type: "movie" }, "/imdb/movie/tt0120737"]
    ];
    for (const [meta, path] of fixtures) {
      assert.equal((await mdbListRepository.getRatingsForMeta(meta)).ratings.imdb, 8.4);
      assert.equal(paths.at(-1), path);
    }
  });

  await check(
    "absent ratings stay absent and MyAnimeList-only results reach the renderer",
    async () => {
      globalThis.fetch = async () =>
        response({
          ratings: [
            { source: "imdb", value: null },
            { source: "imdb", value: 11 },
            { source: "trakt", value: "" },
            { source: "tmdb", value: false },
            { source: "letterboxd", value: "invalid" },
            { source: "tomatoes", value: -1 },
            { source: "metacritic", value: 101 },
            { source: "mal", value: "8.20" }
          ]
        });
      const result = await mdbListRepository.getRatingsForMeta({ id: "tt9999901", type: "series" });
      assert.equal(result.ratings.imdb, null);
      assert.equal(result.ratings.trakt, null);
      assert.equal(result.ratings.tmdb, null);
      assert.equal(result.ratings.letterboxd, null);
      assert.equal(result.ratings.tomatoes, null);
      assert.equal(result.ratings.metacritic, null);
      assert.equal(result.ratings.mal, 8.2);
      assert.equal(result.hasImdbRating, false);
      assert.equal(hasMdbListRatings(result.ratings), true);
      const markup = createMetaDetailsScreenMethods08().renderExternalRatingsRow({
        mdbListRatings: result.ratings
      });
      assert.match(markup, /mdblist_mal\.svg/);
      assert.match(markup, />8\.2</);
      assert.doesNotMatch(markup, /imdb_logo_2016/);
    }
  );

  await check(
    "network, HTTP and empty-response failures do not poison the rating cache",
    async () => {
      for (const [index, failure] of [
        () => {
          throw new TypeError("offline fixture-key");
        },
        () => response({ error: "unavailable" }, 503),
        () => response({ ratings: [{ source: "imdb", value: null }] }),
        () => new Response("invalid-json")
      ].entries()) {
        const id = `tt999998${index}`;
        let requests = 0;
        globalThis.fetch = async () => {
          requests++;
          return requests === 1
            ? failure()
            : response({ ratings: [{ source: "imdb", value: 7.9 }] });
        };
        assert.equal(await mdbListRepository.getImdbRatingForItem(id), null);
        assert.equal(await mdbListRepository.getImdbRatingForItem(id), 7.9);
        assert.equal(requests, 2);
      }
      assert.equal(
        warnings.some((warning) => warning.includes("fixture-key")),
        false
      );
    }
  );

  await check(
    "credential changes fetch fresh results and disabled integrations make no requests",
    async () => {
      let requests = 0;
      globalThis.fetch = async (url) => {
        requests++;
        assert.equal(new URL(url).searchParams.get("apikey"), "replacement-key");
        return response({ ratings: [{ source: "imdb", value: 9.2 }] });
      };
      settings = { enabled: true, apiKey: "replacement-key" };
      assert.equal(await mdbListRepository.getImdbRatingForItem("tt0111161"), 9.2);
      settings.enabled = false;
      assert.equal(await mdbListRepository.getRatingsForMeta({ id: "tt0111161" }), null);
      settings = { enabled: true, apiKey: "" };
      assert.equal(await mdbListRepository.getRatingsForMeta({ id: "tt0111161" }), null);
      assert.equal(requests, 1);
      settings = { enabled: true, apiKey: "fixture-key" };
    }
  );

  await check("webOS and Tizen route API requests through the TV network service", async () => {
    globalThis.fetch = async () => {
      throw new Error("browser transport must not run");
    };
    for (const platform of ["webos", "tizen"]) {
      usePlatform(platform);
      PluginServiceClient.fetch = async (request) => {
        assert.equal(request.method, "GET");
        assert.equal(request.timeoutMs, 10000);
        assert.ok(request.signal);
        assert.equal(new URL(request.url).pathname, "/user");
        return { ok: true, status: 200, body: "{}" };
      };
      assert.equal(await mdbListRepository.validateApiKey("fixture-key"), true);
    }
    PluginServiceClient.fetch = async () => {
      throw new Error("service unavailable");
    };
    globalThis.fetch = async () => response({});
    assert.equal(await mdbListRepository.validateApiKey("fixture-key"), true);
    PluginServiceClient.fetch = async () => ({ ok: false, status: 401 });
    globalThis.fetch = async () => {
      throw new Error("must not retry HTTP auth failure");
    };
    assert.equal(await mdbListRepository.validateApiKey("fixture-key"), false);
    usePlatform("vidaa");
  });

  await check(
    "API key validation distinguishes invalid keys from network and quota errors",
    async () => {
      for (const status of [401, 403]) {
        globalThis.fetch = async () => response({ error: "invalid key" }, status);
        assert.equal(await mdbListRepository.validateApiKey("invalid-key"), false);
      }
      for (const status of [429, 503]) {
        globalThis.fetch = async () => response({ error: "temporarily unavailable" }, status);
        await assert.rejects(
          mdbListRepository.validateApiKey("fixture-key"),
          (error) => error.status === status
        );
      }
      globalThis.fetch = async () => {
        throw new TypeError("network unavailable");
      };
      await assert.rejects(mdbListRepository.validateApiKey("fixture-key"), /network unavailable/);
      globalThis.fetch = async () => {
        throw new Error("empty keys must not contact the server");
      };
      assert.equal(await mdbListRepository.validateApiKey(""), true);
    }
  );

  await check(
    "settings retain the draft and show a distinct retryable connection or quota message",
    async () => {
      const saved = [];
      MdbListSettingsStore.set = (value) => saved.push(value);
      const owner = {
        actionMap: new Map(),
        renderSectionHeader: () => "",
        renderActionRow: () => "",
        renderToggleRow: () => "",
        openTextDialog(dialog) {
          this.textDialog = dialog;
        },
        async render() {}
      };
      renderMdblistIntegrationDetail.call(owner, { mdbList: settings });
      owner.actionMap.get("integration:mdblist:key")();
      globalThis.fetch = async () => response({ error: "quota" }, 429);
      assert.equal(await owner.textDialog.onSubmit("new-key"), false);
      assert.match(owner.textDialog.statusMessage, /limit/);
      globalThis.fetch = async () => {
        throw new TypeError("offline");
      };
      assert.equal(await owner.textDialog.onSubmit("new-key"), false);
      assert.match(owner.textDialog.statusMessage, /connect/);
      assert.equal(saved.length, 0);
      globalThis.fetch = async () => response({});
      assert.equal(await owner.textDialog.onSubmit(" new-key "), true);
      assert.deepEqual(saved, [{ apiKey: "new-key" }]);
    }
  );

  await check("hanging TV fetches settle at the deadline and abort their request", async () => {
    let signal;
    globalThis.setTimeout = (callback, delay, ...args) =>
      originalSetTimeout(callback, delay === 10000 ? 15 : delay, ...args);
    globalThis.fetch = async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    };
    await assert.rejects(
      mdbListRepository.validateApiKey("fixture-key"),
      (error) => error.code === "REQUEST_TIMEOUT"
    );
    assert.equal(signal.aborted, true);
  });
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  PluginServiceClient.fetch = originalServiceFetch;
  MdbListSettingsStore.get = originalGetSettings;
  MdbListSettingsStore.set = originalSetSettings;
  console.warn = originalWarn;
  usePlatform("vidaa");
}

console.log(`PASS: ${checks} MDBList integration checks (simulated API and TV transports).`);
