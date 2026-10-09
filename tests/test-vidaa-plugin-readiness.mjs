import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.Worker = class {};
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { getPluginCapabilitySnapshot } = await import("../js/core/player/pluginPolicy.js");
const { Platform } = await import("../js/platform/index.js");
const { TizenCapabilities } = await import("../js/platform/tizen/tizenCapabilities.js");
const { TizenPluginService } = await import("../js/platform/tizen/tizenPluginService.js");

test("VIDAA direct transport can be ready without claiming a native network service", async () => {
  const health = await PluginServiceClient.ensureReady({ force: true });
  assert.equal(health.returnValue, true);
  assert.equal(health.networkMode, "browser");
  assert.equal(health.networkBoundary, false);
  assert.equal(health.serviceVersion, undefined);
  assert.equal(PluginServiceClient.getService(), null);
  const capabilities = getPluginCapabilitySnapshot();
  assert.equal(capabilities.candidate, true);
  assert.equal(capabilities.executable, false, "execution still needs the real worker self-test");
  assert.equal(capabilities.pluginServicePackaged, false);
});

test("VIDAA readiness fails when a required host API is absent", async () => {
  for (const [name, expected] of [
    ["Worker", /Worker and WebAssembly/],
    ["WebAssembly", /Worker and WebAssembly/],
    ["fetch", /Fetch API/]
  ]) {
    const original = globalThis[name];
    try {
      globalThis[name] = undefined;
      await assert.rejects(PluginServiceClient.ensureReady({ force: true }), expected);
    } finally {
      globalThis[name] = original;
      PluginServiceClient.resetHealthCache();
    }
  }
});

test("development browser opt-in works but normal browser execution remains disabled", async () => {
  globalThis.__NUVIO_PLATFORM__ = "browser";
  Platform.current = null;
  try {
    await assert.rejects(PluginServiceClient.ensureReady({ force: true }), /No packaged TV/);
    globalThis.__NUVIO_ALLOW_BROWSER_PLUGIN_RUNTIME__ = true;
    const health = await PluginServiceClient.ensureReady({ force: true });
    assert.equal(health.networkMode, "browser");
    assert.equal(health.networkBoundary, false);
  } finally {
    delete globalThis.__NUVIO_ALLOW_BROWSER_PLUGIN_RUNTIME__;
    globalThis.__NUVIO_PLATFORM__ = "vidaa";
    Platform.current = null;
    PluginServiceClient.resetHealthCache();
  }
});

test("Tizen keeps the native service protocol and network boundary check", async (context) => {
  context.mock.method(Platform, "isTizen", () => true);
  context.mock.method(TizenCapabilities, "canUsePlugins", () => true);
  const health = {
    returnValue: true,
    protocolVersion: 1,
    serviceVersion: 1,
    runtimeVersion: "1.0.0",
    quickjsVersion: "0.32.0",
    workerSupport: true,
    maxConcurrency: 10,
    memoryTier: "bounded",
    jsPluginCapability: true,
    networkBoundary: true
  };
  context.mock.method(TizenPluginService, "health", async () => ({ ...health }));
  assert.equal((await PluginServiceClient.ensureReady({ force: true })).networkBoundary, true);
  health.networkBoundary = false;
  health.networkMode = "browser";
  await assert.rejects(PluginServiceClient.ensureReady({ force: true }), /incompatible/);
  PluginServiceClient.resetHealthCache();
});
