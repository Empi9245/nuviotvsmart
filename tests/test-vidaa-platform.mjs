import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("=== Running Nuvio TV VIDAA Platform Tests ===");

// 1. Test platform detection & adapter methods
{
  console.log("\n[Test 1] Platform detection and adapter interface");

  // Mock global browser environment
  globalThis.__NUVIO_PLATFORM__ = "vidaa";
  globalThis.document = {
    head: { appendChild: () => {} },
    querySelector: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    documentElement: { classList: { add: () => {} } },
    body: { classList: { add: () => {} } },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };
  globalThis.location = { search: "" };
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Mozilla/5.0 (VIDAA/7.0; Hisense 65U7Q)" },
    configurable: true,
    writable: true
  });

  let exitCalled = false;
  globalThis.Hisense_Exit = () => {
    exitCalled = true;
  };
  globalThis.Hisense_GetModelName = () => "Hisense 65U7Q";
  globalThis.Hisense_GetOSVersion = () => "VIDAA U7";

  let platformMessageSent = null;
  globalThis.omi_platform = {
    sendPlatformMessage: (jsonStr) => {
      platformMessageSent = JSON.parse(jsonStr);
    }
  };

  const { Platform } = await import("../js/platform/index.js");
  Platform.current = null; // force re-evaluation

  assert.equal(Platform.getName(), "vidaa", "Platform name must be vidaa");
  assert.equal(Platform.isVidaa(), true, "Platform.isVidaa() must return true");
  assert.equal(Platform.isTizen(), false, "Platform.isTizen() must return false on vidaa");
  assert.equal(Platform.isWebOS(), false, "Platform.isWebOS() must return false on vidaa");
  assert.equal(Platform.isBrowser(), false, "Platform.isBrowser() must return false on vidaa");

  // Capabilities
  const caps = Platform.getCapabilities();
  assert.equal(caps.nativeVideo, true, "nativeVideo capability must be true");
  assert.equal(caps.vidaaPlayer, true, "vidaaPlayer capability must be true");

  // Device label
  const label = Platform.getDeviceLabel();
  assert.ok(label.includes("65U7Q"), `Device label should include model: ${label}`);

  // Exit App
  Platform.exitApp();
  assert.equal(exitCalled, true, "Hisense_Exit must be called on exitApp()");

  // Back event detection
  assert.equal(
    Platform.isBackEvent({ keyCode: 8 }),
    true,
    "KeyCode 8 (Backspace) must be back event"
  );
  assert.equal(
    Platform.isBackEvent({ keyCode: 461 }),
    true,
    "KeyCode 461 (webOS/VIDAA back) must be back event"
  );
  assert.equal(
    Platform.isBackEvent({ keyCode: 10009 }),
    true,
    "KeyCode 10009 (Tizen/VIDAA back) must be back event"
  );
  assert.equal(
    Platform.isBackEvent({ keyCode: 27 }),
    true,
    "KeyCode 27 (Escape) must be back event"
  );
  assert.equal(Platform.isBackEvent({ key: "Back" }), true, "Key 'Back' must be back event");
  assert.equal(Platform.isBackEvent({ key: "GoBack" }), true, "Key 'GoBack' must be back event");
  assert.equal(
    Platform.isBackEvent({ keyCode: 13 }),
    false,
    "KeyCode 13 (Enter) must NOT be back event"
  );

  // Key normalization
  const normalizedEnter = Platform.normalizeKey({ keyCode: 13, key: "Enter" });
  assert.equal(normalizedEnter.isEnter, true, "Enter key must normalize to isEnter: true");

  const normalizedBack = Platform.normalizeKey({ keyCode: 461 });
  assert.equal(normalizedBack.isBack, true, "Keycode 461 must normalize to isBack: true");

  // Native player handoff
  const handoffSuccess = Platform.launchNativePlayer(
    "https://example.com/movie.mkv",
    "Sample Movie"
  );
  assert.equal(handoffSuccess, true, "launchNativePlayer must succeed via omi_platform");
  assert.equal(
    platformMessageSent?.type,
    "launchNativePlayer",
    "Platform message type must be launchNativePlayer"
  );
  assert.equal(
    platformMessageSent?.url,
    "https://example.com/movie.mkv",
    "Platform message url must match"
  );
  assert.equal(platformMessageSent?.title, "Sample Movie", "Platform message title must match");
  assert.equal(
    platformMessageSent?.mimeType,
    "video/x-matroska",
    "MKV mimeType must be video/x-matroska"
  );

  console.log("✓ Platform detection and adapter methods passed");
}

// 2. Test Environment abstraction
{
  console.log("\n[Test 2] Environment abstraction");
  const { Environment } = await import("../js/platform/environment.js");
  assert.equal(Environment.isVidaa(), true, "Environment.isVidaa() must return true");
  assert.equal(Environment.isWebOS(), false, "Environment.isWebOS() must return false");
  assert.equal(Environment.isTizen(), false, "Environment.isTizen() must return false");
  console.log("✓ Environment abstraction passed");
}

// 3. Test Plugin Policy on VIDAA
{
  console.log("\n[Test 3] Plugin Policy on VIDAA");
  globalThis.Worker = class DummyWorker {};
  globalThis.WebAssembly = {};

  const { getPluginCapabilitySnapshot } = await import("../js/core/player/pluginPolicy.js");
  const snapshot = getPluginCapabilitySnapshot();

  assert.equal(snapshot.platform, "vidaa", "Snapshot platform must be vidaa");
  assert.equal(snapshot.appSupported, true, "appSupported must be true on VIDAA");
  assert.equal(snapshot.normalAddonsSupported, true, "normalAddonsSupported must be true on VIDAA");
  assert.equal(snapshot.candidate, true, "candidate must be true on VIDAA");
  assert.equal(snapshot.precheckPassed, true, "precheckPassed must be true on VIDAA");

  console.log("✓ Plugin Policy passed");
}

// 4. Test Plugin Service Client on VIDAA
{
  console.log("\n[Test 4] Plugin Service Client on VIDAA");
  const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
  const health = await PluginServiceClient.health({ force: true });

  assert.equal(health.returnValue, true, "PluginServiceClient health must be true on VIDAA");
  assert.equal(health.status, "vidaa", "Health status must be vidaa");
  assert.equal(health.workerSupport, true, "workerSupport must be true");

  console.log("✓ Plugin Service Client passed");
}

// 5. Test Virtual Keyboard Fix
{
  console.log("\n[Test 5] VIDAA Virtual Keyboard Input Bug Fix");

  // Create a mock HTMLInputElement prototype
  class MockInput {
    constructor() {
      this._val = "";
      this.events = [];
    }
    get value() {
      return this._val;
    }
    set value(v) {
      this._val = v;
    }
    dispatchEvent(ev) {
      this.events.push(ev.type);
    }
  }
  globalThis.HTMLInputElement = MockInput;

  // Run the keyboard fix installer
  const { vidaaAdapter } = await import("../js/platform/adapters/vidaaAdapter.js");
  globalThis.__NUVIO_VIDAA_KEYBOARD_FIX_INSTALLED__ = false; // reset for test
  vidaaAdapter.init();

  const testInput = new MockInput();
  // Simulate the VIDAA OS keyboard assigning value directly
  testInput.value = "Avatar";

  assert.equal(testInput.value, "Avatar", "Input value must update to 'Avatar'");
  assert.ok(testInput.events.includes("input"), "Synthetic 'input' event must be dispatched");
  assert.ok(testInput.events.includes("change"), "Synthetic 'change' event must be dispatched");

  console.log("✓ Virtual keyboard bug fix verified");
}

// 6. Test Build and Package Artifacts
{
  console.log("\n[Test 6] Build and Packaging Verification");

  const vidaaDistDir = path.join(rootDir, "dist", "vidaa");
  const zipPath = path.join(rootDir, "dist", "nuvio-vidaa.zip");

  const requiredFiles = [
    path.join(vidaaDistDir, "index.html"),
    path.join(vidaaDistDir, "sw.js"),
    path.join(vidaaDistDir, "manifest.json"),
    path.join(vidaaDistDir, "app.bundle.js"),
    path.join(vidaaDistDir, "core-js.bundle.js"),
    path.join(vidaaDistDir, "boot-guard.js"),
    path.join(vidaaDistDir, "installer", "server.py"),
    path.join(vidaaDistDir, "installer", "index.html"),
    path.join(vidaaDistDir, "installer", "README.md")
  ];

  for (const filePath of requiredFiles) {
    const s = await fs.stat(filePath).catch(() => null);
    assert.ok(s && s.isFile(), `Required file must exist: ${filePath}`);
  }

  const zipStat = await fs.stat(zipPath).catch(() => null);
  assert.ok(
    zipStat && zipStat.size > 1000000,
    `nuvio-vidaa.zip must exist and be > 1MB (${zipStat?.size} bytes)`
  );

  // Verify index.html contains the VIDAA bootloader script
  const indexContent = await fs.readFile(path.join(vidaaDistDir, "index.html"), "utf8");
  assert.ok(
    indexContent.includes("configureVidaaLaunch"),
    "index.html must include configureVidaaLaunch"
  );
  assert.ok(indexContent.includes("sw.js"), "index.html must register sw.js");
  assert.ok(indexContent.includes("manifest.json"), "index.html must link manifest.json");

  console.log(
    `✓ Packaging verified: nuvio-vidaa.zip is ${(zipStat.size / (1024 * 1024)).toFixed(2)} MB`
  );
}

// 7. Test TV Runtime Performance Profile & Default Supabase Env
{
  console.log("\n[Test 7] TV Runtime Performance Profile & Default Backend Configuration");
  const { getTvRuntimePerformanceProfile, resetTvRuntimePerformanceProfile } =
    await import("../js/platform/tvRuntimePerformance.js");
  resetTvRuntimePerformanceProfile();
  const profile = getTvRuntimePerformanceProfile({ forceRefresh: true });

  assert.equal(profile.isTvRuntime, true, "profile.isTvRuntime must be true on VIDAA");
  assert.equal(profile.platform, "vidaa", "profile.platform must be 'vidaa'");
  assert.equal(
    profile.isPerformanceConstrained,
    true,
    "profile.isPerformanceConstrained must be true to enable immediate focus scroll"
  );

  const { readEnvProperties } = await import("../scripts/envProperties.mjs");
  const envResult = await readEnvProperties({ rootDir });
  assert.equal(
    envResult.env.NUVIO_SUPABASE_URL,
    "https://api.nuvio.tv",
    "Default NUVIO_SUPABASE_URL must be https://api.nuvio.tv"
  );
  assert.ok(
    envResult.env.NUVIO_SUPABASE_ANON_KEY.length > 20,
    "Default NUVIO_SUPABASE_ANON_KEY must be populated"
  );

  console.log("✓ TV Runtime Profile & Default Backend Configuration passed");
}

console.log("\n=======================================================");
console.log("  ALL VIDAA OS PORT TESTS PASSED SUCCESSFULLY! (7/7)");
console.log("=======================================================\n");
