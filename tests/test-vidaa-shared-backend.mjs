import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readEnvProperties, normalizeEnvProperties } from "../scripts/envProperties.mjs";

const nativeFetch = globalThis.fetch;
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { env } = await readEnvProperties({ rootDir });
const live = process.argv.includes("--live");
const key = env.NUVIO_SUPABASE_ANON_KEY;
const url = env.NUVIO_SUPABASE_URL;
function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
    clear: () => values.clear()
  };
}
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.__NUVIO_ENV__ = env;
const { ServerConfigurationStore: servers, SERVER_CONFIGURATION_KEY } =
  await import("../js/data/local/serverConfigurationStore.js");
const { AuthManager: auth } = await import("../js/core/auth/authManager.js");
const { SessionStore: session } = await import("../js/core/storage/sessionStore.js");
const { SupabaseApi: api } = await import("../js/data/remote/supabase/supabaseApi.js");
const { MemberAccessRepository } =
  await import("../js/data/remote/supabase/memberAccessRepository.js");
const { MembershipOverviewRepository } =
  await import("../js/data/remote/supabase/membershipOverviewRepository.js");
const { createAuthQrSignInScreenMethods01 } =
  await import("../js/ui/screens/account/authQrSignInScreenMethods-01-mount.js");
const { createAuthQrSignInScreenMethods03 } =
  await import("../js/ui/screens/account/authQrSignInScreenMethods-03-to-friendly-email-error.js");
const methods = { ...createAuthQrSignInScreenMethods01(), ...createAuthQrSignInScreenMethods03() };
const jwt = (sub) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;

assert.equal(servers.getActive().isShared, true);
assert.equal(servers.getActive().fallbackBackendUrl, "");
assert.equal(servers.getActive().capabilities.tvLogin, false);
localStorage.setItem(SERVER_CONFIGURATION_KEY, JSON.stringify({ isLocal: true }));
servers.clearCache();
assert.equal(
  servers.getActive().isShared,
  true,
  "Old local mode must not disconnect the shared project"
);
assert.equal(servers.useLocal(), false);
assert.equal(servers.saveCustom({ isCustom: true }), false);
for (const privileged of [
  "sb_secret_example",
  `x.${Buffer.from('{"role":"service_role"}').toString("base64url")}.x`,
  " sb_secret_example "
]) {
  assert.throws(() => normalizeEnvProperties({ ...env, NUVIO_SUPABASE_ANON_KEY: privileged }));
}
assert.throws(() => normalizeEnvProperties({ ...env, NUVIO_SUPABASE_ANON_KEY: "" }));
assert.throws(() => normalizeEnvProperties({ ...env, NUVIO_SUPABASE_URL: "http://example.com" }));
localStorage.setItem("profiles", '[{"id":"old"}]');
session.accessToken = jwt("old");
session.refreshToken = "old";
await auth.bootstrap();
assert.equal(session.accessToken, null);
assert.equal(localStorage.getItem("profiles"), null);

if (!live) {
  const calls = [];
  let response = {};
  let status = 200;
  globalThis.fetch = async (requestUrl, init) => {
    assert.ok(requestUrl.startsWith(`${url}/`), "Only our backend may receive account requests");
    assert.equal(init.headers.apikey, key);
    assert.ok(!String(init.headers.Authorization || "").includes("sb_publishable_"));
    calls.push({ url: requestUrl, init });
    return new Response(JSON.stringify(response), { status });
  };
  response = { user: { id: "new" } };
  assert.deepEqual(await auth.signUpWithEmail("new@example.com", "valid-password"), {
    confirmationRequired: true
  });
  assert.equal(auth.isAuthenticated, false);
  assert.equal(session.accessToken, null);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
    email: "new@example.com",
    password: "valid-password"
  });
  response = { message: "Email not confirmed" };
  status = 400;
  await assert.rejects(
    () => auth.signInWithEmail("new@example.com", "valid-password"),
    /Email not confirmed/
  );
  response = { message: "Invalid login credentials" };
  await assert.rejects(
    () => auth.signInWithEmail("new@example.com", "wrong-password"),
    /Invalid login/
  );
  response = { access_token: jwt("new"), refresh_token: "refresh-new" };
  status = 200;
  await auth.signInWithEmail("new@example.com", "valid-password");
  assert.equal(auth.isAuthenticated, true);
  assert.equal(await auth.refreshSessionIfNeeded({ force: true }), true);
  response = [];
  await api.rpc("get_avatar_catalog", {}, false);
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
  await api.select("profiles");
  assert.equal(calls.at(-1).init.headers.Authorization, `Bearer ${session.accessToken}`);
  const count = calls.length;
  await MemberAccessRepository.getAccess({ force: true });
  assert.equal((await MembershipOverviewRepository.refresh()).hasError, false);
  assert.equal(calls.length, count, "Membership must not contact the original backend");
  localStorage.setItem("profiles", '[{"id":"new"}]');
  await auth.signOut();
  assert.equal(localStorage.getItem("profiles"), null);
  assert.equal(session.accessToken, null);
  // Immediate sessions remain supported when Auth explicitly returns one.
  response = { access_token: jwt("immediate"), refresh_token: "refresh-immediate" };
  assert.deepEqual(await auth.signUpWithEmail("new@example.com", "valid-password"), {
    confirmationRequired: false
  });
  await auth.signOut();
  // Late replies from a cancelled request cannot install a session.
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = auth.signUpWithEmail("new@example.com", "valid-password");
  auth.sessionGeneration++;
  release(new Response(JSON.stringify(response)));
  await assert.rejects(() => pending, /cancelled/);
  assert.equal(session.accessToken, null);
  const form = methods.renderLoginContent.call({
    serverConfiguration: servers.getActive(),
    useEmailLogin: true,
    isSignedIn: false,
    email: "",
    password: "",
    isRegistering: true
  });
  assert.ok(form.includes('data-action="email-mode"'));
  assert.ok(!form.includes("qr-image"));
  const { getLatestAppUpdate } = await import("../js/core/update/appUpdateService.js");
  assert.equal(
    await getLatestAppUpdate({
      fetchImpl: () => {
        throw new Error("No upstream update requests in shared builds");
      }
    }),
    null
  );
  console.log(
    "PASS shared backend: fixed project, public keys, confirmation, login, refresh, cancellation, logout and membership guards."
  );
} else {
  globalThis.fetch = nativeFetch;
  const fixtures = JSON.parse(
    await readFile(new URL("../.cache/shared-backend-test-accounts.json", import.meta.url), "utf8")
  );
  assert.equal(fixtures.projectUrl, url);
  assert.equal(fixtures.accounts.length, 2);
  const [a, b] = fixtures.accounts;
  const request = async (path, body, token = session.accessToken, method = "POST") => {
    const result = await nativeFetch(`${url}${path}`, {
      method,
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Prefer: "return=representation"
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: result.status, body: await result.json().catch(() => null) };
  };
  const settings = await request("/auth/v1/settings", null, null, "GET");
  assert.equal(
    settings.body.mailer_autoconfirm,
    process.argv.includes("--no-email-confirmation"),
    "Email confirmation must match the requested project configuration"
  );
  assert.equal(settings.body.disable_signup, false);
  if (settings.body.mailer_autoconfirm) {
    const email = `vidaa-signup-${randomUUID()}@example.com`;
    const password = randomBytes(24).toString("base64url");
    assert.deepEqual(await auth.signUpWithEmail(email, password), { confirmationRequired: false });
    const id = await auth.getEffectiveUserId();
    await writeFile(
      new URL("../.cache/shared-backend-signup.json", import.meta.url),
      JSON.stringify({ id, email })
    );
    const { ProfileManager } = await import("../js/core/profile/profileManager.js");
    const { ProfileSyncService } = await import("../js/core/profile/profileSyncService.js");
    assert.equal((await ProfileManager.getProfiles())[0].profileIndex, 1);
    assert.equal(await ProfileSyncService.push(), true);
    assert.equal((await api.rpc("sync_pull_profiles"))[0].profile_index, 1);
    await auth.signOut();
    await auth.signInWithEmail(email, password);
    assert.equal(await auth.getEffectiveUserId(), id);
    await auth.signOut();
    console.log(
      "PASS LIVE signup: real registration, immediate session, default profile and subsequent login; no email sent."
    );
  }
  assert.ok((await api.rpc("get_avatar_catalog", {}, false)).length > 0);
  for (const account of fixtures.accounts) {
    await auth.signInWithEmail(account.email, account.password);
    assert.equal(await auth.getEffectiveUserId(), account.id);
    assert.equal(await auth.refreshSessionIfNeeded({ force: true }), true);
    await api.rpc("register_current_device", {
      p_installation_id: `vidaa-test-${account.id}`,
      p_client_name: "Nuvio TV",
      p_client_version: "1.2.0",
      p_platform: "vidaa",
      p_device_name: "Integration test"
    });
    assert.ok((await api.rpc("list_my_sessions")).some((s) => s.is_current));
    await api.rpc("sync_push_profiles", {
      p_profiles: [
        {
          profile_index: 1,
          name: `Test ${account.label}`,
          avatar_color_hex: "#1E88E5",
          uses_primary_addons: false,
          uses_primary_plugins: false
        },
        {
          profile_index: 2,
          name: `Second ${account.label}`,
          uses_primary_addons: false,
          uses_primary_plugins: false
        }
      ],
      p_client_max_profiles: 4,
      p_origin_client_id: "vidaa-integration"
    });
    await api.rpc("sync_push_addons", {
      p_profile_id: 1,
      p_addons: [
        {
          url: `https://${account.label.toLowerCase()}.example.com/manifest.json`,
          name: `Addon ${account.label}`,
          enabled: true,
          sort_order: 0
        }
      ],
      p_origin_client_id: "vidaa-integration"
    });
    await api.rpc("sync_push_library_items", {
      p_profile_id: 1,
      p_items: [
        {
          content_id: "vidaa-test",
          content_type: "movie",
          name: `Library ${account.label}`,
          added_at: Date.now(),
          user_id: account.id === a.id ? b.id : a.id
        }
      ],
      p_origin_client_id: "vidaa-integration"
    });
    await api.rpc("sync_push_watch_progress", {
      p_profile_id: 1,
      p_entries: [
        {
          content_id: "vidaa-test",
          content_type: "movie",
          video_id: "vidaa-test",
          position: account.label === "A" ? 90000 : 180000,
          duration: 1800000,
          last_watched: Date.now(),
          user_id: account.id === a.id ? b.id : a.id
        }
      ],
      p_origin_client_id: "vidaa-integration"
    });
    await api.rpc("sync_push_library_items", {
      p_profile_id: 2,
      p_items: [
        {
          content_id: "profile-two",
          content_type: "movie",
          name: `Profile two ${account.label}`,
          added_at: Date.now()
        }
      ],
      p_origin_client_id: "vidaa-integration"
    });
    localStorage.setItem("profiles", JSON.stringify([{ name: account.label }]));
    await auth.signOut();
    assert.equal(localStorage.getItem("profiles"), null);
  }
  for (const account of fixtures.accounts) {
    const other = account.id === a.id ? b : a;
    await auth.signInWithEmail(account.email, account.password);
    const profiles = await api.rpc("sync_pull_profiles");
    assert.equal(profiles.length, 2);
    assert.ok(profiles.every((p) => p.user_id === account.id));
    assert.equal(profiles[0].name, `Test ${account.label}`);
    const addons = await api.select("addons", "select=*&profile_id=eq.1");
    assert.equal(addons.length, 1);
    assert.equal(addons[0].name, `Addon ${account.label}`);
    const library = await api.rpc("sync_pull_library", { p_profile_id: 1 });
    assert.equal(library.length, 1);
    assert.equal(library[0].name, `Library ${account.label}`);
    assert.equal(
      (await api.rpc("sync_pull_library", { p_profile_id: 2 }))[0].content_id,
      "profile-two"
    );
    const progress = await api.rpc("sync_pull_watch_progress", { p_profile_id: 1 });
    assert.equal(progress.length, 1);
    assert.equal(progress[0].position, account.label === "A" ? 90000 : 180000);
    assert.ok((await api.rpc("sync_pull_library_delta", { p_profile_id: 1 })).length > 0);
    assert.ok((await api.rpc("sync_pull_watch_progress_delta", { p_profile_id: 1 })).length > 0);
    for (const table of ["profiles", "addons", "library_items", "watch_progress"]) {
      assert.ok((await api.select(table)).every((row) => row.user_id === account.id));
      assert.deepEqual(await api.select(table, `user_id=eq.${other.id}`), []);
    }
    const moved = await request(
      `/rest/v1/profiles?user_id=eq.${account.id}`,
      { user_id: other.id },
      session.accessToken,
      "PATCH"
    );
    assert.equal(moved.status, 403, "Ownership cannot be reassigned");
    const patched = await request(
      `/rest/v1/library_items?user_id=eq.${other.id}`,
      { name: "Illegal" },
      session.accessToken,
      "PATCH"
    );
    assert.deepEqual(patched.body, []);
    await api.delete("library_items", `user_id=eq.${other.id}`);
    const injected = await request("/rest/v1/library_items", {
      user_id: other.id,
      profile_id: 1,
      content_id: "illegal",
      content_type: "movie",
      name: "Illegal"
    });
    assert.equal(injected.status, 403);
    assert.equal((await request("/rest/v1/rpc/cleanup_anonymous_users", {})).status, 403);
    await auth.signOut();
  }
  assert.equal((await request("/rest/v1/profiles", null, null, "GET")).status, 401);
  assert.equal((await request("/rest/v1/rpc/sync_pull_profiles", {}, null)).status, 401);
  assert.equal(
    (
      await request(
        "/rest/v1/rpc/start_tv_login_session",
        { p_device_nonce: "test", p_redirect_base_url: "https://example.com" },
        null
      )
    ).status,
    401
  );
  console.log(
    "PASS LIVE: Auth login/refresh, sessions, profiles, addons, library, progress, deltas, profile scope, two-account RLS and anonymous/internal RPC denial."
  );
  if (!settings.body.mailer_autoconfirm)
    console.log(
      "Signup email delivery requires a verified SMTP sender and an owned recipient address."
    );
}
