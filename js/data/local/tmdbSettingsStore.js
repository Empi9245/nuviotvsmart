import { createProfileScopedStore } from "./profileScopedStore.js";
import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const KEY = "tmdbSettings";
const API_KEYS_KEY = "tmdbApiKeys";
let apiKeysMigrated = false;

const DEFAULTS = {
  enabled: false,
  modernHomeEnabled: true,
  enrichContinueWatching: true,
  language: "en",
  useArtwork: true,
  useBasicInfo: true,
  useDetails: true,
  useReleaseDates: false,
  useCredits: true,
  useProductions: true,
  useNetworks: true,
  useEpisodes: true,
  useTrailers: true,
  useMoreLikeThis: true,
  useCollections: true
};

export function normalizeTmdbLanguageCode(value = DEFAULTS.language) {
  const normalized = String(value || DEFAULTS.language)
    .trim()
    .replace(/_/g, "-");
  if (!normalized) {
    return DEFAULTS.language;
  }

  const [rawLanguage = DEFAULTS.language, rawRegion = ""] = normalized.split("-", 2);
  const language = rawLanguage.toLowerCase() || DEFAULTS.language;
  const region = /^[a-z]{2}$/i.test(rawRegion) ? rawRegion.toUpperCase() : rawRegion;
  return region ? `${language}-${region}` : language;
}

function normalizeTmdbSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: Boolean(source.enabled),
    modernHomeEnabled:
      source.modernHomeEnabled === undefined
        ? DEFAULTS.modernHomeEnabled
        : Boolean(source.modernHomeEnabled),
    enrichContinueWatching: source.enrichContinueWatching !== false,
    language: normalizeTmdbLanguageCode(source.language),
    useArtwork: source.useArtwork !== false,
    useBasicInfo: source.useBasicInfo !== false,
    useDetails: source.useDetails !== false,
    useReleaseDates: source.useReleaseDates === true,
    useCredits: source.useCredits !== false,
    useProductions: source.useProductions !== false,
    useNetworks: source.useNetworks !== false,
    useEpisodes: source.useEpisodes !== false,
    useTrailers: source.useTrailers !== false,
    useMoreLikeThis: source.useMoreLikeThis !== false,
    useCollections: source.useCollections !== false
  };
}

const store = createProfileScopedStore({
  key: KEY,
  normalize: normalizeTmdbSettings
});

function resolveProfileId(profileId) {
  return String(profileId ?? ProfileManager.getActiveProfileId() ?? "1").trim() || "1";
}

function readApiKeys() {
  const stored = LocalStore.get(API_KEYS_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function migrateApiKeys() {
  if (apiKeysMigrated) return;
  const raw = LocalStore.get(KEY, null);
  const apiKeys = readApiKeys();
  const profiles =
    raw?.__profileScoped === true && raw?.profiles && typeof raw.profiles === "object"
      ? raw.profiles
      : raw && typeof raw === "object"
        ? { 1: raw }
        : {};
  let changed = false;
  for (const [profileId, value] of Object.entries(profiles)) {
    const apiKey = String(value?.apiKey || "").trim();
    if (apiKey && !Object.prototype.hasOwnProperty.call(apiKeys, profileId)) {
      apiKeys[profileId] = apiKey;
      changed = true;
    }
  }
  if (changed) LocalStore.set(API_KEYS_KEY, apiKeys);
  apiKeysMigrated = true;
}

function saveApiKey(profileId, value) {
  const apiKeys = readApiKeys();
  const apiKey = String(value || "").trim();
  if (apiKey) apiKeys[profileId] = apiKey;
  else delete apiKeys[profileId];
  LocalStore.set(API_KEYS_KEY, apiKeys);
}

function settingsWithoutApiKey(value) {
  const settings = value && typeof value === "object" ? { ...value } : {};
  delete settings.apiKey;
  return settings;
}

export const TmdbSettingsStore = {
  getForProfile(profileId) {
    migrateApiKeys();
    const id = resolveProfileId(profileId);
    return { ...store.getForProfile(id), apiKey: String(readApiKeys()[id] || "").trim() };
  },

  get() {
    return this.getForProfile(resolveProfileId());
  },

  replaceForProfile(profileId, nextValue, options = {}) {
    migrateApiKeys();
    const id = resolveProfileId(profileId);
    if (nextValue && Object.prototype.hasOwnProperty.call(nextValue, "apiKey"))
      saveApiKey(id, nextValue.apiKey);
    store.replaceForProfile(id, settingsWithoutApiKey(nextValue), options);
    return this.getForProfile(id);
  },

  setForProfile(profileId, partial, options = {}) {
    migrateApiKeys();
    const id = resolveProfileId(profileId);
    if (partial && Object.prototype.hasOwnProperty.call(partial, "apiKey"))
      saveApiKey(id, partial.apiKey);
    const preferences = settingsWithoutApiKey(partial);
    if (Object.keys(preferences).length) store.setForProfile(id, preferences, options);
    return this.getForProfile(id);
  },

  set(partial, options = {}) {
    return this.setForProfile(resolveProfileId(options.profileId), partial, options);
  }
};
