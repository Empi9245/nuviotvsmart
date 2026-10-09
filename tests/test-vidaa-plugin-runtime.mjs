import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";
import { mock } from "node:test";

// Run the shipped classic Worker and its embedded QuickJS WASM in a browser-like
// VM, without exposing Node's process, require, Buffer or module to either asset.
// This exercises the real main/Worker/network messages rather than a QuickJS stub.
const workerUrl = new URL("../dist/assets/runtime/plugin-worker.js", import.meta.url);
const quickjsUrl = new URL("../dist/assets/libs/quickjs-emscripten.global.js", import.meta.url);
assert.ok(existsSync(workerUrl), "Build dist before running plugin runtime tests");
assert.ok(existsSync(quickjsUrl), "The packaged QuickJS asset must exist");
const adapterSource = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");
  const { readFileSync } = require("node:fs");
  const { fileURLToPath } = require("node:url");
  const vm = require("node:vm");
  const sandbox = {
    console, TextEncoder, TextDecoder, WebAssembly, URL, URLSearchParams,
    atob, btoa, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    location: { href: workerData.url },
    postMessage: (message) => parentPort.postMessage(message)
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...urls) => {
    for (const url of urls) {
      const resolved = new URL(url, workerData.url);
      vm.runInContext(readFileSync(resolved, "utf8"), context, {
        filename: fileURLToPath(resolved)
      });
    }
  };
  vm.runInContext(readFileSync(new URL(workerData.url), "utf8"), context, {
    filename: fileURLToPath(workerData.url)
  });
  parentPort.on("message", (data) => sandbox.onmessage({ data }));
`;

class BrowserWorker {
  constructor(url) {
    assert.equal(url, workerUrl.href);
    this.worker = new NodeWorker(adapterSource, { eval: true, workerData: { url } });
    this.worker.on("message", (data) => this.onmessage?.({ data }));
    this.worker.on("error", (error) => this.onerror?.({ message: error.message }));
  }
  postMessage(message) {
    this.worker.postMessage(message);
  }
  terminate() {
    return this.worker.terminate();
  }
}

const originals = {
  Worker: globalThis.Worker,
  fetch: globalThis.fetch,
  localStorage: globalThis.localStorage,
  platform: globalThis.__NUVIO_PLATFORM__,
  workerUrl: globalThis.__NUVIO_PLUGIN_WORKER_URL__,
  env: globalThis.__NUVIO_ENV__
};
globalThis.Worker = BrowserWorker;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.__NUVIO_PLUGIN_WORKER_URL__ = workerUrl.href;
globalThis.__NUVIO_ENV__ = { TMDB_API_KEY: "fixture-key" };
const { PluginRuntime } = await import("../js/core/player/pluginRuntime.js");
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { PLUGIN_QUOTAS } = await import("../js/core/player/pluginPolicy.js");
let checks = 0;
const quota = { ...PLUGIN_QUOTAS.limited, providerTimeoutMs: 5000, maxFetchBytes: 256 };

function response(body, headers = {}, status = 200) {
  return new Response(body, { status, headers });
}
function execute(code, options = {}) {
  return PluginRuntime.executePlugin({
    code,
    filename: "fixture-provider.js",
    scraperId: "fixture-provider",
    quota,
    timeoutMs: 5000,
    args: { tmdbId: "603", mediaType: "movie" },
    ...options
  });
}
async function check(name, run) {
  await run();
  assert.equal(PluginRuntime.getActiveWorkerCount(), 0, "Settled executions release their Worker");
  checks += 1;
  console.log(`✓ ${name}`);
}

try {
  await check("packaged Worker and QuickJS WASM self-test", async () => {
    assert.deepEqual(await PluginRuntime.selfTest({ quota }), []);
    const health = await PluginServiceClient.ensureReady({ force: true });
    assert.equal(health.networkMode, "browser");
    assert.equal(health.networkBoundary, false);
  });

  await check("CommonJS provider fetches JSON and retains exposed response headers", async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://provider.example/api/603");
      assert.equal(options.headers.Accept, "application/json");
      calls += 1;
      return response(JSON.stringify({ url: "https://media.example/movie.mp4" }), {
        "Content-Type": "application/json",
        "X-Provider": "fixture"
      });
    };
    const results = await execute(`
      module.exports.getStreams = async function(id, type) {
        var response = await fetch('https://provider.example/api/' + id, {
          headers: { Accept: 'application/json' }
        });
        var body = await response.json();
        return [{ url: body.url, type: type, provider: response.headers.get('X-Provider') }];
      };
    `);
    assert.deepEqual(results, [
      { url: "https://media.example/movie.mp4", type: "movie", provider: "fixture" }
    ]);
    assert.equal(calls, 1);
  });

  await check("guest manual redirects reach the browser and report hidden targets", async () => {
    const diagnostics = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://provider.example/redirect");
      assert.equal(options.redirect, "manual");
      // This is the browser's actual manual redirect response contract. A
      // mocked 302 with visible Location would falsely certify VIDAA support.
      return { type: "opaqueredirect", status: 0, headers: new Headers(), body: null };
    };
    assert.deepEqual(
      await execute(
        `
      module.exports.getStreams = async function() {
        var response = await fetch('https://provider.example/redirect', { redirect: 'manual' });
        return [{ status: response.status, target: response.headers.get('location') }];
      };
    `,
        { onDiagnostic: (event) => diagnostics.push(event) }
      ),
      [{ status: 0, target: null }]
    );
    assert.ok(
      diagnostics.some(
        (event) => event.type === "fetchFailure" && /manual redirect target/.test(event.statusText)
      )
    );
  });

  await check(
    "an exposed native manual redirect is expected, but hidden or truncated data is not",
    async () => {
      // Emulate the tested native service response contract here; standard
      // browser opaque redirects remain covered separately above.
      let payload = {
        returnValue: true,
        status: 302,
        ok: false,
        statusText: "Found",
        url: "https://provider.example/redirect",
        body: "",
        truncated: false,
        headers: { location: "https://media.example/movie.mp4" }
      };
      mock.method(PluginServiceClient, "fetch", async (request) => {
        assert.equal(request.followRedirects, false);
        return payload;
      });
      const code = `module.exports.getStreams = async function() {
      var response = await fetch('https://provider.example/redirect', { redirect: 'manual' });
      var target = response.headers.get('location');
      return target ? [{ url: target }] : [];
    };`;
      try {
        const expected = [];
        assert.deepEqual(await execute(code, { onDiagnostic: (event) => expected.push(event) }), [
          { url: "https://media.example/movie.mp4" }
        ]);
        assert.ok(!expected.some((event) => event.type === "fetchFailure"));
        payload = { ...payload, headers: {} };
        const missing = [];
        assert.deepEqual(await execute(code, { onDiagnostic: (event) => missing.push(event) }), []);
        assert.ok(missing.some((event) => event.type === "fetchFailure"));
        payload = {
          ...payload,
          headers: { location: "https://media.example/movie.mp4" },
          truncated: true
        };
        const truncated = [];
        await execute(code, { onDiagnostic: (event) => truncated.push(event) });
        assert.ok(truncated.some((event) => event.type === "fetchFailure" && event.truncated));
      } finally {
        mock.restoreAll();
      }
    }
  );

  await check(
    "global entry point receives episode, settings and Android library shims",
    async () => {
      const results = await execute(
        `
      globalThis.getStreams = function(id, type, season, episode) {
        var $ = require('cheerio').load('<div><a href="https://media.example/episode.m3u8">Fixture</a></div>');
        var crypto = require('crypto-js');
        return [{ url: $('a').attr('href'), name: $('a').text(),
          digest: crypto.MD5('fixture').toString(), id: id, type: type,
          season: season, episode: episode, scraper: SCRAPER_ID,
          setting: SCRAPER_SETTINGS.language, key: TMDB_API_KEY,
          host: typeof process + ':' + typeof __native_fetch }];
      };
    `,
        {
          args: { tmdbId: "1399", mediaType: "tv", season: "2", episode: "3" },
          settings: { language: "it" }
        }
      );
      assert.deepEqual(results, [
        {
          url: "https://media.example/episode.m3u8",
          name: "Fixture",
          digest: "4cf9d4f0069fc18fb3fcc0a50dceb852",
          id: "1399",
          type: "tv",
          season: 2,
          episode: 3,
          scraper: "fixture-provider",
          setting: "it",
          key: "fixture-key",
          host: "undefined:undefined"
        }
      ]);
    }
  );

  await check("binary request and response cross the real Worker bridge", async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://provider.example/binary");
      assert.equal(options.method, "POST");
      assert.deepEqual(Array.from(options.body), [0, 128, 255]);
      return response(new Uint8Array([255, 0, 128]), {
        "Content-Type": "application/octet-stream"
      });
    };
    assert.deepEqual(
      await execute(`
      module.exports.getStreams = async function() {
        var response = await fetch('https://provider.example/binary', {
          method: 'POST', body: new Uint8Array([0, 128, 255])
        });
        var bytes = new Uint8Array(await response.arrayBuffer());
        return [{ bytes: Array.from(bytes) }];
      };
    `),
      [{ bytes: [255, 0, 128] }]
    );
  });

  await check("provider abort cancels its individual host request", async () => {
    let aborts = 0;
    globalThis.fetch = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborts += 1;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });
    assert.deepEqual(
      await execute(`
      module.exports.getStreams = async function() {
        var controller = new AbortController();
        var pending = fetch('https://provider.example/pending', { signal: controller.signal });
        controller.abort();
        try { await pending; return [{ error: 'abort was ignored' }]; }
        catch (error) { return [{ name: error.name }]; }
      };
    `),
      [{ name: "AbortError" }]
    );
    assert.equal(aborts, 1);
  });

  await check(
    "bounded network failures reach diagnostics without breaking Android's response contract",
    async () => {
      const diagnostics = [];
      globalThis.fetch = async () => {
        throw new TypeError("Failed to fetch");
      };
      assert.deepEqual(
        await execute(
          `
      module.exports.getStreams = async function() {
        var response = await fetch('https://provider.example/fail?token=private');
        return [{ status: response.status, ok: response.ok }];
      };
    `,
          { onDiagnostic: (event) => diagnostics.push(event) }
        ),
        [{ status: 0, ok: false }]
      );
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].type, "fetchFailure");
      assert.equal(diagnostics[0].status, 0);
      assert.ok(!JSON.stringify(diagnostics).includes("private"));
    }
  );

  await check(
    "bootstrap errors reject, provider exceptions keep empty results and report diagnostics",
    async () => {
      await assert.rejects(
        execute("throw new Error('fixture bootstrap failure');"),
        /fixture bootstrap failure/
      );
      const diagnostics = [];
      assert.deepEqual(
        await execute(
          `
      module.exports.getStreams = async function() { throw new Error('fixture provider failure'); };
    `,
          { onDiagnostic: (event) => diagnostics.push(event) }
        ),
        []
      );
      assert.ok(
        diagnostics.some((event) => event.type === "providerLog" && event.level === "error")
      );
    }
  );

  await check(
    "installing a manifest downloads relative provider code and executes its cached script",
    async () => {
      const [{ PluginManager }, { PluginStore }, { PluginCodeStore }, models] = await Promise.all([
        import("../js/core/player/pluginManager.js"),
        import("../js/data/local/pluginStore.js"),
        import("../js/data/local/pluginCodeStore.js"),
        import("../js/core/player/pluginModels.js")
      ]);
      // Keep state entirely in memory so this fixture cannot trigger account sync.
      let state = models.createDefaultPluginState();
      let revision = 0;
      mock.method(PluginStore, "get", () => state);
      mock.method(PluginStore, "replace", (value) => {
        state = models.normalizePluginState(value);
        revision++;
        return state;
      });
      mock.method(PluginStore, "getRevision", () => revision);
      mock.method(PluginStore, "canEdit", () => true);
      const requests = [];
      const manifestUrl = "https://repository.example/nested/manifest.json";
      const codeUrl = "https://repository.example/nested/providers/movie.js";
      globalThis.fetch = async (url) => {
        requests.push(url);
        if (url === manifestUrl)
          return response(
            JSON.stringify({
              name: "Fixture repository",
              version: "1.0",
              scrapers: [
                {
                  id: "movie",
                  name: "Fixture provider",
                  version: "1.0",
                  filename: "providers/movie.js",
                  supportedTypes: ["movie"]
                }
              ]
            }),
            { "Content-Type": "application/json" }
          );
        assert.equal(url, codeUrl, "Provider filename resolves against its manifest directory");
        return response(
          "module.exports.getStreams = function(id) { return [{ url: 'https://media.example/' + id + '.mp4' }]; };",
          { "Content-Type": "application/javascript" }
        );
      };
      try {
        const repository = await PluginManager.addRepository(manifestUrl);
        assert.equal(repository.type, "NUVIO_JS");
        assert.deepEqual(requests, [manifestUrl, codeUrl]);
        const [scraper] = PluginManager.listScrapers(repository.id);
        assert.equal(scraper.codeUrl, codeUrl);
        assert.equal(scraper.codeAvailable, true);
        const tested = await PluginManager.testScraper(scraper.id);
        assert.deepEqual(tested.results, [{ url: "https://media.example/603.mp4" }]);
        assert.equal(tested.error, undefined);
        assert.equal(requests.length, 2, "Execution uses its installed code cache");
      } finally {
        mock.restoreAll();
        PluginRuntime.cancelAll();
        await PluginCodeStore.clear("1");
      }
    }
  );
  console.log(
    `VIDAA packaged plugin runtime: ${checks} checks passed (${fileURLToPath(workerUrl)}).`
  );
} finally {
  PluginRuntime.cancelAll();
  PluginServiceClient.resetHealthCache();
  Object.assign(globalThis, {
    Worker: originals.Worker,
    fetch: originals.fetch,
    localStorage: originals.localStorage,
    __NUVIO_PLATFORM__: originals.platform,
    __NUVIO_PLUGIN_WORKER_URL__: originals.workerUrl,
    __NUVIO_ENV__: originals.env
  });
}
