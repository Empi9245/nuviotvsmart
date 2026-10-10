import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
  get length() {
    return storage.size;
  },
  key: (index) => [...storage.keys()][index] ?? null
};
const defaultMode = process.argv.includes("--default");
const migrationMode = process.argv.includes("--migration");
if (migrationMode) {
  storage.set(
    "tmdbSettings",
    JSON.stringify({
      __profileScoped: true,
      version: 1,
      profiles: { 1: { enabled: true, language: "it-IT", apiKey: "fixture-interim-key" } }
    })
  );
}
globalThis.__NUVIO_ENV__ = defaultMode ? { TMDB_API_KEY: "fixture-default-key" } : {};
globalThis.__NUVIO_PLATFORM__ = "vidaa";

const { TmdbSettingsStore } = await import("../js/data/local/tmdbSettingsStore.js");
const { getTmdbApiKey, isTmdbConfigured, hasDefaultTmdbApiKey } =
  await import("../js/core/tmdb/tmdbApiConfig.js");
const { validateTmdbApiKey } = await import("../js/core/tmdb/tmdbApiKeyValidation.js");
const { TmdbService } = await import("../js/core/tmdb/tmdbService.js");
const { TmdbMetadataService } = await import("../js/core/tmdb/tmdbMetadataService.js");
const { tmdb_settings } =
  await import("../js/core/profile/profileSettingsSyncFeature-tmdb-settings.js");
const { stopProfileSettingsCloudSync } = await import("../js/data/local/profileScopedStore.js");

if (migrationMode) {
  assert.equal(getTmdbApiKey(), "fixture-interim-key");
  assert.equal(TmdbSettingsStore.getForProfile("4").apiKey, "");
  assert.equal(TmdbSettingsStore.getForProfile("4").language, "it-IT");
  assert.ok(!storage.get("tmdbSettings").includes("fixture-interim-key"));
  const { clearAccountLocalData } = await import("../js/core/auth/accountLocalDataReset.js");
  clearAccountLocalData();
  assert.equal(storage.has("tmdbApiKeys"), false);
  assert.equal(getTmdbApiKey(), "");
  process.exit(0);
}

assert.equal(getTmdbApiKey(), defaultMode ? "fixture-default-key" : "");
assert.equal(isTmdbConfigured(), defaultMode);
assert.equal(hasDefaultTmdbApiKey(), defaultMode);
assert.equal(getTmdbApiKey({ apiKey: "  " }), defaultMode ? "fixture-default-key" : "");

// Enabling TMDB also enriches Modern Home unless the user explicitly disables it.
TmdbSettingsStore.replaceForProfile("3", { enabled: false }, { silentSync: true });
assert.equal(TmdbSettingsStore.getForProfile("3").modernHomeEnabled, true);
TmdbSettingsStore.setForProfile("3", { enabled: true }, { silentSync: true });
assert.equal(TmdbSettingsStore.getForProfile("3").modernHomeEnabled, true);
TmdbSettingsStore.setForProfile("3", { modernHomeEnabled: false }, { silentSync: true });
TmdbSettingsStore.setForProfile("3", { enabled: false }, { silentSync: true });
TmdbSettingsStore.setForProfile("3", { enabled: true }, { silentSync: true });
assert.equal(TmdbSettingsStore.getForProfile("3").modernHomeEnabled, false);

TmdbSettingsStore.setForProfile(
  "1",
  { apiKey: " fixture-personal-key ", enabled: true, language: "it-IT" },
  { silentSync: true }
);
assert.equal(getTmdbApiKey(), "fixture-personal-key");
assert.equal(
  TmdbSettingsStore.getForProfile("4").apiKey,
  "",
  "New profiles must not inherit the primary profile personal key"
);
assert.equal(
  TmdbSettingsStore.getForProfile("4").language,
  "it-IT",
  "New profiles still inherit metadata preferences"
);
assert.equal(
  getTmdbApiKey(TmdbSettingsStore.getForProfile("4")),
  defaultMode ? "fixture-default-key" : ""
);
assert.ok(
  !storage.get("tmdbSettings").includes("fixture-personal-key"),
  "Personal keys are stored separately from syncable preferences"
);
TmdbSettingsStore.replaceForProfile(
  "2",
  { apiKey: "fixture-other-profile-key", enabled: true },
  { silentSync: true }
);
storage.set("activeProfileId", JSON.stringify("2"));
assert.equal(getTmdbApiKey(), "fixture-other-profile-key");
storage.set("activeProfileId", JSON.stringify("1"));
assert.equal(getTmdbApiKey(), "fixture-personal-key");

// Cloud preference imports preserve the local key; exports omit credentials.
tmdb_settings.import("1", { tmdb_language: "fr-FR", tmdb_enabled: true });
assert.equal(getTmdbApiKey(), "fixture-personal-key");
assert.ok(!JSON.stringify(tmdb_settings.export("1")).includes("fixture-personal-key"));
assert.ok(!Object.keys(tmdb_settings.export("1")).some((key) => /key|token/i.test(key)));
TmdbSettingsStore.setForProfile("1", { language: "it-IT" }, { silentSync: true });

let requests = [];
globalThis.fetch = async (url) => {
  const request = new URL(url);
  requests.push(request);
  assert.equal(request.searchParams.get("api_key"), "fixture-personal-key");
  if (request.pathname.includes("/find/")) {
    return { ok: true, json: async () => ({ movie_results: [{ id: 199 }] }) };
  }
  return {
    ok: true,
    json: async () => ({
      title: "Titolo italiano",
      overview: "Descrizione italiana",
      videos: {
        results: [{ site: "YouTube", key: "it-trailer", type: "Trailer", iso_639_1: "it" }]
      }
    })
  };
};
assert.equal(await TmdbService.ensureTmdbId("tt0000199", "movie"), "199");
const metadata = await TmdbMetadataService.fetchEnrichment({ tmdbId: 199, contentType: "movie" });
assert.equal(metadata.description, "Descrizione italiana");
assert.equal(requests.length, 2);

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
assert.equal(await validateTmdbApiKey("fixture-personal-key"), true);
assert.equal(await validateTmdbApiKey(""), false);
globalThis.fetch = async () => ({ ok: false, status: 401 });
assert.equal(await validateTmdbApiKey("fixture-invalid-key"), false);
globalThis.fetch = async () => ({ ok: false, status: 429 });
await assert.rejects(
  validateTmdbApiKey("fixture-personal-key"),
  (error) => error.status === 429 && !error.message.includes("fixture-personal-key")
);
globalThis.fetch = async () => {
  throw new Error("Network unavailable");
};
await assert.rejects(validateTmdbApiKey("fixture-personal-key"), /Network unavailable/);

// Transient failures must remain retryable after a connection/key recovers.
globalThis.fetch = async () => ({ ok: false, status: 503 });
assert.equal(await TmdbService.ensureTmdbId("tt0000299", "movie"), null);
const failedBrowse = await TmdbMetadataService.fetchEntityBrowse({
  entityKind: "company",
  entityId: 299,
  sourceType: "movie",
  fallbackName: "Fallback studio"
});
assert.equal(failedBrowse.header.name, "Fallback studio");
assert.equal(failedBrowse.rails.length, 0);
globalThis.fetch = async (url) => {
  const request = new URL(url);
  return {
    ok: true,
    json: async () =>
      request.pathname.includes("/find/")
        ? { movie_results: [{ id: 299 }] }
        : request.pathname.includes("/company/")
          ? { id: 299, name: "Resolved studio" }
          : {
              results: [{ id: 299, title: "Titolo italiano", poster_path: "/it.jpg" }],
              total_pages: 1
            }
  };
};
assert.equal(await TmdbService.ensureTmdbId("tt0000299", "movie"), "299");
const recoveredBrowse = await TmdbMetadataService.fetchEntityBrowse({
  entityKind: "company",
  entityId: 299,
  sourceType: "movie",
  fallbackName: "Fallback studio"
});
assert.equal(recoveredBrowse.header.name, "Resolved studio");
assert.equal(recoveredBrowse.rails.length, 6);

const { renderTmdbIntegrationDetail } =
  await import("../js/ui/screens/settings/settingsIntegrationDetailTmdb.js");
const originalWarn = console.warn;
console.warn = (...args) => {
  if (!String(args[0]).startsWith("Missing translation for")) originalWarn(...args);
};
const rows = [];
const owner = {
  actionMap: new Map(),
  renderSectionHeader: () => "",
  renderToggleRow: (row) => {
    rows.push(row);
    return "";
  },
  renderActionRow: (row) => {
    rows.push(row);
    return "";
  },
  openTextDialog(dialog) {
    this.textDialog = dialog;
  },
  openOptionDialog(dialog) {
    this.optionDialog = dialog;
  },
  render: async () => {}
};
renderTmdbIntegrationDetail.call(owner, { tmdb: TmdbSettingsStore.get() });
const keyRow = rows.find((row) => row.focusKey === "integration:tmdb:key");
assert.ok(keyRow && !keyRow.value.includes("fixture-personal-key"));
owner.actionMap.get("integration:tmdb:key")();
assert.equal(owner.textDialog.inputType, "password");
const dialog = owner.textDialog;
globalThis.fetch = async () => ({ ok: false, status: 401 });
assert.equal(await dialog.onSubmit("fixture-rejected-key"), false);
assert.equal(getTmdbApiKey(), "fixture-personal-key");
assert.equal(dialog.statusKind, "error");
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
assert.equal(await dialog.onSubmit("fixture-updated-key"), true);
assert.equal(getTmdbApiKey(), "fixture-updated-key");
globalThis.fetch = async () => {
  storage.set("activeProfileId", JSON.stringify("2"));
  return { ok: true, status: 200, json: async () => ({ success: true }) };
};
assert.equal(await dialog.onSubmit("fixture-key-after-profile-switch"), false);
assert.equal(TmdbSettingsStore.getForProfile("1").apiKey, "fixture-updated-key");
assert.equal(TmdbSettingsStore.getForProfile("2").apiKey, "fixture-other-profile-key");
assert.equal(
  dialog.onClear(),
  false,
  "A stale key dialog must not clear credentials after switching profiles"
);
storage.set("activeProfileId", JSON.stringify("1"));
await stopProfileSettingsCloudSync({ waitForInFlight: false });
dialog.onClear();
assert.equal(getTmdbApiKey(), defaultMode ? "fixture-default-key" : "");

// A configured-looking toggle must not silently enable requests with no key.
rows.length = 0;
owner.textDialog = null;
renderTmdbIntegrationDetail.call(owner, { tmdb: TmdbSettingsStore.get() });
const enabledRow = rows.find((row) => row.focusKey === "integration:tmdb:enabled");
assert.equal(enabledRow.checked, defaultMode);
if (!defaultMode) {
  assert.ok(enabledRow.subtitle.includes("API key"));
  assert.equal(rows.find((row) => row.focusKey === "integration:tmdb:language").disabled, true);
  TmdbSettingsStore.set({ enabled: false }, { silentSync: true });
  owner.actionMap.get("integration:tmdb:enabled")();
  assert.equal(TmdbSettingsStore.get().enabled, false);
  assert.equal(owner.textDialog.inputType, "password");
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  assert.equal(await owner.textDialog.onSubmit("fixture-invalid-setup-key"), false);
  assert.equal(TmdbSettingsStore.get().enabled, false);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
  assert.equal(await owner.textDialog.onSubmit("fixture-setup-key"), true);
  assert.equal(TmdbSettingsStore.get().enabled, true);
} else {
  TmdbSettingsStore.set({ enabled: false }, { silentSync: true });
  owner.actionMap.get("integration:tmdb:enabled")();
  assert.equal(TmdbSettingsStore.get().enabled, true);
  assert.equal(owner.textDialog, null);
}

// Select Italian through the production settings dialog, then fetch actual
// production metadata to verify that its API language and artwork agree.
renderTmdbIntegrationDetail.call(owner, { tmdb: TmdbSettingsStore.get() });
owner.actionMap.get("integration:tmdb:language")();
const italianOption = owner.optionDialog.options.find((option) => option.id === "it");
assert.ok(italianOption);
owner.optionDialog.onSelect(italianOption);
assert.equal(TmdbSettingsStore.get().language, "it");
globalThis.fetch = async (url) => {
  const request = new URL(url);
  assert.equal(request.searchParams.get("language"), "it");
  assert.equal(
    request.searchParams.get("api_key"),
    defaultMode ? "fixture-default-key" : "fixture-setup-key"
  );
  assert.ok(request.searchParams.get("include_image_language").split(",").includes("it"));
  return {
    ok: true,
    json: async () => ({
      title: "Titolo italiano",
      overview: "Descrizione italiana dopo la configurazione",
      images: { logos: [{ file_path: "/it-logo.png", iso_639_1: "it" }] },
      videos: {
        results: [{ site: "YouTube", key: "it-trailer", type: "Trailer", iso_639_1: "it" }]
      }
    })
  };
};
const configuredItalianMetadata = await TmdbMetadataService.fetchEnrichment({
  tmdbId: 399,
  contentType: "movie"
});
assert.equal(configuredItalianMetadata.description, "Descrizione italiana dopo la configurazione");
assert.ok(configuredItalianMetadata.logo.endsWith("/it-logo.png"));
await stopProfileSettingsCloudSync({ waitForInFlight: false });
console.warn = originalWarn;

if (!defaultMode) {
  execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--default"], { stdio: "pipe" });
  execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--migration"], {
    stdio: "pipe"
  });
  console.log(
    "TMDB API key checks passed: app entry, validation, masking, per-profile override, optional default and credential-free preference sync."
  );
}
