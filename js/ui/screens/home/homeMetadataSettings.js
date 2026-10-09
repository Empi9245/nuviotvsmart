import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import { MdbListSettingsStore } from "../../../data/local/mdbListSettingsStore.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { getTmdbApiKey } from "../../../core/tmdb/tmdbApiConfig.js";

export function isHomeTmdbEnabled(layoutMode = "modern", settings = TmdbSettingsStore.get()) {
  return Boolean(
    settings.enabled &&
    getTmdbApiKey(settings) &&
    (layoutMode !== "modern" || settings.modernHomeEnabled)
  );
}

function credentialFingerprint(key) {
  let hash = 2166136261;
  for (const char of String(key || "")) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}

export function homeMetadataSettingsSignature() {
  // Cache identity follows the profile and enrichment preferences without
  // storing API credentials in metadata or cache keys.
  const mdb = MdbListSettingsStore.get();
  const settings = TmdbSettingsStore.get();
  const tmdbPreferences = { ...settings };
  delete tmdbPreferences.apiKey;
  return JSON.stringify([
    ProfileManager.getActiveProfileId(),
    tmdbPreferences,
    credentialFingerprint(getTmdbApiKey(settings)),
    LayoutPreferences.get()?.preferExternalMetaAddonDetail !== false,
    Boolean(mdb.enabled),
    mdb.showImdb !== false,
    credentialFingerprint(mdb.apiKey)
  ]);
}
