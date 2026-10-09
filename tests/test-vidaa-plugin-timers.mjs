import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";

// Bundle the production Worker into an isolated temporary package. The test
// loads its real QuickJS WASM, without replacing the VM or exposing Node APIs
// to either the Worker asset or provider code.
const root = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "nuvio-plugin-timers-"));
const workerPath = path.join(temporaryRoot, "assets/runtime/plugin-worker.js");
await mkdir(path.dirname(workerPath), { recursive: true });
await mkdir(path.join(temporaryRoot, "assets/libs"), { recursive: true });
await build({
  entryPoints: [path.join(root, "node_modules/quickjs-emscripten/dist/index.global.js")],
  outfile: path.join(temporaryRoot, "assets/libs/quickjs-emscripten.global.js"),
  bundle: false,
  target: "chrome53",
  legalComments: "none"
});
await build({
  entryPoints: [path.join(root, "js/core/player/pluginWorker.js")],
  outfile: workerPath,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome53",
  legalComments: "none",
  define: {
    __NUVIO_CRYPTO_JS_SOURCE__: JSON.stringify(
      await readFile(path.join(root, "node_modules/crypto-js/crypto-js.js"), "utf8")
    )
  }
});
const adapter = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");
  const { readFileSync } = require("node:fs");
  const vm = require("node:vm");
  const sandbox = {
    console, TextEncoder, TextDecoder, WebAssembly, URL, URLSearchParams,
    atob, btoa, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    location: { href: workerData.url },
    postMessage: message => parentPort.postMessage(message)
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...urls) => {
    for (const url of urls) {
      vm.runInContext(readFileSync(new URL(url, workerData.url), "utf8"), context);
    }
  };
  vm.runInContext(readFileSync(new URL(workerData.url), "utf8"), context);
  parentPort.on("message", data => sandbox.onmessage({ data }));
`;

let checks = 0;
async function check(name, code, expected, options = {}) {
  const worker = new Worker(adapter, {
    eval: true,
    stderr: true,
    workerData: { url: pathToFileURL(workerPath).href }
  });
  const logs = [];
  const errors = [];
  let standardError = "";
  worker.stderr.on("data", (chunk) => {
    standardError += chunk;
  });
  worker.on("error", (error) => errors.push(error));
  worker.on("message", (message) => {
    if (message.type === "pluginLog") logs.push(message);
  });
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timer fixture timed out")), 5000);
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.type === "error") {
          clearTimeout(timeout);
          reject(new Error(message.error));
        } else if (message.type === "result") {
          clearTimeout(timeout);
          resolve(message.results);
        } else if (message.type === "fetch") {
          clearTimeout(timeout);
          reject(new Error("Timer fixture unexpectedly requested network access"));
        }
      });
      worker.postMessage({
        type: "execute",
        code,
        executionId: "timer-fixture",
        timeoutMs: 1500,
        quota: { maxCodeBytes: 1024 * 1024, maxResultsPerScraper: 25 },
        args: { tmdbId: "603", mediaType: "movie" },
        ...options
      });
    });
    assert.deepEqual(result, expected);
    if (options.expectedLog) {
      assert.ok(
        logs.some((log) => log.message.includes(options.expectedLog)),
        "The runtime must report the callback or provider failure"
      );
    }
    if (options.observeCleanup) {
      // Keep the Worker alive after its VM has been disposed: a retained host
      // timer must neither call a freed guest handle nor log its callback.
      await new Promise((resolve) => setTimeout(resolve, 160));
      assert.ok(!logs.some((log) => log.message.includes("STALE_TIMER_FIRED")));
    }
    assert.deepEqual(errors, []);
    assert.ok(
      !/JS_FreeRuntime|gc_obj_list|Assertion failed|Aborted\(/.test(standardError),
      "The real VM must dispose without native assertions"
    );
    checks += 1;
    console.log(`✓ ${name}`);
  } finally {
    await worker.terminate();
  }
}

try {
  await check(
    "provider sleeps through guest setTimeout and receives callback arguments",
    `
    module.exports.getStreams = async function() {
      var observed = [];
      await new Promise(function(resolve) {
        setTimeout(function(a, b) { observed.push(a + b); resolve(); }, 5, 'sleep-', 'done');
      });
      return [{ value: observed[0], bridge: typeof __native_set_timer,
        node: typeof process }];
    };
  `,
    [{ value: "sleep-done", bridge: "undefined", node: "undefined" }]
  );

  await check(
    "clearTimeout prevents callbacks and permits ordinary zero-delay work",
    `
    module.exports.getStreams = async function() {
      var value = 0;
      var id = setTimeout(function() { value = 99; }, 5);
      clearTimeout(id);
      await new Promise(function(resolve) { setTimeout(resolve, 20); });
      return [{ value: value }];
    };
  `,
    [{ value: 0 }]
  );

  await check(
    "interval can clear itself and settle a guest Promise",
    `
    module.exports.getStreams = async function() {
      var count = 0;
      await new Promise(function(resolve) {
        var id = setInterval(function() {
          if (++count === 3) { clearInterval(id); resolve(); }
        }, 2);
      });
      await new Promise(function(resolve) { setTimeout(resolve, 10); });
      return [{ count: count }];
    };
  `,
    [{ count: 3 }]
  );

  await check(
    "callback errors are reported while other timers keep resolving",
    `
    module.exports.getStreams = async function() {
      setTimeout(function() { throw new Error('fixture timer error'); }, 1);
      await new Promise(function(resolve) { setTimeout(resolve, 10); });
      return [{ finished: true }];
    };
  `,
    [{ finished: true }],
    { expectedLog: "fixture timer error" }
  );

  await check(
    "timer quota is bounded and clearing releases capacity",
    `
    module.exports.getStreams = async function() {
      var timers = [];
      for (var i = 0; i < 64; i++) timers.push(setTimeout(function() {}, 10000));
      var limited = false;
      try { setTimeout(function() {}, 10000); } catch (_) { limited = true; }
      timers.forEach(clearTimeout);
      await new Promise(function(resolve) { setTimeout(resolve, 1); });
      return [{ limited: limited }];
    };
  `,
    [{ limited: true }]
  );

  await check(
    "provider cache-expiry timers are removed when execution ends",
    `
    setTimeout(function() { console.error('STALE_TIMER_FIRED'); }, 75);
    var interval = setInterval(function() { console.error('STALE_TIMER_FIRED'); }, 75);
    module.exports.getStreams = function() { return [{ ready: true }]; };
  `,
    [{ ready: true }],
    { observeCleanup: true }
  );

  await check(
    "a delay beyond the provider deadline cannot fire early or retain the VM",
    `
    module.exports.getStreams = async function() {
      await new Promise(function(resolve) {
        setTimeout(function() { console.error('STALE_TIMER_FIRED'); resolve(); }, 10000);
      });
      return [{ early: true }];
    };
  `,
    [],
    { timeoutMs: 300, observeCleanup: true, expectedLog: "Plugin promise timed out" }
  );

  console.log(`VIDAA plugin timer tests passed: ${checks}`);
} finally {
  const resolvedRoot = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolvedRoot).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
  assert.ok(path.basename(resolvedRoot).startsWith("nuvio-plugin-timers-"));
  await rm(resolvedRoot, { recursive: true, force: true });
}
