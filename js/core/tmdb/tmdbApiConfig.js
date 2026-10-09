import { TMDB_API_KEY } from "../../config.js";
import { TmdbSettingsStore } from "../../data/local/tmdbSettingsStore.js";

export function getTmdbApiKey(settings = TmdbSettingsStore.get()) {
  return String(settings?.apiKey || "").trim() || TMDB_API_KEY;
}

export function isTmdbConfigured(settings = TmdbSettingsStore.get()) {
  return Boolean(getTmdbApiKey(settings));
}

export function hasDefaultTmdbApiKey() {
  return Boolean(TMDB_API_KEY);
}
