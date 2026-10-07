import assert from "node:assert/strict";

function memoryStorage() {
  const entries = new Map();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear()
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: "https://official.example",
  NUVIO_SUPABASE_ANON_KEY: "public-test-key"
};
const { Platform } = await import("../js/platform/index.js");
const { ServerConfigurationStore: servers, SERVER_CONFIGURATION_KEY } =
  await import("../js/data/local/serverConfigurationStore.js");
const { createServerConfiguration } = await import("../js/core/server/serverConfiguration.js");
const { AuthManager } = await import("../js/core/auth/authManager.js");
const { SessionStore } = await import("../js/core/storage/sessionStore.js");
const { SupabaseApi } = await import("../js/data/remote/supabase/supabaseApi.js");
const { fetchSupabaseAuth } = await import("../js/core/auth/supabaseAuthFetch.js");
const { AvatarRepository } = await import("../js/data/remote/supabase/avatarRepository.js");
const { MemberAccessRepository } =
  await import("../js/data/remote/supabase/memberAccessRepository.js");
const { MembershipOverviewRepository } =
  await import("../js/data/remote/supabase/membershipOverviewRepository.js");

assert.equal(servers.getActive().isLocal, true);
assert.equal(servers.getActive().backendUrl, "");
assert.equal(servers.getActive().fallbackBackendUrl, "");
assert.equal(servers.useOfficial(), true);
servers.clearCache();
assert.equal(
  servers.getActive().isLocal,
  undefined,
  "Explicit official selection must survive VIDAA reload"
);
assert.equal(servers.getActive().backendUrl, "https://official.example");
const custom = createServerConfiguration({
  backendUrl: "https://personal.example",
  publishableKey: "personal-public-key",
  capabilities: { emailPasswordAuth: true },
  isCustom: true
});
assert.equal(servers.saveCustom(custom), true);
servers.clearCache();
assert.equal(servers.getActive().backendUrl, "https://personal.example");
assert.equal(servers.getActive().fallbackBackendUrl, "");
assert.equal(servers.saveCustom({ isCustom: true }), false);
assert.equal(servers.getActive().backendUrl, "https://personal.example");
const unavailable = { getItem: () => null, setItem: () => {} };
assert.equal(servers.useLocal(unavailable), false);
assert.equal(servers.getActive().isCustom, true);

assert.equal(servers.useLocal(), true);
servers.clearCache();
assert.equal(servers.getActive().isLocal, true);
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error("Unexpected backend request");
};
for (const operation of [
  () => fetchSupabaseAuth("/auth/v1/token"),
  () => SupabaseApi.rpc("get_avatar_catalog", {}, false),
  () => SupabaseApi.select("profiles"),
  () => SupabaseApi.upsert("profiles", []),
  () => SupabaseApi.delete("profiles", "id=eq.test"),
  () => SupabaseApi.downloadStorageObject("avatars", "test.png"),
  () => AuthManager.signInWithEmail("test@example.com", "password")
])
  await assert.rejects(operation, { code: "LOCAL_BACKEND_DISABLED" });

// Old official-account sessions are cleared before local boot; new local data
// survives subsequent boots and requires no anonymous login.
SessionStore.accessToken = "old.account.token";
SessionStore.refreshToken = "old-refresh-token";
SessionStore.isAnonymousSession = false;
localStorage.setItem("profiles", JSON.stringify([{ id: "old" }]));
let signedOutSawOldData = false;
const unsubscribe = AuthManager.subscribe((state) => {
  if (state === "signedOut" && localStorage.getItem("profiles")?.includes("old"))
    signedOutSawOldData = true;
});
await AuthManager.bootstrap();
unsubscribe();
assert.equal(
  signedOutSawOldData,
  false,
  "Old account data must be cleared before the profile UI mounts"
);
assert.equal(AuthManager.isAuthenticated, false);
assert.equal(SessionStore.accessToken, null);
assert.equal(SessionStore.refreshToken, null);
assert.equal(localStorage.getItem("profiles"), null);
localStorage.setItem("profiles", JSON.stringify([{ id: "local" }]));
await AuthManager.bootstrap();
assert.notEqual(localStorage.getItem("profiles"), null);
assert.ok(
  (await AvatarRepository.getAvatarCatalog(true)).every((item) =>
    item.imageUrl.startsWith("assets/")
  )
);
assert.deepEqual((await MemberAccessRepository.getAccess({ force: true })).entitlements, []);
assert.equal(networkCalls, 0);

// A custom instance does not provide the official paid-membership RPCs.
servers.saveCustom(custom);
AuthManager.setState("authenticated");
await MemberAccessRepository.getAccess({ force: true });
const overview = await MembershipOverviewRepository.refresh();
assert.equal(overview.hasError, false);
assert.equal(overview.overview.active, false);
assert.equal(networkCalls, 0);
await AuthManager.prepareForServerSwitch({ resetLocalData: true });
assert.equal(localStorage.getItem("profiles"), null);
assert.equal(servers.getActive().backendUrl, "https://personal.example");

localStorage.removeItem(SERVER_CONFIGURATION_KEY);
globalThis.__NUVIO_PLATFORM__ = "browser";
Platform.current = null;
servers.clearCache();
assert.equal(
  servers.getActive().backendUrl,
  "https://official.example",
  "Other platforms keep their default backend"
);
globalThis.__NUVIO_PLATFORM__ = "vidaa";
Platform.current = null;
servers.clearCache();
assert.equal(servers.getActive().isLocal, true);
console.log(
  "VIDAA local backend: no account requests, server persistence and session reset passed."
);
