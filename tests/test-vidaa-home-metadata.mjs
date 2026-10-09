import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key)
};
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.__NUVIO_ENV__ = { TMDB_API_KEY: "fixture-build-key" };
const {
  Router, ProfileManager, LayoutPreferences, TmdbSettingsStore, mdbListRepository,
  metaRepository, TmdbService, TmdbMetadataService, MdbListSettingsStore
} = await import("../js/ui/screens/home/homeScreenContext.js").then(async (context) => ({
  ...context,
  ...(await import("../js/data/local/mdbListSettingsStore.js"))
}));
const { createHomeScreenMethods11 } = await import("../js/ui/screens/home/homeScreenMethods-11-enrich-current-hero-async.js");
const { createHomeScreenMethods27 } = await import("../js/ui/screens/home/homeScreenMethods-27-enrich-continue-watching.js");
const { createHomeScreenMethods26 } = await import("../js/ui/screens/home/homeScreenMethods-26-build-next-up-items.js");
const { shouldEnrichModernHero } = await import("../js/ui/screens/home/homeScreenHelpers-02-extract-release-date-text.js");
const { homeMetadataSettingsSignature } = await import("../js/ui/screens/home/homeMetadataSettings.js");
const {
  getCachedContinueWatchingEnrichment, saveContinueWatchingEnrichment,
  readContinueWatchingDisplaySnapshot, writeContinueWatchingDisplaySnapshot
} = await import("../js/ui/screens/home/homeScreenHelpers-10-get-cached-continue-watching-enrichment.js");
const { needsContinueWatchingMetadataRefresh } = await import("../js/ui/screens/home/homeScreenHelpers-09-normalize-continue-watching-item.js");

let profile = "profile-a";
let route = "home";
let settings = {
  enabled: true, modernHomeEnabled: true, enrichContinueWatching: true,
  language: "it-IT", apiKey: "fixture-personal-key", useBasicInfo: true,
  useArtwork: true, useDetails: true, useEpisodes: true, useReleaseDates: false
};
ProfileManager.getActiveProfileId = () => profile;
Router.getCurrent = () => route;
TmdbSettingsStore.get = () => settings;
LayoutPreferences.get = () => ({ preferExternalMetaAddonDetail: true });
MdbListSettingsStore.get = () => ({ enabled: true, apiKey: "fixture-mdb-key", showImdb: true });
TmdbService.ensureTmdbId = async () => 99;
const italian = {
  localizedTitle: "Titolo italiano", description: "Descrizione italiana",
  logo: "https://example.test/it-logo.png", backdrop: "https://example.test/it.jpg",
  poster: "https://example.test/it-poster.jpg", genres: ["Avventura"]
};
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
function heroState(layoutMode = "modern") {
  const hero = { id: "tt0099", type: "movie", name: "English title", description: "English overview" };
  return {
    ...createHomeScreenMethods11(), layoutMode, heroItem: hero, heroCandidates: [hero], rows: [],
    heroFocusToken: 1, commits: [],
    getCurrentFocusedNode: () => ({ hero }), getNodeHeroSource: (node) => node.hero,
    waitForVidaaHomeLoadingIdle: async (canCommit) => canCommit(),
    applyHeroToDom() { this.commits.push({ ...this.heroItem }); }
  };
}

for (const addonSuccess of [false, true]) {
  const tmdb = deferred();
  const addon = deferred();
  const mdb = deferred();
  TmdbMetadataService.fetchEnrichment = () => tmdb.promise;
  metaRepository.getMetaFromAllAddons = () => addon.promise;
  mdbListRepository.getImdbRatingForItem = () => mdb.promise;
  const state = heroState();
  const pending = state.enrichCurrentHeroAsync(state.heroItem, 1, { deferCommit: true });
  await flush();
  tmdb.resolve(italian);
  await flush();
  assert.equal(state.heroItem.description, italian.description, "TMDB publishes without waiting for MDBList");
  assert.equal(state.heroItem.heroMetaEnriched, false, "addon completion cannot suppress pending enrichment");
  addon.resolve(addonSuccess ? { status: "success", data: { description: "Late English overview", logo: "english.png" } } : { status: "error" });
  await flush();
  assert.equal(state.heroItem.description, italian.description, "late addon result preserves Italian TMDB metadata");
  mdb.resolve(8.7);
  await pending;
  assert.equal(state.heroItem.logo, italian.logo);
  assert.equal(state.heroItem.poster, italian.poster);
  assert.equal(state.heroItem.imdbRating, 8.7);
  assert.equal(shouldEnrichModernHero(state.heroItem), false);
  settings = { ...settings, language: "en" };
  assert.equal(shouldEnrichModernHero(state.heroItem), true, "language change invalidates enriched hero");
  settings = { ...settings, language: "it-IT" };
}

// Classic and grid carousels accept enrichment even when focus is on another row.
for (const layout of ["classic", "grid"]) {
  const state = heroState(layout);
  state.getCurrentFocusedNode = () => ({ hero: { id: "other", type: "movie" } });
  TmdbMetadataService.fetchEnrichment = async () => italian;
  metaRepository.getMetaFromAllAddons = async () => ({ status: "error" });
  mdbListRepository.getImdbRatingForItem = async () => null;
  await state.enrichCurrentHeroAsync(state.heroItem);
  assert.equal(state.heroItem.description, italian.description);
}

// Repainting during a request must not launch the same requests repeatedly.
{
  const tmdb = deferred();
  let requests = 0;
  TmdbMetadataService.fetchEnrichment = () => { requests++; return tmdb.promise; };
  const state = heroState();
  const pending = state.enrichCurrentHeroAsync(state.heroItem, 1);
  await flush();
  await state.enrichCurrentHeroAsync(state.heroItem, 1);
  assert.equal(requests, 1);
  profile = "profile-b";
  tmdb.resolve(italian);
  await pending;
  assert.ok(state.commits.every((item) => item.description !== italian.description), "old profile response cannot commit");
  profile = "profile-a";
}

// Provider errors stay retryable when Home only uses MDBList/addon metadata.
{
  const previousSettings = settings;
  settings = { ...settings, enabled: false };
  const state = heroState();
  metaRepository.getMetaFromAllAddons = async () => ({ status: "error" });
  mdbListRepository.getImdbRatingForItem = async () => null;
  await state.enrichCurrentHeroAsync(state.heroItem, 1);
  assert.equal(shouldEnrichModernHero(state.heroItem), true);
  mdbListRepository.getImdbRatingForItem = async () => 8.2;
  await state.enrichCurrentHeroAsync(state.heroItem, 1);
  assert.equal(state.heroItem.imdbRating, 8.2);
  assert.equal(shouldEnrichModernHero(state.heroItem), false);
  settings = previousSettings;
}

const cwItem = {
  contentId: "tt0099", contentType: "movie", title: "Titolo italiano",
  poster: "https://example.test/poster.jpg", description: "Descrizione italiana",
  continueWatchingMetaResolved: true, continueWatchingTmdbEnriched: true,
  continueWatchingEnrichmentSignature: homeMetadataSettingsSignature()
};
saveContinueWatchingEnrichment(cwItem);
writeContinueWatchingDisplaySnapshot("fixture-source", [cwItem]);
assert.ok(getCachedContinueWatchingEnrichment(cwItem));
assert.equal(readContinueWatchingDisplaySnapshot("fixture-source").length, 1);
assert.equal(needsContinueWatchingMetadataRefresh([cwItem]), false);
assert.ok(!homeMetadataSettingsSignature().includes("fixture-personal-key"));
assert.ok(!homeMetadataSettingsSignature().includes("fixture-mdb-key"));
settings = { ...settings, language: "en" };
assert.equal(getCachedContinueWatchingEnrichment(cwItem), null, "cache follows language");
assert.deepEqual(readContinueWatchingDisplaySnapshot("fixture-source"), [], "snapshot follows language");
assert.equal(needsContinueWatchingMetadataRefresh([cwItem]), true);
saveContinueWatchingEnrichment(cwItem);
assert.equal(getCachedContinueWatchingEnrichment(cwItem), null, "stale response is not cached under new language");
settings = { ...settings, language: "it-IT" };
profile = "profile-b";
assert.equal(getCachedContinueWatchingEnrichment(cwItem), null, "cache follows profile");
profile = "profile-a";

// A profile switch during CW enrichment cannot save a result to the new profile.
{
  const response = deferred();
  const methods = createHomeScreenMethods27();
  const state = {
    ...methods, layoutPrefs: {}, buildNextUpItems: async () => [],
    fetchMetaForContinueWatching: async () => ({ id: "tt0100", name: "English title" }),
    enrichContinueWatchingMetaWithTmdb: () => response.promise
  };
  const item = { ...cwItem, contentId: "tt0100", title: "English title", continueWatchingEnrichmentSignature: "old" };
  const pending = state.enrichContinueWatching([item], { forceRefreshMetadata: true });
  await flush();
  profile = "profile-b";
  response.resolve({ id: item.contentId, name: italian.localizedTitle, poster: italian.poster, description: italian.description });
  await pending;
  assert.equal(getCachedContinueWatchingEnrichment(item), null);
  profile = "profile-a";
}

// CW accepts slow provider responses too; its caller no longer discards them at 2s.
{
  const response = deferred();
  TmdbMetadataService.fetchEnrichment = () => response.promise;
  const state = createHomeScreenMethods26();
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay <= 2500) {
      queueMicrotask(callback);
      return 0;
    }
    return originalTimeout(callback, delay, ...args);
  };
  try {
    const pending = state.enrichContinueWatchingMetaWithTmdb({ id: "tt0099", type: "movie", name: "English" }, cwItem);
    await flush();
    response.resolve(italian);
    const result = await pending;
    assert.equal(result.description, italian.description);
    assert.equal(result.continueWatchingTmdbEnriched, true);
  } finally {
    globalThis.setTimeout = originalTimeout;
  }
}
console.log("Home metadata checks passed: localization ordering, provider independence, carousel layouts, profile/language cache isolation and stale responses.");
