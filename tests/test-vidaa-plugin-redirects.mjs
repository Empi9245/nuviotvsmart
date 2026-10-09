import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import vm from "node:vm";
import { mock } from "node:test";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { Platform } = await import("../js/platform/index.js");
const { WebOsPluginService } = await import("../js/platform/webos/webosPluginService.js");
const { validatePluginFetchRequest } = await import("../js/core/player/pluginSecurity.js");
const originalFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
const requests = [];
let serviceHandler;
let sequence = 0;
let checks = 0;
const routes = new Map();

// Run the actual service router, request validation, redirect handling and
// bounded response reader. Replace only DNS/socket I/O so this test neither
// contacts provider sites nor changes the loopback-only service boundary.
const transport = {
  createServer(handler) {
    serviceHandler = handler;
    return new EventEmitter();
  },
  request(options, callback) {
    const request = new EventEmitter();
    const body = [];
    request.setTimeout = () => request;
    request.write = (chunk) => body.push(Buffer.from(chunk));
    request.destroy = (error) => {
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    request.end = () => {
      const url = `${options.protocol}//${options.servername}${options.path}`;
      requests.push({ url, options, body: Buffer.concat(body).toString("utf8") });
      const fixture = routes.get(url);
      assert.ok(fixture, `Unexpected native request ${url}`);
      queueMicrotask(() => {
        const response = Readable.from([Buffer.from(fixture.body || "", "utf8")]);
        response.statusCode = fixture.status || 200;
        response.statusMessage = fixture.statusText || "Fixture";
        response.headers = fixture.headers || {};
        callback(response);
      });
    };
    return request;
  }
};
const nativeModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../services/plugin-http.cjs", import.meta.url), "utf8"), {
  module: nativeModule,
  require(name) {
    if (name === "http" || name === "https") return transport;
    if (name === "dns") {
      return {
        lookup: (_host, _options, callback) => callback(null, [{ address: "93.184.216.34" }])
      };
    }
    return require(name);
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout
});
nativeModule.exports.createPluginHttpServer({ logger: { warn() {} } });

function nativeRequest(payload, remoteAddress = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const request = Readable.from([Buffer.from(JSON.stringify(payload))]);
    request.method = "POST";
    request.url = "/fetch";
    request.socket = { remoteAddress };
    const response = new EventEmitter();
    response.writeHead = (status) => {
      response.httpStatus = status;
    };
    response.end = (body) => {
      response.writableEnded = true;
      try {
        resolve({ httpStatus: response.httpStatus, ...JSON.parse(body) });
      } catch (error) {
        reject(error);
      }
    };
    serviceHandler(request, response);
  });
}
async function nativeFetch(payload) {
  const response = await nativeRequest({ requestId: `redirect-${++sequence}`, ...payload });
  if (response.returnValue === false) throw new Error(response.errorText);
  return response;
}
async function check(name, run) {
  requests.length = 0;
  routes.clear();
  await run();
  checks++;
  console.log(`✓ ${name}`);
}

try {
  await check("manual mode survives validation and the native platform client", async () => {
    assert.equal(
      validatePluginFetchRequest({ url: "https://provider.example/start" }).followRedirects,
      true
    );
    assert.equal(
      validatePluginFetchRequest({ url: "https://provider.example/start", redirect: "manual" })
        .followRedirects,
      false
    );
    assert.equal(
      validatePluginFetchRequest({ url: "https://provider.example/start", followRedirects: false })
        .followRedirects,
      false
    );
    assert.equal(
      validatePluginFetchRequest({ url: "https://provider.example/start", redirect: "error" })
        .followRedirects,
      true
    );
    globalThis.__NUVIO_PLATFORM__ = "webos";
    Platform.current = null;
    routes.set("https://provider.example/start", {
      status: 302,
      headers: {
        location: "https://media.example/movie.m3u8",
        "set-cookie": "session=fixture; Path=/"
      },
      body: "redirect body"
    });
    mock.method(WebOsPluginService, "fetch", nativeFetch);
    const result = await PluginServiceClient.fetch({
      url: "https://provider.example/start",
      followRedirects: false
    });
    assert.equal(result.status, 302);
    assert.equal(result.ok, false);
    assert.equal(result.url, "https://provider.example/start");
    assert.equal(result.headers.location, "https://media.example/movie.m3u8");
    assert.equal(result.headers["set-cookie"], "session=fixture; Path=/");
    assert.equal(result.body, "redirect body");
    assert.equal(requests.length, 1, "Manual mode must not fetch the media target");
    mock.restoreAll();
  });

  await check("native following remains the default and resolves relative Location", async () => {
    routes.set("https://provider.example/start", { status: 302, headers: { location: "/next" } });
    routes.set("https://provider.example/next", { body: "final body" });
    const result = await nativeFetch({ url: "https://provider.example/start" });
    assert.equal(result.status, 200);
    assert.equal(result.url, "https://provider.example/next");
    assert.equal(result.body, "final body");
    assert.equal(requests.length, 2);
  });

  await check(
    "HTTP 300 with Location retains native following and supports manual mode",
    async () => {
      routes.set("https://provider.example/start", {
        status: 300,
        headers: { location: "/next" },
        body: "multiple choices"
      });
      routes.set("https://provider.example/next", { body: "selected target" });
      const automatic = await nativeFetch({ url: "https://provider.example/start" });
      assert.equal(automatic.status, 200);
      assert.equal(automatic.body, "selected target");
      assert.equal(requests.length, 2);
      requests.length = 0;
      const manual = await nativeFetch({
        url: "https://provider.example/start",
        followRedirects: false
      });
      assert.equal(manual.status, 300);
      assert.equal(manual.headers.location, "/next");
      assert.equal(manual.body, "multiple choices");
      assert.equal(requests.length, 1);
    }
  );

  await check("redirect method/body rules and cross-origin credentials stay intact", async () => {
    routes.set("https://provider.example/start", {
      status: 303,
      headers: { location: "https://other.example/next" }
    });
    routes.set("https://other.example/next", { body: "ok" });
    await nativeFetch({
      url: "https://provider.example/start",
      method: "POST",
      body: "a=1",
      headers: { Authorization: "fixture", "X-Provider": "keep" }
    });
    assert.equal(requests[1].options.method, "GET");
    assert.equal(requests[1].body, "");
    assert.equal(requests[1].options.headers.Authorization, undefined);
    assert.equal(requests[1].options.headers["Content-Type"], undefined);
    assert.equal(requests[1].options.headers["X-Provider"], "keep");
    requests.length = 0;
    routes.set("https://provider.example/start", { status: 307, headers: { location: "/next" } });
    routes.set("https://provider.example/next", { body: "ok" });
    await nativeFetch({ url: "https://provider.example/start", method: "POST", body: "a=1" });
    assert.equal(requests[1].options.method, "POST");
    assert.equal(requests[1].body, "a=1");
  });

  await check("304 and redirects without Location remain original HTTP responses", async () => {
    routes.set("https://provider.example/cached", { status: 304 });
    const cached = await nativeFetch({ url: "https://provider.example/cached" });
    assert.equal(cached.status, 304);
    assert.equal(cached.ok, false);
    routes.set("https://provider.example/no-location", { status: 302, body: "no target" });
    const noTarget = await nativeFetch({ url: "https://provider.example/no-location" });
    assert.equal(noTarget.status, 302);
    assert.equal(noTarget.body, "no target");
    assert.equal(requests.length, 2);
  });

  await check("manual responses retain the bounded binary response contract", async () => {
    routes.set("https://provider.example/start", {
      status: 302,
      headers: { location: "/next" },
      body: "abcdef"
    });
    const result = await nativeFetch({
      url: "https://provider.example/start",
      followRedirects: false,
      maxResponseBytes: 3,
      responseEncoding: "base64"
    });
    assert.equal(result.status, 302);
    assert.equal(result.truncated, true);
    assert.equal(result.body, "abc");
    assert.equal(result.bodyBase64, "YWJj");
    assert.equal(result.headers.location, "/next");
    assert.equal(requests.length, 1);
  });

  await check("redirect changes keep the service restricted to loopback clients", async () => {
    const result = await nativeRequest(
      { url: "https://provider.example/start", followRedirects: false },
      "192.168.1.20"
    );
    assert.equal(result.httpStatus, 403);
    assert.equal(result.returnValue, false);
    assert.equal(requests.length, 0);
  });

  await check(
    "direct transport forwards manual mode and reports browser-hidden targets",
    async () => {
      globalThis.__NUVIO_PLATFORM__ = "vidaa";
      Platform.current = null;
      globalThis.fetch = async (_url, options) => {
        assert.equal(options.redirect, "manual");
        return { type: "opaqueredirect", status: 0, headers: new Headers(), body: null };
      };
      const result = await PluginServiceClient.fetch({
        url: "https://provider.example/start",
        followRedirects: false,
        androidResponseContract: true
      });
      assert.equal(result.status, 0);
      assert.equal(result.ok, false);
      assert.equal(result.headers.location, undefined);
      assert.match(result.statusText, /Browser cannot expose a manual redirect target/);
      await assert.rejects(
        PluginServiceClient.fetch({ url: "https://provider.example/start", redirect: "manual" }),
        /Browser cannot expose a manual redirect target/
      );
      globalThis.fetch = async (_url, options) => {
        assert.equal(options.redirect, "follow");
        return new Response("normal response");
      };
      assert.equal(
        (await PluginServiceClient.fetch({ url: "https://provider.example/start" })).body,
        "normal response"
      );
    }
  );

  console.log(`Plugin redirect compatibility: ${checks} checks passed`);
} finally {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  globalThis.__NUVIO_PLATFORM__ = "vidaa";
  Platform.current = null;
  PluginServiceClient.resetHealthCache();
}
