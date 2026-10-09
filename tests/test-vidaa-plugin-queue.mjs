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
  { PluginsScreen },
  { PLUGIN_QUOTAS }
] = await Promise.all([
  import("../js/core/player/pluginManager.js"),
  import("../js/core/player/pluginRuntime.js"),
  import("../js/data/local/pluginStore.js"),
  import("../js/data/local/pluginCodeStore.js"),
  import("../js/ui/screens/plugin/pluginsScreen.js"),
  import("../js/core/player/pluginPolicy.js")
]);

const scraperId = "fixture-repository:movie-provider";

function saturatedPool(context, executeQueued) {
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
        supportedTypes: ["movie"]
      }
    ],
    settings: { pluginsEnabled: true, groupStreamsByRepository: false, scraperSettings: {} },
    runtime: { lastStatus: "ready", lastError: "" }
  };
  const originalState = structuredClone(state);
  const requests = [];
  const releases = [];
  let signalSaturated;
  const saturated = new Promise((resolve) => {
    signalSaturated = resolve;
  });
  let networkCalls = 0;
  let storeWrites = 0;
  let codeWrites = 0;
  context.mock.method(console, "warn", () => {});
  context.mock.method(console, "error", () => {});
  context.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Queue tests must not use the network");
  });
  context.mock.method(PluginStore, "get", () => state);
  context.mock.method(PluginStore, "replace", () => {
    storeWrites++;
    throw new Error("Queue tests must not write plugin settings");
  });
  context.mock.method(PluginCodeStore, "get", async () => ({ code: "fixture code" }));
  context.mock.method(PluginCodeStore, "save", async () => {
    codeWrites++;
    throw new Error("Queue tests must not write plugin code");
  });
  context.mock.method(PluginManager, "ensureRuntime", async () => true);
  context.mock.method(PluginRuntime, "executePlugin", async (request) => {
    requests.push(request.args);
    if (!request.args.tmdbId.startsWith("blocking-")) return executeQueued(request);
    return new Promise((resolve) => {
      releases.push(resolve);
      if (releases.length === PLUGIN_QUOTAS.modern.maxConcurrent) signalSaturated();
    });
  });
  const blockers = Array.from({ length: PLUGIN_QUOTAS.modern.maxConcurrent }, (_, index) =>
    PluginManager.testScraper(scraperId, { tmdbId: `blocking-${index}` })
  );
  context.after(async () => {
    for (const release of releases) release([]);
    await Promise.all(blockers);
    assert.equal(networkCalls, 0);
    assert.equal(storeWrites, 0);
    assert.equal(codeWrites, 0);
    assert.deepEqual(state, originalState);
  });
  return { saturated, requests, releases };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("an execution error after the provider test waits in the pool remains visible", async (context) => {
  const { saturated, requests, releases } = saturatedPool(context, async () => {
    throw new Error("Queued worker bootstrap failed");
  });
  await saturated;
  const statuses = [];
  const screen = {
    ...PluginsScreen,
    busy: false,
    busyOperationToken: 0,
    testResult: null,
    testAbortController: null,
    render() {},
    setStatus(message, kind = "") {
      statuses.push({ message, kind });
    }
  };
  const providerTest = screen.testScraper(scraperId);
  await nextTurn();
  assert.equal(
    requests.length,
    PLUGIN_QUOTAS.modern.maxConcurrent,
    "the tested provider must wait until an occupied worker is released"
  );
  releases[0]([]);
  await providerTest;
  assert.equal(requests.length, PLUGIN_QUOTAS.modern.maxConcurrent + 1);
  assert.deepEqual(screen.testResult.results, []);
  assert.deepEqual(screen.testResult.error, {
    name: "Error",
    message: "Queued worker bootstrap failed"
  });
  assert.equal(statuses.at(-1).kind, "error");
  assert.match(statuses.at(-1).message, /Queued worker bootstrap failed/);
  assert.ok(
    screen.testResult.diagnostics.steps.includes("Exception: Error: Queued worker bootstrap failed")
  );
  assert.equal(screen.busy, false);
});

test("ordinary stream discovery keeps its empty fallback for a queued execution error", async (context) => {
  const { saturated, requests, releases } = saturatedPool(context, async () => {
    throw new Error("Queued playback worker failed");
  });
  await saturated;
  const playback = PluginManager.executeScrapersStreaming({
    tmdbId: "queued-playback",
    mediaType: "movie"
  });
  await nextTurn();
  assert.equal(requests.length, PLUGIN_QUOTAS.modern.maxConcurrent);
  releases[0]([]);
  assert.deepEqual(await playback, []);
  assert.equal(requests.length, PLUGIN_QUOTAS.modern.maxConcurrent + 1);
});

test("cancelling an execution while queued never starts its worker", async (context) => {
  const { saturated, requests, releases } = saturatedPool(context, async () => {
    assert.fail("a cancelled queued provider must not execute");
  });
  await saturated;
  const controller = new AbortController();
  const cancelled = PluginManager.testScraper(scraperId, {
    tmdbId: "queued-cancelled",
    signal: controller.signal
  });
  await nextTurn();
  assert.equal(requests.length, PLUGIN_QUOTAS.modern.maxConcurrent);
  controller.abort();
  assert.deepEqual((await cancelled).results, []);
  releases[0]([]);
  await nextTurn();
  assert.equal(requests.length, PLUGIN_QUOTAS.modern.maxConcurrent);
});
