import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { queueProfileSettingsCloudSync } from "./profileScopedStore.js";

const KEY = "trackPreferences";
const PASSTHROUGH_KEY = "trackPreferenceSyncPayload";
const MAX_ENTRIES = 500;

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

function normalizeText(value) {
  return String(value ?? "").trim() || null;
}

function normalizeAudioPreference(value = {}) {
  const preference = {
    language: normalizeText(value?.language),
    name: normalizeText(value?.name),
    trackId: normalizeText(value?.trackId)
  };
  return Object.values(preference).some(Boolean) ? preference : null;
}

function normalizeSubtitlePreference(value = {}) {
  const type = String(value?.type || "")
    .trim()
    .toUpperCase();
  if (!["INTERNAL", "ADDON", "DISABLED"].includes(type)) {
    return null;
  }
  if (type === "DISABLED") {
    return { type };
  }

  if (type === "INTERNAL") {
    const preference = {
      type,
      language: normalizeText(value?.language),
      name: normalizeText(value?.name),
      trackId: normalizeText(value?.trackId),
      isForced: typeof value?.isForced === "boolean" ? value.isForced : null
    };
    return preference.language ||
      preference.name ||
      preference.trackId ||
      preference.isForced != null
      ? preference
      : null;
  }

  const preference = {
    type,
    language: normalizeText(value?.language),
    addonId: normalizeText(value?.addonId),
    addonUrl: normalizeText(value?.addonUrl),
    addonName: normalizeText(value?.addonName)
  };
  return preference.language || preference.addonId || preference.addonUrl || preference.addonName
    ? preference
    : null;
}

function readAll() {
  const raw = LocalStore.get(KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function writeAll(next) {
  LocalStore.set(KEY, next && typeof next === "object" ? next : {});
}

function readEntries(profileId = activeProfileId()) {
  const entries = readAll()[String(profileId || "1")];
  return Array.isArray(entries)
    ? entries.filter((entry) => entry && typeof entry === "object" && entry.contentId)
    : [];
}

function writeEntries(profileId, entries) {
  const all = readAll();
  all[String(profileId || "1")] = entries;
  writeAll(all);
}

function readPassthrough(profileId) {
  const all = LocalStore.get(PASSTHROUGH_KEY, {});
  const payload = all?.[String(profileId || "1")];
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function writePassthrough(profileId, payload) {
  const all = LocalStore.get(PASSTHROUGH_KEY, {});
  const normalizedAll = all && typeof all === "object" && !Array.isArray(all) ? all : {};
  normalizedAll[String(profileId || "1")] = payload;
  LocalStore.set(PASSTHROUGH_KEY, normalizedAll);
}

function contentIdFromKey(keyName, field) {
  const prefix = `${field}|`;
  return String(keyName || "").startsWith(prefix) ? String(keyName).slice(prefix.length) : null;
}

const AUDIO_SYNC_FIELDS = ["audio_lang", "audio_name", "audio_track_id"];
const SUBTITLE_SYNC_FIELDS = [
  "sub_type",
  "sub_lang",
  "sub_name",
  "sub_track_id",
  "sub_is_forced",
  "sub_addon_id",
  "sub_addon_url",
  "sub_addon_name"
];

function readSubtitleBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function deleteSyncFieldsForContent(payload, fields, contentId) {
  fields.forEach((field) => {
    delete payload[`${field}|${contentId}`];
  });
}

function subtitlePreferenceFromSyncPayload(payload, contentId) {
  return normalizeSubtitlePreference({
    type: payload[`sub_type|${contentId}`],
    language: payload[`sub_lang|${contentId}`],
    name: payload[`sub_name|${contentId}`],
    trackId: payload[`sub_track_id|${contentId}`],
    isForced: readSubtitleBoolean(payload[`sub_is_forced|${contentId}`]),
    addonId: payload[`sub_addon_id|${contentId}`],
    addonUrl: payload[`sub_addon_url|${contentId}`],
    addonName: payload[`sub_addon_name|${contentId}`]
  });
}

export const TrackPreferencesStore = {
  getAudio(contentId, profileId = activeProfileId()) {
    const normalizedContentId = normalizeText(contentId);
    if (!normalizedContentId) {
      return null;
    }
    const entry = readEntries(profileId).find(
      (candidate) => candidate.contentId === normalizedContentId
    );
    return normalizeAudioPreference(entry?.audio);
  },

  setAudio(contentId, audio, profileId = activeProfileId()) {
    const normalizedContentId = normalizeText(contentId);
    const normalizedAudio = normalizeAudioPreference(audio);
    if (!normalizedContentId || !normalizedAudio) {
      return;
    }

    const entries = readEntries(profileId);
    const current = entries.find((entry) => entry.contentId === normalizedContentId) || {};
    const nextEntries = entries.filter((entry) => entry.contentId !== normalizedContentId);
    nextEntries.unshift({
      ...current,
      contentId: normalizedContentId,
      audio: normalizedAudio,
      updatedAtMs: Date.now()
    });
    if (nextEntries.length > MAX_ENTRIES) {
      nextEntries.length = MAX_ENTRIES;
    }
    writeEntries(profileId, nextEntries);
    queueProfileSettingsCloudSync(profileId);
  },

  getSubtitle(contentId, profileId = activeProfileId()) {
    const normalizedContentId = normalizeText(contentId);
    if (!normalizedContentId) {
      return null;
    }
    const entry = readEntries(profileId).find(
      (candidate) => candidate.contentId === normalizedContentId
    );
    return (
      normalizeSubtitlePreference(entry?.subtitle) ||
      subtitlePreferenceFromSyncPayload(readPassthrough(profileId), normalizedContentId)
    );
  },

  setSubtitle(contentId, subtitle, profileId = activeProfileId()) {
    const normalizedContentId = normalizeText(contentId);
    const normalizedSubtitle = normalizeSubtitlePreference(subtitle);
    if (!normalizedContentId || !normalizedSubtitle) {
      return;
    }

    const entries = readEntries(profileId);
    const current = entries.find((entry) => entry.contentId === normalizedContentId) || {};
    const nextEntries = entries.filter((entry) => entry.contentId !== normalizedContentId);
    nextEntries.unshift({
      ...current,
      contentId: normalizedContentId,
      subtitle: normalizedSubtitle,
      updatedAtMs: Date.now()
    });
    if (nextEntries.length > MAX_ENTRIES) {
      nextEntries.length = MAX_ENTRIES;
    }
    writeEntries(profileId, nextEntries);
    queueProfileSettingsCloudSync(profileId);
  },

  exportFeaturePayload(profileId = activeProfileId()) {
    const payload = { ...readPassthrough(profileId) };
    readEntries(profileId).forEach((entry) => {
      const contentId = normalizeText(entry?.contentId);
      if (!contentId) return;

      const audio = normalizeAudioPreference(entry?.audio);
      const subtitle = normalizeSubtitlePreference(entry?.subtitle);
      if (audio) {
        deleteSyncFieldsForContent(payload, AUDIO_SYNC_FIELDS, contentId);
        if (audio.language) payload[`audio_lang|${contentId}`] = audio.language;
        if (audio.name) payload[`audio_name|${contentId}`] = audio.name;
        if (audio.trackId) payload[`audio_track_id|${contentId}`] = audio.trackId;
      }

      if (!subtitle) return;
      deleteSyncFieldsForContent(payload, SUBTITLE_SYNC_FIELDS, contentId);
      payload[`sub_type|${contentId}`] = subtitle.type;
      if (subtitle.language) payload[`sub_lang|${contentId}`] = subtitle.language;
      if (subtitle.name) payload[`sub_name|${contentId}`] = subtitle.name;
      if (subtitle.trackId) payload[`sub_track_id|${contentId}`] = subtitle.trackId;
      if (subtitle.isForced != null)
        payload[`sub_is_forced|${contentId}`] = String(subtitle.isForced);
      if (subtitle.addonId) payload[`sub_addon_id|${contentId}`] = subtitle.addonId;
      if (subtitle.addonUrl) payload[`sub_addon_url|${contentId}`] = subtitle.addonUrl;
      if (subtitle.addonName) payload[`sub_addon_name|${contentId}`] = subtitle.addonName;
    });
    return payload;
  },

  importFeaturePayload(rawFeature = {}, profileId = activeProfileId()) {
    const source =
      rawFeature && typeof rawFeature === "object" && !Array.isArray(rawFeature) ? rawFeature : {};
    writePassthrough(profileId, { ...source });
    const byContentId = new Map();
    Object.entries(source).forEach(([keyName, value]) => {
      const field = [...AUDIO_SYNC_FIELDS, ...SUBTITLE_SYNC_FIELDS].find((candidate) =>
        String(keyName).startsWith(`${candidate}|`)
      );
      if (!field) return;
      const contentId = contentIdFromKey(keyName, field);
      if (!contentId) return;
      const current = byContentId.get(contentId) || {};
      if (field.startsWith("audio_")) {
        current.audio = current.audio || {};
        if (field === "audio_lang") current.audio.language = normalizeText(value);
        if (field === "audio_name") current.audio.name = normalizeText(value);
        if (field === "audio_track_id") current.audio.trackId = normalizeText(value);
      } else {
        current.subtitle = current.subtitle || {};
        if (field === "sub_type") current.subtitle.type = normalizeText(value);
        if (field === "sub_lang") current.subtitle.language = normalizeText(value);
        if (field === "sub_name") current.subtitle.name = normalizeText(value);
        if (field === "sub_track_id") current.subtitle.trackId = normalizeText(value);
        if (field === "sub_is_forced") current.subtitle.isForced = readSubtitleBoolean(value);
        if (field === "sub_addon_id") current.subtitle.addonId = normalizeText(value);
        if (field === "sub_addon_url") current.subtitle.addonUrl = normalizeText(value);
        if (field === "sub_addon_name") current.subtitle.addonName = normalizeText(value);
      }
      byContentId.set(contentId, current);
    });

    if (!byContentId.size) return Object.keys(source).length > 0;

    const existingByContentId = new Map(
      readEntries(profileId).map((entry) => [entry.contentId, entry])
    );
    byContentId.forEach((partial, contentId) => {
      const current = existingByContentId.get(contentId) || { contentId };
      existingByContentId.set(contentId, {
        ...current,
        ...(Object.prototype.hasOwnProperty.call(partial, "audio")
          ? { audio: normalizeAudioPreference(partial.audio) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(partial, "subtitle")
          ? { subtitle: normalizeSubtitlePreference(partial.subtitle) }
          : {}),
        contentId,
        updatedAtMs: Date.now()
      });
    });
    const importedEntries = Array.from(existingByContentId.values()).sort(
      (left, right) => Number(right.updatedAtMs || 0) - Number(left.updatedAtMs || 0)
    );
    writeEntries(profileId, importedEntries.slice(0, MAX_ENTRIES));
    return true;
  }
};
