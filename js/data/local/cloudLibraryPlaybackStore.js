import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const SESSION_KEY = "cloudLibraryPlaybackSessions";
const PROGRESS_KEY = "cloudLibraryPlaybackProgress";
const MAX_SESSIONS = 8;
const MIN_RESUME_POSITION_MS = 1000;
const COMPLETED_FRACTION = 0.9;

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

function profileKey(key, profileId = activeProfileId()) {
  return `${key}:${String(profileId || "1")}`;
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCloudFile(file = {}) {
  const id = String(file?.id || "").trim() || null;
  const name = String(file?.name || "").trim();
  const stableKey = String(file?.stableKey || id || name).trim();
  if (!stableKey || !name) {
    return null;
  }
  return {
    id,
    name,
    sizeBytes: optionalNumber(file?.sizeBytes),
    mimeType: String(file?.mimeType || "").trim() || null,
    playable: file?.playable !== false,
    stableKey
  };
}

function normalizeCloudItem(item = {}) {
  const providerId = String(item?.providerId || "").trim();
  const providerName = String(item?.providerName || providerId).trim() || providerId;
  const id = String(item?.id || "").trim();
  const type = String(item?.type || "").trim();
  const name = String(item?.name || id).trim() || id;
  const stableKey = String(item?.stableKey || `${providerId}:${type}:${id}`).trim();
  if (!providerId || !id || !type || !stableKey) {
    return null;
  }
  const files = (Array.isArray(item?.files) ? item.files : []).map(normalizeCloudFile).filter(Boolean);
  return {
    providerId,
    providerName,
    id,
    type,
    name,
    status: String(item?.status || "").trim() || null,
    sizeBytes: optionalNumber(item?.sizeBytes),
    progressFraction: optionalNumber(item?.progressFraction),
    files,
    stableKey
  };
}

function normalizePlaybackContext(context = {}) {
  const item = normalizeCloudItem(context?.item || context);
  const currentFileKey = String(context?.currentFileKey || "").trim();
  if (!item || !currentFileKey || !item.files.some((file) => file.stableKey === currentFileKey)) {
    return null;
  }
  return { item, currentFileKey };
}

function readSessions(profileId = activeProfileId()) {
  const value = LocalStore.get(profileKey(SESSION_KEY, profileId), []);
  return (Array.isArray(value) ? value : []).filter((entry) => entry && typeof entry === "object" && entry.token && entry.context);
}

function writeSessions(profileId, entries) {
  LocalStore.set(profileKey(SESSION_KEY, profileId), Array.isArray(entries) ? entries : []);
}

function createSessionToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `cloud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function progressIdentity(item = {}, file = {}) {
  const itemKey = String(item?.stableKey || "").trim();
  const fileKey = String(file?.stableKey || "").trim();
  return itemKey && fileKey ? `${itemKey}\u0000${fileKey}` : "";
}

function readProgress(profileId = activeProfileId()) {
  const value = LocalStore.get(profileKey(PROGRESS_KEY, profileId), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeProgress(progress = {}) {
  const positionMs = Number(progress?.positionMs || 0);
  const durationMs = Number(progress?.durationMs || 0);
  const normalized = {
    positionMs: Number.isFinite(positionMs) && positionMs > 0 ? Math.trunc(positionMs) : 0,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.trunc(durationMs) : 0,
    completed: Boolean(progress?.completed),
    updatedAt: Number.isFinite(Number(progress?.updatedAt)) ? Number(progress.updatedAt) : Date.now()
  };
  const item = normalizeCloudItem(progress?.item);
  const file = normalizeCloudFile(progress?.file);
  const sessionToken = String(progress?.sessionToken || "").trim();
  if (item) {
    normalized.item = item;
  }
  if (file) {
    normalized.file = file;
  }
  if (sessionToken) {
    normalized.sessionToken = sessionToken;
  }
  return normalized;
}

export function cloudPlaybackFileForSession(session = null) {
  if (!session?.item || !session.currentFileKey) {
    return null;
  }
  return (Array.isArray(session.item.files) ? session.item.files : []).find((file) => file?.stableKey === session.currentFileKey) || null;
}

function cloudPlaybackVideoId(item = {}, file = {}) {
  return `${item?.stableKey || ""}:${file?.stableKey || ""}`;
}

function isContinueWatchingProgress(progress = {}) {
  if (!progress || progress.completed || progress.positionMs < MIN_RESUME_POSITION_MS) {
    return false;
  }
  return !(progress.durationMs > 0 && progress.positionMs / progress.durationMs >= COMPLETED_FRACTION);
}

function sessionProgressContextByKey(profileId = activeProfileId()) {
  const byKey = new Map();
  readSessions(profileId).forEach((entry) => {
    const context = normalizePlaybackContext(entry.context);
    const file = cloudPlaybackFileForSession(context);
    const key = context ? progressIdentity(context.item, file) : "";
    if (!key || !file) {
      return;
    }
    const current = byKey.get(key);
    if (!current || Number(entry.updatedAt || 0) > Number(current.updatedAt || 0)) {
      byKey.set(key, {
        item: context.item,
        file,
        sessionToken: String(entry.token || "").trim() || null,
        updatedAt: Number(entry.updatedAt || 0)
      });
    }
  });
  return byKey;
}

function storedProgressEntries(profileId = activeProfileId()) {
  const sessionContexts = sessionProgressContextByKey(profileId);
  return Object.entries(readProgress(profileId))
    .map(([key, rawProgress]) => {
      const progress = normalizeProgress(rawProgress);
      const sessionContext = sessionContexts.get(key) || null;
      const item = progress.item || sessionContext?.item || null;
      const file = progress.file || sessionContext?.file || null;
      if (!item || !file) {
        return null;
      }
      return {
        key,
        item,
        file,
        progress,
        sessionToken: progress.sessionToken || sessionContext?.sessionToken || null
      };
    })
    .filter(Boolean);
}

function toContinueWatchingProgressEntry(entry) {
  if (!entry || !isContinueWatchingProgress(entry.progress)) {
    return null;
  }
  const { item, file, progress } = entry;
  const title = file.name || item.name || item.stableKey;
  return {
    contentId: item.stableKey,
    contentType: "cloud",
    videoId: cloudPlaybackVideoId(item, file),
    title,
    description: item.name !== title ? item.name : "",
    providerName: item.providerName,
    providerAddonId: `cloud:${item.providerId}`,
    positionMs: progress.positionMs,
    durationMs: progress.durationMs,
    progressPercent: progress.durationMs > 0 ? (progress.positionMs / progress.durationMs) * 100 : null,
    updatedAt: progress.updatedAt,
    source: "cloud_local",
    cloudSessionToken: entry.sessionToken || null
  };
}

export const CloudLibraryPlaybackSessionStore = {
  create(context) {
    const normalizedContext = normalizePlaybackContext(context);
    if (!normalizedContext) {
      return null;
    }
    const token = createSessionToken();
    const profileId = activeProfileId();
    const entries = readSessions(profileId).filter((entry) => entry.token !== token);
    entries.unshift({ token, context: normalizedContext, updatedAt: Date.now() });
    writeSessions(profileId, entries.slice(0, MAX_SESSIONS));
    return token;
  },

  load(token, profileId = activeProfileId()) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) {
      return null;
    }
    const entry = readSessions(profileId).find((candidate) => candidate.token === normalizedToken);
    return entry ? normalizePlaybackContext(entry.context) : null;
  },

  update(token, context, profileId = activeProfileId()) {
    const normalizedToken = String(token || "").trim();
    const normalizedContext = normalizePlaybackContext(context);
    if (!normalizedToken || !normalizedContext) {
      return false;
    }
    const entries = readSessions(profileId);
    const index = entries.findIndex((entry) => entry.token === normalizedToken);
    if (index < 0) {
      return false;
    }
    entries[index] = { token: normalizedToken, context: normalizedContext, updatedAt: Date.now() };
    writeSessions(profileId, entries);
    return true;
  }
};

export const CloudLibraryPlaybackProgressStore = {
  load(item, file, profileId = activeProfileId()) {
    const key = progressIdentity(item, file);
    if (!key) {
      return null;
    }
    const progress = readProgress(profileId)[key];
    return progress ? normalizeProgress(progress) : null;
  },

  getResume(item, file, profileId = activeProfileId()) {
    const progress = this.load(item, file, profileId);
    if (!progress || progress.completed || progress.positionMs < MIN_RESUME_POSITION_MS) {
      return null;
    }
    if (progress.durationMs > 0 && progress.positionMs / progress.durationMs >= COMPLETED_FRACTION) {
      return null;
    }
    return progress;
  },

  findForContinueWatching(contentId, videoId, profileId = activeProfileId()) {
    const wantedContentId = String(contentId || "").trim();
    const wantedVideoId = String(videoId || "").trim();
    if (!wantedContentId) {
      return null;
    }
    return (
      storedProgressEntries(profileId).find((entry) => {
        if (!isContinueWatchingProgress(entry.progress)) {
          return false;
        }
        if (entry.item.stableKey !== wantedContentId) {
          return false;
        }
        return !wantedVideoId || cloudPlaybackVideoId(entry.item, entry.file) === wantedVideoId;
      }) || null
    );
  },

  listForContinueWatching(profileId = activeProfileId()) {
    return storedProgressEntries(profileId)
      .map(toContinueWatchingProgressEntry)
      .filter(Boolean)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  },

  removeForContinueWatching(contentId, videoId = null, profileId = activeProfileId()) {
    const wantedContentId = String(contentId || "").trim();
    const wantedVideoId = String(videoId || "").trim();
    if (!wantedContentId) {
      return false;
    }
    const progress = readProgress(profileId);
    const entries = storedProgressEntries(profileId);
    const keysToRemove = entries
      .filter((entry) => {
        if (entry.item.stableKey !== wantedContentId) {
          return false;
        }
        return !wantedVideoId || cloudPlaybackVideoId(entry.item, entry.file) === wantedVideoId;
      })
      .map((entry) => entry.key);
    if (!keysToRemove.length) {
      return false;
    }
    keysToRemove.forEach((key) => delete progress[key]);
    LocalStore.set(profileKey(PROGRESS_KEY, profileId), progress);
    return true;
  },

  save(item, file, positionMs, durationMs, completed = false, sessionToken = null, profileId = activeProfileId()) {
    const key = progressIdentity(item, file);
    if (!key) {
      return false;
    }
    const progress = readProgress(profileId);
    progress[key] = normalizeProgress({
      positionMs,
      durationMs,
      completed,
      updatedAt: Date.now(),
      item,
      file,
      sessionToken
    });
    LocalStore.set(profileKey(PROGRESS_KEY, profileId), progress);
    return true;
  }
};
