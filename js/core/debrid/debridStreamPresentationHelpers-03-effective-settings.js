import { DebridSettingsStore } from "../../data/local/debridSettingsStore.js";

import { DebridProviders } from "./debridProviders.js";

import { DebridStreamTemplateEngine } from "./debridStreamTemplateEngine.js";

import { sizeBytesFromStreamText } from "./streamTextSizeParser.js";

import { resolutionFromFields } from "./streamResolution.js";

import {
  DEFAULT_RESOLUTION_ORDER,
  DEFAULT_QUALITY_ORDER,
  DEFAULT_VISUAL_TAG_ORDER,
  DEFAULT_AUDIO_TAG_ORDER,
  DEFAULT_AUDIO_CHANNEL_ORDER,
  DEFAULT_ENCODE_ORDER,
  ORIGINAL_SORT_CRITERIA
} from "./debridStreamPresentationHelpers-01-resolution-labels.js";

export function effectiveSettings(settings = {}) {
  const preferences = settings.streamPreferences && typeof settings.streamPreferences === "object" ? settings.streamPreferences : null;
  const defaultPreferences = {
    maxResults: 0,
    maxPerResolution: 0,
    maxPerQuality: 0,
    sizeMinGb: 0,
    sizeMaxGb: 0,
    preferredResolutions: DEFAULT_RESOLUTION_ORDER,
    requiredResolutions: [],
    excludedResolutions: [],
    preferredQualities: DEFAULT_QUALITY_ORDER,
    requiredQualities: [],
    excludedQualities: [],
    preferredVisualTags: DEFAULT_VISUAL_TAG_ORDER,
    requiredVisualTags: [],
    excludedVisualTags: [],
    preferredAudioTags: DEFAULT_AUDIO_TAG_ORDER,
    requiredAudioTags: [],
    excludedAudioTags: [],
    preferredAudioChannels: DEFAULT_AUDIO_CHANNEL_ORDER,
    requiredAudioChannels: [],
    excludedAudioChannels: [],
    preferredEncodes: DEFAULT_ENCODE_ORDER,
    requiredEncodes: [],
    excludedEncodes: [],
    preferredLanguages: [],
    requiredLanguages: [],
    excludedLanguages: [],
    requiredReleaseGroups: [],
    excludedReleaseGroups: [],
    sortCriteria: ORIGINAL_SORT_CRITERIA
  };
  if (preferences) {
    return {
      ...defaultPreferences,
      ...preferences,
      maxResults: Number(preferences.maxResults ?? 0) || 0,
      maxPerResolution: Number(preferences.maxPerResolution ?? 0) || 0,
      maxPerQuality: Number(preferences.maxPerQuality ?? 0) || 0,
      sizeMinGb: Number(preferences.sizeMinGb ?? 0) || 0,
      sizeMaxGb: Number(preferences.sizeMaxGb ?? 0) || 0,
      sortCriteria: Array.isArray(preferences.sortCriteria) ? preferences.sortCriteria : ORIGINAL_SORT_CRITERIA
    };
  }
  const minQuality = String(settings.streamMinimumQuality || "ANY").toUpperCase();
  const dolbyVisionFilter = String(settings.streamDolbyVisionFilter || "ANY").toUpperCase();
  const hdrFilter = String(settings.streamHdrFilter || "ANY").toUpperCase();
  const codecFilter = String(settings.streamCodecFilter || "ANY").toUpperCase();
  const sortMode = String(settings.streamSortMode || "DEFAULT").toUpperCase();
  const legacy = {
    ...defaultPreferences,
    maxResults: Number(settings.streamMaxResults ?? 0) || 0,
    requiredResolutions:
      minQuality === "P2160"
        ? ["P2160"]
        : minQuality === "P1080"
          ? ["P2160", "P1440", "P1080"]
          : minQuality === "P720"
            ? ["P2160", "P1440", "P1080", "P720"]
            : []
  };
  if (dolbyVisionFilter === "EXCLUDE") legacy.excludedVisualTags = ["DV", "DV_ONLY", "HDR_DV"];
  if (dolbyVisionFilter === "ONLY") legacy.requiredVisualTags = ["DV", "DV_ONLY", "HDR_DV"];
  if (hdrFilter === "EXCLUDE")
    legacy.excludedVisualTags = [...legacy.excludedVisualTags, "HDR", "HDR10", "HDR10_PLUS", "HLG", "HDR_ONLY", "HDR_DV"];
  if (hdrFilter === "ONLY")
    legacy.requiredVisualTags = [...legacy.requiredVisualTags, "HDR", "HDR10", "HDR10_PLUS", "HLG", "HDR_ONLY", "HDR_DV"];
  if (codecFilter === "H264") legacy.requiredEncodes = ["AVC"];
  if (codecFilter === "HEVC") legacy.requiredEncodes = ["HEVC"];
  if (codecFilter === "AV1") legacy.requiredEncodes = ["AV1"];
  if (sortMode === "QUALITY_DESC") {
    legacy.sortCriteria = [
      { key: "RESOLUTION", direction: "DESC" },
      { key: "QUALITY", direction: "DESC" },
      { key: "SIZE", direction: "DESC" }
    ];
  } else if (sortMode === "SIZE_DESC") {
    legacy.sortCriteria = [{ key: "SIZE", direction: "DESC" }];
  } else if (sortMode === "SIZE_ASC") {
    legacy.sortCriteria = [{ key: "SIZE", direction: "ASC" }];
  }
  return legacy;
}

export function includesAny(values = [], required = []) {
  return (values || []).some((value) => (required || []).includes(value));
}

export function equalsAnyReleaseGroup(value = "", groups = []) {
  return (groups || []).some(
    (group) =>
      String(value || "").toLowerCase() ===
      String(group || "")
        .trim()
        .toLowerCase()
  );
}

export function matchesFilters(fact, preferences) {
  if (preferences.requiredResolutions?.length && !preferences.requiredResolutions.includes(fact.resolution)) return false;
  if (preferences.excludedResolutions?.includes(fact.resolution)) return false;
  if (preferences.requiredQualities?.length && !preferences.requiredQualities.includes(fact.quality)) return false;
  if (preferences.excludedQualities?.includes(fact.quality)) return false;
  if (preferences.requiredVisualTags?.length && !includesAny(fact.visualTags, preferences.requiredVisualTags)) return false;
  if (includesAny(fact.visualTags, preferences.excludedVisualTags)) return false;
  if (preferences.requiredAudioTags?.length && !includesAny(fact.audioTags, preferences.requiredAudioTags)) return false;
  if (includesAny(fact.audioTags, preferences.excludedAudioTags)) return false;
  if (preferences.requiredAudioChannels?.length && !includesAny(fact.audioChannels, preferences.requiredAudioChannels)) return false;
  if (includesAny(fact.audioChannels, preferences.excludedAudioChannels)) return false;
  if (preferences.requiredEncodes?.length && !preferences.requiredEncodes.includes(fact.codec)) return false;
  if (preferences.excludedEncodes?.includes(fact.codec)) return false;
  if (preferences.requiredLanguages?.length && !includesAny(fact.languages, preferences.requiredLanguages)) return false;
  if (fact.languages.length && fact.languages.every((language) => preferences.excludedLanguages?.includes(language))) return false;
  if (preferences.requiredReleaseGroups?.length && !equalsAnyReleaseGroup(fact.releaseGroup, preferences.requiredReleaseGroups))
    return false;
  if (equalsAnyReleaseGroup(fact.releaseGroup, preferences.excludedReleaseGroups)) return false;
  if (preferences.sizeMinGb > 0 && fact.size && fact.size < preferences.sizeMinGb * 1000000000) return false;
  if (preferences.sizeMaxGb > 0 && fact.size && fact.size > preferences.sizeMaxGb * 1000000000) return false;
  return true;
}

export function rank(value, preferred = []) {
  const index = (preferred || []).indexOf(value);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function rankAny(values = [], preferred = []) {
  return (values || []).reduce((best, value) => Math.min(best, rank(value, preferred)), Number.MAX_SAFE_INTEGER);
}
