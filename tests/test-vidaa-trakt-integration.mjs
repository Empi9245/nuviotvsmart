import assert from "node:assert/strict";

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
  clear: () => stored.clear()
};
globalThis.__NUVIO_PLATFORM__ = "browser";
globalThis.__NUVIO_ENV__ = {
  TRAKT_CLIENT_ID: "test-client",
  TRAKT_CLIENT_SECRET: "test-secret"
};

const { TraktAuthService, requestJson } = await import("../js/data/repository/traktAuthService.js");
const { TraktAuthStore } = await import("../js/data/local/traktAuthStore.js");
const { normalizeTraktTokenLifetimeSeconds } = await import("../js/data/local/traktTokenLifetime.js");
const { ProfileManager } = await import("../js/core/profile/profileManager.js");
const { Platform } = await import("../js/platform/index.js");
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const { TraktScrobbleService } = await import("../js/data/repository/traktScrobbleService.js");
const { TraktClientSettingsStore, getTraktClientCredentials } = await import("../js/data/local/traktClientSettingsStore.js");
const { SettingsScreen } = await import("../js/ui/screens/settings/settingsScreen.js");
const { TraktScreen } = await import("../js/ui/screens/trakt/traktScreen.js");
const { Router } = await import("../js/ui/navigation/routerState.js");
const { authorizedTraktRequest } = await import("../js/data/repository/libraryRepositoryHelpers-03-authorized-trakt-request.js");
const originalFetch = globalThis.fetch;
const originalPluginFetch = PluginServiceClient.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalIsWebOS = Platform.isWebOS;
const originalClearTimeout = globalThis.clearTimeout;
const originalPollDeviceToken = TraktAuthService.pollDeviceToken;
const originalRouterGetCurrent = Router.getCurrent;
const originalGetValidAccessToken = TraktAuthService.getValidAccessToken;
let checks = 0;

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}
function token(access = "access-old", refresh = "refresh-old", expired = true, profileId = "1") {
  TraktAuthStore.saveToken({
    access_token: access,
    refresh_token: refresh,
    created_at: Math.floor(Date.now() / 1000) - (expired ? 200000 : 0),
    expires_in: 86400
  }, profileId);
}
function refreshed() {
  return {
    access_token: "access-new",
    refresh_token: "refresh-new",
    created_at: Math.floor(Date.now() / 1000),
    expires_in: 86400
  };
}
function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 12; index += 1) await new Promise((resolve) => setImmediate(resolve));
}
async function check(name, run) {
  stored.clear();
  TraktScrobbleService.cancel();
  globalThis.__NUVIO_PLATFORM__ = "browser";
  Platform.isWebOS = originalIsWebOS;
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

try {
  await check("custom app credentials are isolated by profile and stay off preference sync", async () => {
    assert.deepEqual(getTraktClientCredentials(), { clientId: "test-client", clientSecret: "test-secret" });
    TraktClientSettingsStore.set({ clientId: "user-client" });
    assert.deepEqual(getTraktClientCredentials(), { clientId: "user-client", clientSecret: "" });
    assert.equal(TraktAuthService.hasRequiredCredentials(), false);
    TraktClientSettingsStore.set({ clientSecret: "user-secret" });
    assert.equal(TraktAuthService.hasRequiredCredentials(), true);
    assert.equal(stored.has("profileSettingsSyncPendingProfiles"), false);
    await ProfileManager.setActiveProfile("2");
    assert.deepEqual(getTraktClientCredentials(), { clientId: "test-client", clientSecret: "test-secret" });
    assert.deepEqual(TraktClientSettingsStore.get(), { clientId: "", clientSecret: "" });
  });

  await check("changing app identity disconnects only that profile and unchanged saves keep auth", async () => {
    TraktClientSettingsStore.set({ clientId: "user-client", clientSecret: "user-secret" });
    token("profile-one", "refresh-one", false);
    token("profile-two", "refresh-two", false, "2");
    TraktClientSettingsStore.set({ clientId: "user-client" });
    assert.equal(TraktAuthStore.get("1").accessToken, "profile-one");
    TraktClientSettingsStore.set({ clientSecret: "replacement-secret" });
    assert.equal(TraktAuthStore.get("1").accessToken, null);
    assert.equal(TraktAuthStore.get("2").accessToken, "profile-two");
  });

  await check("API calls and token exchange use profile credentials without reloading", async () => {
    TraktClientSettingsStore.set({ clientId: "user-client", clientSecret: "user-secret" });
    token();
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers["trakt-api-key"], "user-client");
      if (url.endsWith("/oauth/token")) {
        assert.equal(JSON.parse(options.body).client_id, "user-client");
        assert.equal(JSON.parse(options.body).client_secret, "user-secret");
        return json(refreshed());
      }
      assert.equal(options.headers.Authorization, "Bearer access-new");
      return json([]);
    };
    const accessToken = await TraktAuthService.getValidAccessToken();
    assert.equal((await requestJson("/sync/watchlist", { authorization: `Bearer ${accessToken}` })).response.ok, true);
  });

  await check("integration fields mask credentials and expose clear/save actions", async () => {
    TraktClientSettingsStore.set({ clientId: "hidden-client-value", clientSecret: "hidden-secret-value" });
    const screen = Object.create(SettingsScreen);
    screen.actionMap = new Map();
    const markup = screen.renderIntegrationDetail({}, "trakt");
    assert.equal(markup.includes("hidden-client-value"), false);
    assert.equal(markup.includes("hidden-secret-value"), false);
    screen.actionMap.get("integration:trakt:clientSecret")();
    assert.equal(screen.textDialog.inputType, "password");
    assert.ok(screen.renderTextDialog().includes('type="password"'));
    await screen.textDialog.onSubmit("updated-secret");
    assert.equal(TraktClientSettingsStore.get().clientSecret, "updated-secret");
    await screen.textDialog.onClear();
    assert.equal(TraktClientSettingsStore.get().clientSecret, "");
    assert.equal(TraktAuthService.hasRequiredCredentials(), false);
  });

  await check("honors Trakt's returned expiry instead of extending one-day tokens", async () => {
    assert.equal(normalizeTraktTokenLifetimeSeconds(86400), 86400);
    assert.equal(normalizeTraktTokenLifetimeSeconds(604800), 604800);
    assert.equal(normalizeTraktTokenLifetimeSeconds("invalid"), 0);
    token();
    let requests = 0;
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith("/oauth/token"));
      requests += 1;
      return json(refreshed());
    };
    assert.equal(await TraktAuthService.getValidAccessToken(), "access-new");
    assert.equal(requests, 1);
    assert.equal(TraktAuthStore.get().expiresIn, 86400);
  });

  await check("shares a rotating refresh token across concurrent readers", async () => {
    token();
    const held = gate();
    let requests = 0;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith("/oauth/token"));
      assert.equal(JSON.parse(options.body).refresh_token, "refresh-old");
      requests += 1;
      await held.promise;
      return json(refreshed());
    };
    const readers = Array.from({ length: 12 }, () => TraktAuthService.getValidAccessToken());
    await flush();
    assert.equal(requests, 1);
    held.resolve();
    assert.deepEqual(await Promise.all(readers), Array(12).fill("access-new"));
    assert.equal(TraktAuthStore.get().refreshToken, "refresh-new");
  });

  await check("retries concurrent 401 responses once after a shared refresh", async () => {
    token("access-old", "refresh-old", false);
    let refreshRequests = 0;
    let oldRequests = 0;
    let newRequests = 0;
    globalThis.fetch = async (url, options) => {
      if (url.endsWith("/oauth/token")) {
        refreshRequests += 1;
        await flush();
        return json(refreshed());
      }
      assert.ok(url.endsWith("/sync/watchlist"));
      if (options.headers.Authorization === "Bearer access-old") {
        oldRequests += 1;
        return json({ error: "unauthorized" }, 401);
      }
      assert.equal(options.headers.Authorization, "Bearer access-new");
      newRequests += 1;
      return json([]);
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => requestJson("/sync/watchlist", {
      authorization: "Bearer access-old"
    })));
    assert.ok(results.every(({ response }) => response.ok));
    assert.equal(refreshRequests, 1);
    assert.equal(oldRequests, 8);
    assert.equal(newRequests, 8);
  });

  await check("bounds a persistent unauthorized response to one retry", async () => {
    token("access-old", "refresh-old", false);
    let refreshRequests = 0;
    let apiRequests = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith("/oauth/token")) {
        refreshRequests += 1;
        return json(refreshed());
      }
      apiRequests += 1;
      return json({}, 401);
    };
    const result = await requestJson("/sync/watchlist", { authorization: "Bearer access-old" });
    assert.equal(result.response.status, 401);
    assert.equal(refreshRequests, 1);
    assert.equal(apiRequests, 2);
  });

  await check("preserves auth on temporary or malformed refresh failures", async () => {
    token();
    globalThis.fetch = async () => json({}, 503);
    assert.equal(await TraktAuthService.getValidAccessToken(), null);
    assert.equal(TraktAuthStore.get().refreshToken, "refresh-old");
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(TraktAuthService.getValidAccessToken(), /offline/);
    assert.equal(TraktAuthStore.get().refreshToken, "refresh-old");
    globalThis.fetch = async () => json({ access_token: "missing-refresh" });
    assert.equal(await TraktAuthService.getValidAccessToken(), null);
    assert.equal(TraktAuthStore.get().accessToken, "access-old");
  });

  await check("an explicit invalid grant clears only the requesting profile", async () => {
    token();
    token("profile-two", "refresh-two", false, "2");
    const held = gate();
    globalThis.fetch = async () => { await held.promise; return json({ error: "invalid_grant" }, 400); };
    const reading = TraktAuthService.getValidAccessToken();
    await flush();
    await ProfileManager.setActiveProfile("2");
    held.resolve();
    assert.equal(await reading, null);
    assert.equal(TraktAuthStore.get("1").accessToken, null);
    assert.equal(TraktAuthStore.get("2").accessToken, "profile-two");
  });

  await check("a profile switch never receives or stores another profile's token", async () => {
    token();
    token("profile-two", "refresh-two", false, "2");
    const held = gate();
    globalThis.fetch = async () => { await held.promise; return json(refreshed()); };
    const reading = TraktAuthService.getValidAccessToken();
    await flush();
    await ProfileManager.setActiveProfile("2");
    held.resolve();
    assert.equal(await reading, null);
    assert.equal(TraktAuthStore.get("1").accessToken, "access-new");
    assert.equal(TraktAuthStore.get("2").accessToken, "profile-two");
  });

  for (const [name, load, count, entry] of [
    ["watched movies", () => TraktAuthService.fetchWatchedMovies(), 250, { movie: { title: "Movie", ids: { imdb: "tt1234567" } } }],
    ["watched shows", () => TraktAuthService.fetchWatchedShows(), 100, { show: { title: "Show", ids: { imdb: "tt1234567" } } }],
    ["watchlist", () => TraktAuthService.fetchWatchlist({ limit: 200 }), 100, { type: "movie", listed_at: "2026-10-09T00:00:00Z", movie: { ids: { imdb: "tt1234567" } } }],
    ["history", () => TraktAuthService.fetchWatchHistory({ limit: 200 }), 100, { watched_at: "2026-10-09T00:00:00Z", movie: { ids: { imdb: "tt1234567" } } }]
  ]) {
    await check(`${name} pagination aborts before mixing two profiles' app credentials`, async () => {
      TraktClientSettingsStore.set({ clientId: "client-one", clientSecret: "secret-one" }, "1");
      TraktClientSettingsStore.set({ clientId: "client-two", clientSecret: "secret-two" }, "2");
      token("profile-one", "refresh-one", false);
      token("profile-two", "refresh-two", false, "2");
      let requests = 0;
      globalThis.fetch = async (_url, options) => {
        requests += 1;
        assert.equal(options.headers["trakt-api-key"], "client-one");
        assert.equal(options.headers.Authorization, "Bearer profile-one");
        const response = json(Array(count).fill(entry), 200, { "X-Pagination-Page-Count": "2" });
        const getHeader = response.headers.get.bind(response.headers);
        response.headers.get = (header) => {
          if (header.toLowerCase() === "x-pagination-page-count") stored.set("activeProfileId", JSON.stringify("2"));
          return getHeader(header);
        };
        if (name === "watchlist" || name === "history") {
          await ProfileManager.setActiveProfile("2");
        }
        return response;
      };
      await assert.rejects(load(), { name: "AbortError" });
      assert.equal(requests, 1);
    });
  }

  for (const [name, load] of [
    ["watched movies", () => TraktAuthService.fetchWatchedMovies()],
    ["library request", () => authorizedTraktRequest("/sync/watchlist")]
  ]) {
    await check(`${name} keeps its profile across the token await`, async () => {
      TraktClientSettingsStore.set({ clientId: "client-one", clientSecret: "secret-one" }, "1");
      TraktClientSettingsStore.set({ clientId: "client-two", clientSecret: "secret-two" }, "2");
      let requests = 0;
      globalThis.fetch = async () => { requests += 1; return json([]); };
      TraktAuthService.getValidAccessToken = async (profileId) => {
        assert.equal(profileId, "1");
        await ProfileManager.setActiveProfile("2");
        return "profile-one";
      };
      await assert.rejects(load(), { name: "AbortError" });
      assert.equal(requests, 0);
      TraktAuthService.getValidAccessToken = originalGetValidAccessToken;
    });
  }

  await check("an older refresh cannot replace a newer login or disconnect", async () => {
    token();
    let held = gate();
    globalThis.fetch = async () => { await held.promise; return json(refreshed()); };
    const oldRefresh = TraktAuthService.getValidAccessToken();
    await flush();
    token("new-login", "new-login-refresh", false);
    held.resolve();
    assert.equal(await oldRefresh, "new-login");
    assert.equal(TraktAuthStore.get().accessToken, "new-login");
    token();
    held = gate();
    globalThis.fetch = async (url) => {
      if (url.endsWith("/oauth/revoke")) return json({});
      await held.promise;
      return json(refreshed());
    };
    const beforeDisconnect = TraktAuthService.getValidAccessToken();
    await flush();
    await TraktAuthService.disconnect();
    held.resolve();
    assert.equal(await beforeDisconnect, null);
    assert.equal(TraktAuthStore.isAuthenticated(), false);
  });

  await check("device approval survives an optional username lookup failure", async () => {
    TraktAuthStore.saveDeviceFlow({ device_code: "device", user_code: "USER", expires_in: 60 });
    globalThis.fetch = async (url) => {
      if (url.endsWith("/oauth/device/token")) return json(refreshed());
      throw new Error("temporary lookup failure");
    };
    assert.deepEqual(await TraktAuthService.pollDeviceToken(), { type: "approved", username: null });
    assert.equal(TraktAuthStore.isAuthenticated(), true);
  });

  await check("a late username lookup cannot overwrite a newer account", async () => {
    token("old-account", "old-refresh", false);
    const held = gate();
    globalThis.fetch = async () => { await held.promise; return json({ user: { username: "old-user", ids: { slug: "old-user" } } }); };
    const lookup = TraktAuthService.fetchUserSettings();
    await flush();
    token("new-account", "new-refresh", false);
    TraktAuthStore.saveUser({ username: "new-user", userSlug: "new-user" });
    held.resolve();
    assert.equal(await lookup, null);
    assert.equal(TraktAuthStore.get().username, "new-user");
  });

  await check("cancelled device authentication cannot save a late approval", async () => {
    TraktAuthStore.saveDeviceFlow({ device_code: "device", user_code: "USER", expires_in: 60 });
    const held = gate();
    globalThis.fetch = async () => { await held.promise; return json(refreshed()); };
    const polling = TraktAuthService.pollDeviceToken();
    await flush();
    TraktAuthStore.clearDeviceFlow();
    held.resolve();
    assert.deepEqual(await polling, { type: "cancelled" });
    assert.equal(TraktAuthStore.isAuthenticated(), false);
  });

  await check("TV fallback preserves OAuth errors and pagination headers", async () => {
    globalThis.__NUVIO_PLATFORM__ = "webos";
    Platform.isWebOS = () => true;
    globalThis.fetch = async () => { throw new TypeError("browser transport unavailable"); };
    PluginServiceClient.fetch = async (request) => {
      assert.equal(request.url, "https://api.trakt.tv/oauth/device/token");
      assert.equal(request.method, "POST");
      assert.equal(request.headers["trakt-api-key"], "test-client");
      assert.deepEqual(JSON.parse(request.body), { code: "test-device" });
      return { status: 400, body: JSON.stringify({ error: "authorization_pending" }), headers: { "x-pagination-page-count": "3" } };
    };
    assert.equal(Platform.isWebOS(), true);
    const result = await requestJson("/oauth/device/token", { method: "POST", body: { code: "test-device" } });
    assert.equal(result.response.status, 400);
    assert.equal(result.response.headers.get("X-Pagination-Page-Count"), "3");
    assert.equal(result.payload.error, "authorization_pending");
    PluginServiceClient.fetch = originalPluginFetch;
  });

  await check("missing credentials fail before starting a network request", async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests += 1; return json([]); };
    await assert.rejects(requestJson("/sync/watchlist", { clientId: "" }), /Integrations > Trakt/);
    assert.equal(requests, 0);
  });

  for (const [route, prototype] of [["settings", SettingsScreen], ["trakt", TraktScreen]]) {
    await check(`${route} polling honors the interval, ignores re-entry and discards cancelled responses`, async () => {
      TraktAuthStore.saveDeviceFlow({ device_code: "device", user_code: "USER", expires_in: 60, interval: 5 });
      const timers = new Map();
      let nextTimer = 0;
      globalThis.setTimeout = (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; };
      globalThis.clearTimeout = (id) => timers.delete(id);
      Router.getCurrent = () => route;
      const screen = Object.create(prototype);
      screen.activeSection = "trakt";
      let renders = 0;
      let requests = 0;
      let nextResponse = Promise.resolve({ type: "pending" });
      screen.render = async () => { renders += 1; screen.startTraktPolling(); };
      TraktAuthService.pollDeviceToken = () => { requests += 1; return nextResponse; };
      screen.startTraktPolling();
      screen.startTraktPolling();
      assert.equal(requests, 0);
      assert.equal(timers.size, 1);
      let [id, timer] = [...timers][0];
      assert.equal(timer.ms, 5000);
      timers.delete(id);
      timer.callback();
      await flush();
      assert.equal(requests, 1);
      assert.equal(renders, 1);
      assert.equal(timers.size, 1);
      const held = gate();
      nextResponse = held.promise;
      [id, timer] = [...timers][0];
      timers.delete(id);
      timer.callback();
      await flush();
      screen.startTraktPolling();
      assert.equal(requests, 2);
      screen.stopTraktPolling();
      held.resolve({ type: "approved", username: "test-user" });
      await flush();
      assert.equal(renders, 1);
      assert.equal(timers.size, 0);
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      TraktAuthService.pollDeviceToken = originalPollDeviceToken;
      Router.getCurrent = originalRouterGetCurrent;
    });
  }

  await check("pause saves progress without prematurely marking watched", async () => {
    token("access-old", "refresh-old", false);
    let requestedPath = "";
    globalThis.fetch = async (url) => { requestedPath = url; return json({ action: "pause" }); };
    TraktScrobbleService.pause({ contentType: "movie", imdbId: "tt1234567", progressPercent: 90 });
    await flush();
    assert.equal(requestedPath, "https://api.trakt.tv/scrobble/pause");
    assert.equal(stored.has("watchedItems"), false);
  });

  await check("new playback resumes tracking after three transient failures", async () => {
    token("access-old", "refresh-old", false);
    let requests = 0;
    let fail = true;
    globalThis.fetch = async () => {
      requests += 1;
      return json({ action: "start" }, fail ? 503 : 200);
    };
    const context = { contentType: "movie", imdbId: "tt1234567", progressPercent: 25 };
    for (let index = 0; index < 4; index += 1) {
      TraktScrobbleService.stop(context);
      await flush();
    }
    assert.equal(requests, 3);
    fail = false;
    globalThis.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, ms === 15000 ? 0 : ms, ...args);
    TraktScrobbleService.start(context);
    await new Promise((resolve) => originalSetTimeout(resolve, 10));
    await flush();
    assert.equal(requests, 4);
    globalThis.setTimeout = originalSetTimeout;
  });
} finally {
  TraktScrobbleService.cancel();
  globalThis.fetch = originalFetch;
  PluginServiceClient.fetch = originalPluginFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  TraktAuthService.pollDeviceToken = originalPollDeviceToken;
  Router.getCurrent = originalRouterGetCurrent;
  TraktAuthService.getValidAccessToken = originalGetValidAccessToken;
  Platform.isWebOS = originalIsWebOS;
}

console.log(`Trakt integration: ${checks} checks passed`);
