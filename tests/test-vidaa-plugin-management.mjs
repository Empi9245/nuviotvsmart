import assert from "node:assert/strict";
import { test } from "node:test";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(String(key)) ?? null,
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: (key) => storage.delete(String(key))
};
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.Worker = class {};

const [
  { PluginManager },
  { PluginRuntime },
  { PluginStore },
  { PluginCodeStore },
  { PluginsScreen }
] = await Promise.all([
  import("../js/core/player/pluginManager.js"),
  import("../js/core/player/pluginRuntime.js"),
  import("../js/data/local/pluginStore.js"),
  import("../js/data/local/pluginCodeStore.js"),
  import("../js/ui/screens/plugin/pluginsScreen.js")
]);

const scraperId = "fixture-repository:movie-provider";
const { streamRepository } = await import("../js/data/repository/streamRepository.js");
const { TmdbService } = await import("../js/core/tmdb/tmdbService.js");

function prepare(
  context,
  executePlugin = async () => [],
  { supportedTypes = ["movie"], pluginsEnabled = false } = {}
) {
  const state = {
    repositories: [
      {
        id: "fixture-repository",
        name: "Fixture repository",
        url: "https://example.test/manifest.json",
        type: "NUVIO_JS",
        enabled: true
      }
    ],
    scrapers: [
      {
        id: scraperId,
        manifestId: "movie-provider",
        repositoryId: "fixture-repository",
        name: "Fixture movie provider",
        filename: "movie.js",
        version: "1.0",
        type: "NUVIO_JS",
        enabled: true,
        codeAvailable: true,
        supportedTypes
      }
    ],
    settings: {
      pluginsEnabled,
      groupStreamsByRepository: false,
      scraperSettings: {}
    },
    runtime: { lastStatus: "ready", lastError: "" }
  };
  const originalState = structuredClone(state);
  const requests = [];
  let networkCalls = 0;
  let storeWrites = 0;
  let codeWrites = 0;
  context.mock.method(console, "warn", () => {});
  context.mock.method(console, "error", () => {});
  context.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Management tests must not use the network");
  });
  context.mock.method(PluginStore, "get", () => state);
  context.mock.method(PluginStore, "replace", () => {
    storeWrites++;
    throw new Error("Provider tests must not rewrite plugin settings");
  });
  context.mock.method(PluginCodeStore, "get", async () => ({ code: "fixture code" }));
  context.mock.method(PluginCodeStore, "save", async () => {
    codeWrites++;
    throw new Error("Cached provider tests must not download or save code");
  });
  context.mock.method(PluginManager, "ensureRuntime", async () => true);
  context.mock.method(PluginRuntime, "executePlugin", async (request) => {
    requests.push(request.args);
    return executePlugin(request);
  });
  const statuses = [];
  const screen = {
    ...PluginsScreen,
    busy: false,
    busyOperationToken: 0,
    testResult: null,
    testAbortController: null,
    render() {},
    setStatus(message, kind = "") {
      this.statusMessage = message;
      this.statusKind = kind;
      statuses.push({ message, kind });
    }
  };
  context.after(() => {
    assert.equal(networkCalls, 0);
    assert.equal(storeWrites, 0);
    assert.equal(codeWrites, 0);
    assert.deepEqual(state, originalState);
  });
  return { screen, statuses, requests, state };
}

test("a worker execution error remains structured and visible with its diagnostics", async (context) => {
  const { screen, statuses, requests } = prepare(context, async () => {
    throw new Error("Worker bootstrap failed");
  });

  await screen.testScraper(scraperId);

  assert.deepEqual(requests, [{ tmdbId: "603", mediaType: "movie", season: null, episode: null }]);
  assert.deepEqual(screen.testResult.error, { name: "Error", message: "Worker bootstrap failed" });
  assert.deepEqual(screen.testResult.results, []);
  assert.ok(
    screen.testResult.diagnostics.steps.includes("Exception: Error: Worker bootstrap failed")
  );
  assert.match(statuses.at(-1).message, /Test failed: Worker bootstrap failed/);
  assert.equal(statuses.at(-1).kind, "error");
  assert.equal(screen.busy, false);
  assert.equal(screen.testAbortController, null);
});

test("an empty provider result remains a normal result", async (context) => {
  const { screen, statuses, state } = prepare(context);

  await screen.testScraper(scraperId);

  assert.deepEqual(screen.testResult.results, []);
  assert.equal(screen.testResult.error, undefined);
  assert.ok(screen.testResult.diagnostics.steps.includes("Result: 0 streams"));
  assert.match(statuses.at(-1).message, /No results found/);
  assert.equal(statuses.at(-1).kind, "");
  assert.equal(screen.busy, false);
  const card = screen.providerRows(
    state.repositories[0],
    {
      ...state,
      readOnly: false,
      runtime: { executable: true }
    },
    { providers: state.scrapers }
  );
  assert.match(card, /No results found/);
  assert.doesNotMatch(card, /Test failed:/);
});

test("a successful explicit test works with discovery disabled and does not change provider state", async (context) => {
  const streams = [{ url: "https://example.test/video.m3u8", title: "Fixture stream" }];
  const { screen, statuses } = prepare(context, async () => streams);

  await screen.testScraper(scraperId);

  assert.deepEqual(screen.testResult.results, streams);
  assert.equal(screen.testResult.error, undefined);
  assert.equal(screen.testResult.mediaType, "movie");
  assert.equal(screen.testResult.tmdbId, "603");
  assert.ok(screen.testResult.diagnostics.steps.includes("Result: 1 streams"));
  assert.equal(statuses.at(-1).kind, "success");
  assert.equal(screen.busy, false);
});

test("runtime readiness failures retain the existing error path", async (context) => {
  const { screen, statuses, requests } = prepare(context);
  context.mock.method(PluginManager, "ensureRuntime", async () => {
    throw new Error("Runtime self-test failed");
  });

  await screen.testScraper(scraperId);

  assert.equal(requests.length, 0);
  assert.equal(screen.testResult, null);
  assert.match(statuses.at(-1).message, /Test failed: Runtime self-test failed/);
  assert.equal(statuses.at(-1).kind, "error");
  assert.equal(screen.busy, false);
});

test("a superseded failed test cannot replace a newer result or status", async (context) => {
  let finishExecution;
  let signalExecutionStarted;
  const started = new Promise((resolve) => {
    signalExecutionStarted = resolve;
  });
  const { screen, statuses } = prepare(context, () => {
    signalExecutionStarted();
    return new Promise((_, reject) => {
      finishExecution = reject;
    });
  });
  const pending = screen.testScraper(scraperId);
  await started;
  screen.beginBusyAction("newer-operation");
  const newerResult = { scraperId: "newer-provider", results: [] };
  screen.testResult = newerResult;
  screen.setStatus("Newer operation", "success");
  const statusCount = statuses.length;

  finishExecution(new Error("Old execution failed"));
  await pending;

  assert.equal(screen.testResult, newerResult);
  assert.equal(statuses.length, statusCount);
  assert.equal(screen.statusMessage, "Newer operation");
  assert.equal(screen.busy, true);
  assert.equal(screen.busyAction, "newer-operation");
});

test("the provider card shows an escaped execution error and retains diagnostics", async (context) => {
  const message = '<script>alert("fixture")</script> & failed';
  const { screen, state } = prepare(context, async () => {
    throw new Error(message);
  });
  await screen.testScraper(scraperId);
  screen.diagnosticsProviderId = scraperId;

  const card = screen.providerRows(
    state.repositories[0],
    {
      ...state,
      readOnly: false,
      runtime: { executable: true }
    },
    { providers: state.scrapers }
  );

  assert.match(
    card,
    /Test failed: &lt;script&gt;alert\(&quot;fixture&quot;\)&lt;\/script&gt; &amp; failed/
  );
  assert.doesNotMatch(card, /No results found|Test results \(0 streams\)|<script>/);
  assert.match(card, /plugins-test-diagnostics/);
  assert.match(card, /Exception: Error: &lt;script&gt;/);
  assert.equal(screen.testResult.error.message, message);
});

test("a series-only provider receives the documented tv contract and an episode fixture", async (context) => {
  const { screen, requests } = prepare(context, async () => [], { supportedTypes: ["tv"] });

  await screen.testScraper(scraperId);

  assert.deepEqual(requests, [{ tmdbId: "1399", mediaType: "tv", season: 1, episode: 1 }]);
  assert.equal(screen.testResult.tmdbId, "1399");
  assert.equal(screen.testResult.mediaType, "tv");
  assert.ok(screen.testResult.diagnostics.steps.includes("Test: TMDB 1399 (tv)"));
});

test("movie-capable providers keep the movie fixture and explicit IDs remain supported", async (context) => {
  const { requests } = prepare(context, async () => [], { supportedTypes: ["movie", "tv"] });

  await PluginManager.testScraper(scraperId);
  await PluginManager.testScraper(scraperId, { tmdbId: "550" });

  assert.deepEqual(requests, [
    { tmdbId: "603", mediaType: "movie", season: null, episode: null },
    { tmdbId: "550", mediaType: "movie", season: null, episode: null }
  ]);
});

test("a provider without movie or series support is not tested as an invented series", async (context) => {
  const { screen, requests, statuses } = prepare(context, async () => [], {
    supportedTypes: ["live"]
  });

  await screen.testScraper(scraperId);

  assert.equal(requests.length, 0);
  assert.equal(screen.testResult, null);
  assert.equal(statuses.at(-1).kind, "error");
  assert.match(statuses.at(-1).message, /Provider does not support movie or series tests/);
  assert.equal(screen.busy, false);
});

for (const alias of ["series", "show", "other"]) {
  test(`normal source discovery executes a provider declaring Android's ${alias} alias`, async (context) => {
    const streams = [{ url: "https://example.test/episode.mp4", title: "Episode fixture" }];
    const { requests } = prepare(context, async () => streams, {
      supportedTypes: [alias],
      pluginsEnabled: true
    });
    context.mock.method(TmdbService, "ensureTmdbId", async () => "1399");
    const results = await streamRepository.getPluginStreams("series", "tt-fixture", {
      season: 1,
      episode: 2
    });
    assert.deepEqual(requests, [{ tmdbId: "1399", mediaType: "tv", season: 1, episode: 2 }]);
    assert.equal(results.length, 1);
    assert.equal(results[0].streams[0].url, streams[0].url);
  });
}

test("a ready VIDAA browser runtime does not claim a native plugin service", (context) => {
  prepare(context);

  const capabilities = PluginManager.getCapabilitySnapshot();

  assert.equal(capabilities.networkMode, "browser");
  assert.equal(capabilities.executable, true);
  assert.equal(capabilities.localJsPluginSupported, true);
  assert.equal(capabilities.pluginServiceAvailable, false);
});

test("fetch and provider diagnostics explain an empty result without changing its contract", async (context) => {
  const { screen, state, statuses } = prepare(context, async ({ onDiagnostic }) => {
    onDiagnostic({
      type: "fetchFailure",
      url: "https://example.test/provider?token=[redacted]",
      status: 403,
      statusText: "Forbidden",
      truncated: false
    });
    onDiagnostic({
      type: "providerLog",
      level: "error",
      message: "getStreams failed: fixture provider failure"
    });
    return [];
  });

  await screen.testScraper(scraperId);
  screen.diagnosticsProviderId = scraperId;

  assert.deepEqual(screen.testResult.results, []);
  assert.equal(screen.testResult.error, undefined);
  assert.equal(statuses.at(-1).kind, "");
  assert.ok(
    screen.testResult.diagnostics.steps.includes(
      "Fetch failed: 403 Forbidden https://example.test/provider?token=[redacted]"
    )
  );
  assert.ok(
    screen.testResult.diagnostics.steps.includes(
      "Provider error: getStreams failed: fixture provider failure"
    )
  );
  const card = screen.providerRows(
    state.repositories[0],
    {
      ...state,
      readOnly: false,
      runtime: { executable: true }
    },
    { providers: state.scrapers }
  );
  assert.match(card, /No results found/);
  assert.match(card, /Fetch failed: 403 Forbidden/);
  assert.match(card, /getStreams failed: fixture provider failure/);
  assert.doesNotMatch(card, /Test failed:/);
});

test("provider diagnostic steps and messages stay bounded and keep the final result", async (context) => {
  const { screen } = prepare(context, async ({ onDiagnostic }) => {
    for (let index = 0; index < 80; index++) {
      onDiagnostic({ type: "providerLog", level: "warn", message: "x".repeat(1000) });
    }
    return [];
  });

  await screen.testScraper(scraperId);

  assert.equal(screen.testResult.diagnostics.steps.length, 40);
  assert.ok(screen.testResult.diagnostics.steps.every((step) => step.length <= 320));
  assert.equal(screen.testResult.diagnostics.steps.at(-1), "Result: 0 streams");
  assert.equal(screen.testResult.error, undefined);
});
